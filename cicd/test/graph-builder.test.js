import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRegistryFromDir } from '../lib/registry-loader.js';
import { buildDependencyGraph } from '../lib/graph-builder.js';
import { nodeKey } from '../lib/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'registry');

test('filters out secret.* keys and only follows real dependency pins', async () => {
  const { registry } = await loadRegistryFromDir(fixturesDir);
  const { nodes, registryErrors } = buildDependencyGraph({
    registry,
    topLevelSelections: [{ project: 'delta', version: '1.0.0', reason: 'test' }]
  });

  assert.equal(registryErrors.length, 0);
  assert.ok(nodes.has(nodeKey({ project: 'delta', version: '1.0.0' })));
  assert.ok(nodes.has(nodeKey({ project: 'no-deps', version: '1.0.0' })));
  assert.ok(!nodes.has(nodeKey({ project: 'secret.delta-secret', version: 'latest' })));
});

test('dedupes per exact (project, version) pair, not per project', async () => {
  const { registry } = await loadRegistryFromDir(fixturesDir);
  const { nodes } = buildDependencyGraph({
    registry,
    topLevelSelections: [
      { project: 'delta', version: '1.0.0', reason: 'top-level' },
      { project: 'delta', version: '0.9.0', reason: 'top-level' }
    ]
  });

  assert.ok(nodes.has(nodeKey({ project: 'delta', version: '1.0.0' })));
  assert.ok(nodes.has(nodeKey({ project: 'delta', version: '0.9.0' })));
  assert.equal(nodes.size, 3); // delta@1.0.0, delta@0.9.0, no-deps@1.0.0 (shared dependency, deduped)
});

test('reports a registry error for a pin that does not exist in the dependency builds map', async () => {
  const { registry } = await loadRegistryFromDir(fixturesDir);
  const { registryErrors } = buildDependencyGraph({
    registry,
    topLevelSelections: [{ project: 'missing-version-pin', version: '1.0.0', reason: 'test' }]
  });

  assert.equal(registryErrors.length, 1);
  assert.equal(registryErrors[0].type, 'unknown-version');
  assert.equal(registryErrors[0].project, 'no-deps');
  assert.equal(registryErrors[0].version, '9.9.9');
});

test('builds edges so a dependency must be built before its dependent', async () => {
  const { registry } = await loadRegistryFromDir(fixturesDir);
  const { edges } = buildDependencyGraph({
    registry,
    topLevelSelections: [{ project: 'alpha', version: '1.2.0', reason: 'top-level' }]
  });

  const deltaKey = nodeKey({ project: 'delta', version: '1.0.0' });
  const alphaKey = nodeKey({ project: 'alpha', version: '1.2.0' });
  assert.ok(edges.get(deltaKey).has(alphaKey));
});
