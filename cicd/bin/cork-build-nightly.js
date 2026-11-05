#!/usr/bin/env node

import { Command } from 'commander';
import config from '../lib/config.js';
import { createPlan } from '../lib/build-planner.js';
import { executePlan } from '../lib/build-executor.js';

const program = new Command();

program
  .name('cork-build-nightly')
  .description('Computes and (optionally) executes the nightly build plan for cork-build-registry')
  .option('--exec', 'actually run the builds, instead of only printing the plan', config.execByDefault)
  .option('--registry-url <url>', 'registry git URL', config.registry.gitUrl)
  .option('--registry-ref <ref>', 'registry git ref', config.registry.ref)
  .option('--registry-path <path>', 'local registry checkout path, skips cloning')
  .option('--gcb-project <id>', 'GCP project to submit builds to', config.gcbProject)
  .option('--high-cpu', 'use a high-cpu Cloud Build machine type', config.highCpu)
  .option('-p, --project <name>', 'restrict top-level selection to this project (repeatable)', (value, previous) => previous.concat([value]), [])
  .option('--poll-interval-ms <ms>', 'how often to poll Cloud Build for wave completion', (value) => Number(value), config.pollIntervalMs);

program.parse(process.argv);
const options = program.opts();

try {
  const { plan, edges, levels, issues } = await createPlan({
    gitUrl: options.registryUrl,
    ref: options.registryRef,
    localPath: options.registryPath,
    projectFilter: options.project,
    gcbProject: options.gcbProject,
    highCpu: options.highCpu
  });

  const exitCode = await executePlan({
    plan,
    edges,
    levels,
    issues,
    exec: options.exec,
    pollIntervalMs: options.pollIntervalMs,
    gcbProject: options.gcbProject
  });
  process.exit(exitCode);
} catch (e) {
  console.error(`Failed to compute build plan: ${e.message}`);
  process.exit(1);
}
