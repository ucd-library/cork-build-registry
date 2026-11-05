import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTerminalStatus, waitForBuilds } from '../lib/cloud-build-poller.js';

test('isTerminalStatus recognizes terminal vs in-progress statuses', () => {
  assert.equal(isTerminalStatus('SUCCESS'), true);
  assert.equal(isTerminalStatus('FAILURE'), true);
  assert.equal(isTerminalStatus('QUEUED'), false);
  assert.equal(isTerminalStatus('WORKING'), false);
});

test('waitForBuilds resolves once every build reaches a terminal status', async () => {
  const statusesById = {
    a: ['WORKING', 'WORKING', 'SUCCESS'],
    b: ['QUEUED', 'FAILURE']
  };
  const getStatus = async (buildId) => statusesById[buildId].shift();

  const results = await waitForBuilds(['a', 'b'], { getStatus, pollIntervalMs: 0 });

  assert.equal(results.get('a'), 'SUCCESS');
  assert.equal(results.get('b'), 'FAILURE');
  assert.deepEqual(statusesById.a, []);
  assert.deepEqual(statusesById.b, []);
});

test('waitForBuilds retries after a transient lookup error instead of throwing', async () => {
  let callCount = 0;
  const getStatus = async () => {
    callCount += 1;
    if (callCount === 1) throw new Error('transient gcloud error');
    return 'SUCCESS';
  };

  const results = await waitForBuilds(['only'], { getStatus, pollIntervalMs: 0 });

  assert.equal(results.get('only'), 'SUCCESS');
  assert.equal(callCount, 2);
});
