import { spawn } from 'child_process';
import config from './config.js';

/**
 * Builds the argv array for a `cork-kube build gcb` invocation. Kept as a
 * pure function, separate from spawning, so command construction is
 * unit-testable without touching cork-kube or gcloud.
 *
 * `--no-cache` is always included: the nightly run always does a full
 * rebuild of every selected version rather than checking whether a tagged
 * version was already built. `--notify error` is always included: this is
 * an unattended nightly job, so Slack notifications should only fire when a
 * build actually fails, not on every start/stop. `--no-wait` is always
 * included: it makes `cork-kube` return as soon as Cloud Build accepts the
 * build (printing `{buildId, status}` JSON) instead of streaming logs until
 * the build finishes. The Cloud Run Job itself polls those build IDs wave by
 * wave (see build-executor.js / cloud-build-poller.js) so it still waits for
 * a dependency's build to actually finish before starting a dependent's -
 * the difference from waiting on `cork-kube` directly is that independent
 * projects within a wave are submitted and built in parallel, instead of one
 * at a time.
 *
 * @param {object} opts
 * @param {string} opts.project - Registry project short name.
 * @param {string} opts.version - Build version/tag/branch to build.
 * @param {string} [opts.gcbProject] - GCP project to submit the build to.
 * @param {boolean} [opts.highCpu] - Use a high-cpu Cloud Build machine type.
 * @returns {string[]} argv for `cork-kube`, e.g.
 *   ["build", "gcb", "--project", "fin", "--version", "2.16.0", "--no-cache", "--notify", "error", "--no-wait"].
 */
export function formatCorkKubeGcbArgs({ project, version, gcbProject, highCpu }) {
  const args = ['build', 'gcb', '--project', project, '--version', version, '--no-cache', '--notify', 'error', '--no-wait'];
  if (gcbProject) args.push('--gcb-project', gcbProject);
  if (highCpu) args.push('--high-cpu');
  return args;
}

/**
 * Picks cork-kube's `{buildId, status}` result out of its captured stdout.
 * `cork-kube build gcb --no-wait` also prints human-readable progress lines
 * to stdout before that JSON (e.g. "Using local cork-build-registry
 * directory: ...", "Submitting build to Google Cloud project: ..."), so the
 * JSON can't be assumed to be the only thing stdout contains - this scans
 * lines from the end for the last one that parses as a JSON object with a
 * `status` field, which is robust to whatever else got printed around it.
 *
 * @param {string} stdout - Captured stdout from a cork-kube invocation.
 * @returns {{status: 'success'|'error', buildId?: string, message?: string}|null}
 *   The parsed result object, or null if no line matched.
 */
function extractResult(stdout) {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed === 'object' && typeof parsed.status === 'string') {
        return parsed;
      }
    } catch {
      // not JSON, keep scanning earlier lines
    }
  }
  return null;
}

/**
 * Submits a single build via `cork-kube build gcb --no-wait`. With
 * `--no-wait`, `cork-kube` prints a single JSON line to stdout once Cloud
 * Build has accepted (or rejected) the submission: `{"buildId": "...",
 * "status": "success"}` or `{"status": "error", "message": "..."}` - it does
 * not wait for the build itself to finish, so this resolves quickly either
 * way. stderr is left attached to this process's own stderr so any
 * human-readable output from the submission is still visible in logs.
 *
 * @param {string[]} args - argv for cork-kube, as produced by formatCorkKubeGcbArgs.
 * @returns {Promise<{status: 'success'|'error', buildId?: string, message?: string}>}
 *   Resolves with cork-kube's parsed JSON output. If the process could not be
 *   parsed as JSON (e.g. it crashed before printing anything, or an older
 *   cork-kube without this output is installed), resolves with a synthesized
 *   `{status: 'error', message}` instead of throwing.
 */
export function submitBuild(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.corkKubeBin, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        resolve({ status: 'error', message: `cork-kube was killed by signal ${signal}` });
        return;
      }
      const result = extractResult(stdout);
      if (result) {
        resolve(result);
      } else {
        const trimmed = stdout.trim();
        resolve({ status: 'error', message: `cork-kube exited ${code} without a parseable result line: ${trimmed || '(empty)'}` });
      }
    });
  });
}
