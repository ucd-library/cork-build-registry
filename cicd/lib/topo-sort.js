/**
 * Groups a dependency graph into topological "waves" using a level-wise
 * variant of Kahn's algorithm: every node in a wave has all of its
 * dependencies satisfied by nodes in earlier waves, and nodes within the same
 * wave are mutually independent (neither depends on the other), so they can
 * be submitted and built in parallel.
 *
 * @param {object} opts
 * @param {Map<string, object>} opts.nodes - Map of node key -> node data.
 * @param {Map<string, Set<string>>} opts.edges - Map of dependency node key
 *   -> set of dependent node keys ("must be built before" edges).
 * @returns {{levels: string[][], cycleExcluded: string[]}} `levels` lists
 *   waves of node keys in build order. `cycleExcluded` lists any node keys
 *   that could not be placed in a wave because they are part of (or depend
 *   on) a cycle - this is defensive only, real registry data is not expected
 *   to contain cycles.
 */
export function topologicalLevels({ nodes, edges }) {
  const inDegree = new Map();
  for (const key of nodes.keys()) {
    inDegree.set(key, 0);
  }
  for (const [, dependents] of edges) {
    for (const dependent of dependents) {
      if (inDegree.has(dependent)) {
        inDegree.set(dependent, inDegree.get(dependent) + 1);
      }
    }
  }

  const levels = [];
  const ordered = new Set();
  let current = [...inDegree.entries()].filter(([, degree]) => degree === 0).map(([key]) => key);

  while (current.length > 0) {
    levels.push(current);
    for (const key of current) ordered.add(key);

    const next = [];
    for (const key of current) {
      for (const dependent of edges.get(key) || []) {
        if (!inDegree.has(dependent)) continue;
        const remaining = inDegree.get(dependent) - 1;
        inDegree.set(dependent, remaining);
        if (remaining === 0) next.push(dependent);
      }
    }
    current = next;
  }

  const cycleExcluded = ordered.size === nodes.size
    ? []
    : [...nodes.keys()].filter(key => !ordered.has(key));

  return { levels, cycleExcluded };
}
