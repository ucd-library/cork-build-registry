import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

// submitBuild() spawns config.corkKubeBin, read once at import time - so this
// must be set before config.js (transitively imported by command-runner.js)
// is first loaded, pointing it at a stub script instead of a real cork-kube.
process.env.CORK_KUBE_BIN = 'node';

const { formatCorkKubeGcbArgs, submitBuild } = await import('../lib/command-runner.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stubPath = path.join(__dirname, 'fixtures', 'stub-cork-kube.js');

test('always includes --no-cache, --notify error, and --no-wait', () => {
  const args = formatCorkKubeGcbArgs({ project: 'fin', version: '2.16.0' });
  assert.deepEqual(args, ['build', 'gcb', '--project', 'fin', '--version', '2.16.0', '--no-cache', '--notify', 'error', '--no-wait']);
});

test('appends --gcb-project when given', () => {
  const args = formatCorkKubeGcbArgs({ project: 'fin', version: '2.16.0', gcbProject: 'my-gcp-project' });
  assert.ok(args.includes('--gcb-project'));
  assert.equal(args[args.indexOf('--gcb-project') + 1], 'my-gcp-project');
});

test('appends --high-cpu when given', () => {
  const args = formatCorkKubeGcbArgs({ project: 'fin', version: '2.16.0', highCpu: true });
  assert.ok(args.includes('--high-cpu'));
});

test('omits --gcb-project and --high-cpu when not given', () => {
  const args = formatCorkKubeGcbArgs({ project: 'fin', version: '2.16.0' });
  assert.ok(!args.includes('--gcb-project'));
  assert.ok(!args.includes('--high-cpu'));
});

test('submitBuild resolves with the parsed JSON on success', async () => {
  const result = await submitBuild([stubPath, 'success']);
  assert.deepEqual(result, { buildId: 'build-123', status: 'success' });
});

test('submitBuild resolves with the parsed JSON on a reported error', async () => {
  const result = await submitBuild([stubPath, 'error']);
  assert.deepEqual(result, { status: 'error', message: 'boom' });
});

test('submitBuild synthesizes an error result on unparseable output', async () => {
  const result = await submitBuild([stubPath, 'garbage']);
  assert.equal(result.status, 'error');
  assert.match(result.message, /without a parseable result line/);
});

test('submitBuild finds the JSON result even when preceded by human-readable progress lines', async () => {
  const result = await submitBuild([stubPath, 'success-with-progress-output']);
  assert.deepEqual(result, { buildId: 'build-456', status: 'success' });
});
