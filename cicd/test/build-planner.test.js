import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPlan } from '../lib/build-planner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'registry');

test('selects correct top-level versions for every fixture project', async () => {
  const { plan } = await createPlan({ localPath: fixturesDir });
  const byProject = Object.fromEntries(plan.map(e => [e.project, e.version]));

  assert.equal(byProject.alpha, '1.2.0');
  assert.equal(byProject.beta, 'main');
  assert.equal(byProject.gamma, 'dev');
  assert.equal(byProject.delta, '1.0.0');
});

test('orders dependencies before dependents in the final plan', async () => {
  const { plan } = await createPlan({ localPath: fixturesDir });
  const order = plan.map(e => `${e.project}@${e.version}`);

  assert.ok(order.indexOf('no-deps@1.0.0') < order.indexOf('delta@1.0.0'));
  assert.ok(order.indexOf('delta@1.0.0') < order.indexOf('alpha@1.2.0'));
});

test('groups the plan into waves with dependencies in earlier waves than dependents', async () => {
  const { levels } = await createPlan({ localPath: fixturesDir });

  const waveOf = key => levels.findIndex(level => level.includes(key));
  assert.ok(waveOf('no-deps@1.0.0') < waveOf('delta@1.0.0'));
  assert.ok(waveOf('delta@1.0.0') < waveOf('alpha@1.2.0'));
});

test('skips a "cicd": false project as a top-level build target but still reports why', async () => {
  const { plan, issues } = await createPlan({ localPath: fixturesDir, projectFilter: ['cicd-disabled'] });

  assert.equal(plan.length, 0);
  assert.ok(issues.some(i => i.type === 'cicd-disabled' && i.message.includes('cicd-disabled')));
});

test('still builds a "cicd": false project when another project pins it as a dependency', async () => {
  const { plan } = await createPlan({ localPath: fixturesDir, projectFilter: ['epsilon'] });
  const byProject = Object.fromEntries(plan.map(e => [e.project, e.version]));

  assert.equal(byProject['cicd-disabled'], '1.0.0');
  assert.equal(byProject.epsilon, '1.0.0');
});

test('excludes nodes with registry errors and reports the cascading skip', async () => {
  const { plan, issues } = await createPlan({ localPath: fixturesDir, projectFilter: ['missing-version-pin'] });

  assert.equal(plan.length, 0);
  assert.ok(issues.some(i => i.type === 'unknown-version'));
});

test('excludes cyclic nodes and reports them without hanging', async () => {
  const { plan, issues } = await createPlan({ localPath: fixturesDir, projectFilter: ['cycle-a', 'cycle-b'] });

  assert.equal(plan.length, 0);
  assert.ok(issues.some(i => i.type === 'cycle-excluded'));
});

test('always includes --no-cache, --notify error, and --no-wait in the generated command args', async () => {
  const { plan } = await createPlan({ localPath: fixturesDir, projectFilter: ['beta'] });

  assert.ok(plan.length > 0);
  for (const entry of plan) {
    assert.ok(entry.args.includes('--no-cache'));
    assert.ok(entry.args.includes('--notify'));
    assert.equal(entry.args[entry.args.indexOf('--notify') + 1], 'error');
    assert.ok(entry.args.includes('--no-wait'));
  }
});
