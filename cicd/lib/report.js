/**
 * Prints the computed build plan and any issues found while computing it.
 * Issues are printed even in print-only mode, so registry data problems are
 * visible without ever passing --exec.
 *
 * @param {Array<{project: string, version: string, reasons: string[], args: string[]}>} plan
 * @param {Array<{type: string, message: string}>} issues
 * @returns {void}
 */
export function printPlan(plan, issues) {
  if (issues.length > 0) {
    console.log(`Issues (${issues.length}):`);
    for (const issue of issues) {
      console.log(`  [${issue.type}] ${issue.message}`);
    }
    console.log('');
  }

  console.log(`Build plan (${plan.length} build${plan.length === 1 ? '' : 's'}):`);
  plan.forEach((entry, index) => {
    const command = `cork-kube ${entry.args.join(' ')}`;
    console.log(
      `  [${index + 1}/${plan.length}] ${entry.project}@${entry.version} -- ${command}   (reasons: ${entry.reasons.join('; ')})`
    );
  });
}

/**
 * Prints the final execution summary and overall result banner.
 *
 * Builds are submitted with `--no-wait` and then polled wave by wave, so
 * `built`/`failed` reflect real Cloud Build outcomes (not just whether
 * submission was accepted) - see build-executor.js.
 *
 * @param {object} opts
 * @param {Array<{project: string, version: string}>} opts.built
 * @param {Array<{project: string, version: string}>} opts.failed
 * @param {Array<{project: string, version: string}>} opts.skipped
 * @param {Array<{type: string, message: string}>} opts.issues
 * @returns {void}
 */
export function printSummary({ built, failed, skipped, issues }) {
  console.log('');
  console.log('Execution summary:');
  console.log(`  built: ${built.length}`);
  built.forEach(n => console.log(`    - ${n.project}@${n.version}`));
  console.log(`  failed: ${failed.length}`);
  failed.forEach(n => console.log(`    - ${n.project}@${n.version}`));
  console.log(`  skipped (dependency failed): ${skipped.length}`);
  skipped.forEach(n => console.log(`    - ${n.project}@${n.version}`));
  console.log(`  registry/planning issues: ${issues.length}`);
  issues.forEach(i => console.log(`    - [${i.type}] ${i.message}`));

  const success = failed.length === 0 && skipped.length === 0 && issues.length === 0;
  console.log('');
  console.log(success ? 'RESULT: SUCCESS' : 'RESULT: FAILURE');
}
