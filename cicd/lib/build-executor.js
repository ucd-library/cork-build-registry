import * as commandRunner from './command-runner.js';
import * as cloudBuildPoller from './cloud-build-poller.js';
import { transitiveDependents } from './build-planner.js';
import { nodeKey } from './util.js';
import { printPlan, printSummary } from './report.js';

/**
 * Executes (or just prints) a computed build plan.
 *
 * In print-only mode (the default), this only prints the plan and issues and
 * always "succeeds" as a report - no infra is touched.
 *
 * In exec mode, builds run wave by wave: every project in a wave is
 * independent of every other project in that same wave (neither depends on
 * the other), so all of them are submitted to Cloud Build via `cork-kube
 * build gcb --no-wait` up front, then this waits (polling Cloud Build) for
 * every one of them to actually finish before moving on to the next wave.
 * This keeps the real guarantee that a dependency's image exists before a
 * dependent's build starts, while still running independent projects in
 * parallel within a wave instead of one at a time.
 *
 * If a build fails - either rejected at submission time, or it ran and
 * failed in Cloud Build - every node transitively depending on it is skipped
 * rather than attempted, since the failed project's image does not exist.
 * Independent branches of the graph continue to be submitted.
 *
 * @param {object} opts
 * @param {Array<{project: string, version: string, reasons: string[], args: string[]}>} opts.plan
 * @param {Map<string, Set<string>>} opts.edges - dependency -> dependents map, for cascading skips.
 * @param {string[][]} opts.levels - node keys grouped into waves, dependencies before dependents.
 * @param {Array<{type: string, message: string}>} opts.issues
 * @param {boolean} opts.exec - Whether to actually run the builds.
 * @param {number} [opts.pollIntervalMs] - Passed through to the Cloud Build poller.
 * @param {string} [opts.gcbProject] - Passed through to the Cloud Build poller.
 * @returns {Promise<number>} Process exit code: 0 if every build actually
 *   succeeded (or nothing needed building), 1 otherwise.
 */
export async function executePlan({ plan, edges, levels, issues, exec, pollIntervalMs, gcbProject }) {
  if (!exec) {
    printPlan(plan, issues);
    return 0;
  }

  const byKey = new Map(plan.map(entry => [nodeKey({ project: entry.project, version: entry.version }), entry]));

  const built = [];
  const failed = [];
  const skipped = [];
  const blocked = new Set();

  for (const level of levels) {
    const pendingBuilds = [];

    for (const key of level) {
      const entry = byKey.get(key);
      if (!entry) continue;

      if (blocked.has(key)) {
        skipped.push(entry);
        continue;
      }

      console.log(`Submitting ${key}...`);
      const result = await commandRunner.submitBuild(entry.args);

      if (result.status === 'success' && result.buildId) {
        pendingBuilds.push({ key, entry, buildId: result.buildId });
      } else {
        console.error(`Submission failed for ${key}: ${result.message || 'unknown error'}`);
        failed.push(entry);
        for (const blockedKey of transitiveDependents({ startKeys: [key], edges })) {
          blocked.add(blockedKey);
        }
      }
    }

    if (pendingBuilds.length === 0) continue;

    console.log(`Waiting for ${pendingBuilds.length} build(s) in this wave to finish...`);
    const statuses = await cloudBuildPoller.waitForBuilds(
      pendingBuilds.map(b => b.buildId),
      { pollIntervalMs, gcbProject }
    );

    for (const { key, entry, buildId } of pendingBuilds) {
      const status = statuses.get(buildId);
      if (status === 'SUCCESS') {
        built.push(entry);
      } else {
        console.error(`Build failed for ${key}: Cloud Build status ${status}`);
        failed.push(entry);
        for (const blockedKey of transitiveDependents({ startKeys: [key], edges })) {
          blocked.add(blockedKey);
        }
      }
    }
  }

  printSummary({ built, failed, skipped, issues });

  return failed.length === 0 && skipped.length === 0 && issues.length === 0 ? 0 : 1;
}
