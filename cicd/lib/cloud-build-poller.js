import { execFile } from 'child_process';
import { promisify } from 'util';
import config from './config.js';

const execFileAsync = promisify(execFile);

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']);

/**
 * Checks whether a Cloud Build status string is terminal (the build is done,
 * one way or another) as opposed to still in progress (e.g. `QUEUED`,
 * `WORKING`).
 *
 * @param {string} status - A Cloud Build status, as returned by
 *   `gcloud builds describe`.
 * @returns {boolean} True if the build has reached a terminal state.
 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Looks up a single Cloud Build build's current status via `gcloud builds
 * describe`. Separated from waitForBuilds so it can be swapped out in tests.
 *
 * @param {string} buildId - Cloud Build build ID.
 * @param {object} [opts={}]
 * @param {string} [opts.gcbProject] - GCP project the build was submitted to.
 * @returns {Promise<string>} The build's current status (e.g. `WORKING`, `SUCCESS`).
 */
export async function getBuildStatus(buildId, opts = {}) {
  const args = ['builds', 'describe', buildId, '--format=value(status)'];
  if (opts.gcbProject) args.push(`--project=${opts.gcbProject}`);
  const { stdout } = await execFileAsync(config.gcloudBin, args);
  return stdout.trim();
}

/**
 * Polls a batch of Cloud Build build IDs until every one of them reaches a
 * terminal state, checking only the ones still in progress on each pass.
 * Used to wait for a whole wave of independently-submitted builds to finish
 * before the next wave (which may depend on them) is submitted.
 *
 * A transient error looking up one build's status (e.g. a flaky `gcloud`
 * call) is logged and treated as "still pending" rather than aborting the
 * whole wait, since the Cloud Run Job's own `--task-timeout` is the real
 * backstop against hanging forever.
 *
 * @param {string[]} buildIds
 * @param {object} [opts={}]
 * @param {string} [opts.gcbProject] - GCP project the builds were submitted to.
 * @param {number} [opts.pollIntervalMs=15000] - Delay between polling passes.
 * @param {(buildId: string, opts: object) => Promise<string>} [opts.getStatus]
 *   Override for fetching a single build's status - used in tests to avoid
 *   calling real `gcloud`.
 * @returns {Promise<Map<string, string>>} Map of build ID -> terminal status.
 */
export async function waitForBuilds(buildIds, opts = {}) {
  const pollIntervalMs = opts.pollIntervalMs ?? 15000;
  const getStatus = opts.getStatus || getBuildStatus;

  const results = new Map();
  let pending = [...buildIds];

  while (pending.length > 0) {
    const stillPending = [];
    for (const buildId of pending) {
      let status;
      try {
        status = await getStatus(buildId, opts);
      } catch (e) {
        console.error(`Failed to check status of build ${buildId}, will retry: ${e.message}`);
        stillPending.push(buildId);
        continue;
      }
      if (isTerminalStatus(status)) {
        results.set(buildId, status);
      } else {
        stillPending.push(buildId);
      }
    }

    pending = stillPending;
    if (pending.length > 0) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  return results;
}
