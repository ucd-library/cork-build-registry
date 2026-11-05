import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topologicalLevels } from '../lib/topo-sort.js';

test('orders dependencies before dependents, one per wave on a straight chain', () => {
  const nodes = new Map([
    ['a', {}], ['b', {}], ['c', {}]
  ]);
  // edges: dependency -> dependents. a must build before b, b before c.
  const edges = new Map([
    ['a', new Set(['b'])],
    ['b', new Set(['c'])]
  ]);

  const { levels, cycleExcluded } = topologicalLevels({ nodes, edges });
  assert.deepEqual(levels, [['a'], ['b'], ['c']]);
  assert.deepEqual(cycleExcluded, []);
});

test('groups independent branches into the same wave', () => {
  const nodes = new Map([
    ['base', {}], ['left', {}], ['right', {}], ['top', {}]
  ]);
  const edges = new Map([
    ['base', new Set(['left', 'right'])],
    ['left', new Set(['top'])],
    ['right', new Set(['top'])]
  ]);

  const { levels } = topologicalLevels({ nodes, edges });
  assert.deepEqual(levels[0], ['base']);
  assert.deepEqual(new Set(levels[1]), new Set(['left', 'right']));
  assert.deepEqual(levels[2], ['top']);
});

test('detects and excludes a cycle without infinite looping', () => {
  const nodes = new Map([
    ['x', {}], ['y', {}], ['independent', {}]
  ]);
  const edges = new Map([
    ['x', new Set(['y'])],
    ['y', new Set(['x'])]
  ]);

  const { levels, cycleExcluded } = topologicalLevels({ nodes, edges });
  assert.deepEqual(levels, [['independent']]);
  assert.deepEqual(new Set(cycleExcluded), new Set(['x', 'y']));
});
