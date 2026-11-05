import { deriveProjectName, nodeKey } from './util.js';

/**
 * Walks the dependency closure reachable from a set of top-level
 * (project, version) selections, producing a build graph.
 *
 * Only build-entry keys that also exist in a project's own `dependencies`
 * map are followed as dependencies. This is required because a build entry
 * can contain non-dependency keys, such as `secret.<name>` GCP Secret
 * Manager refs (see repositories/main-wp-website.json) - secret refs never
 * appear in `dependencies`, so this check is the only way to tell them apart
 * from real pins.
 *
 * @param {object} opts
 * @param {Map<string, object>} opts.registry - Loaded registry, keyed by project name.
 * @param {Array<{project: string, version: string, reason: string}>} opts.topLevelSelections
 *   The per-project version selections to start the walk from.
 * @returns {{
 *   nodes: Map<string, {project: string, version: string, reasons: Set<string>}>,
 *   edges: Map<string, Set<string>>,
 *   registryErrors: Array<{type: string, project: string, version: string, message: string}>
 * }} `edges` maps a dependency node key to the set of node keys that depend
 *   on it ("must be built before" edges, ready for topological sorting).
 */
export function buildDependencyGraph({ registry, topLevelSelections }) {
  const nodes = new Map();
  const edges = new Map();
  const registryErrors = [];
  const visited = new Set();
  const worklist = [];

  const addReason = (key, project, version, reason) => {
    if (!nodes.has(key)) {
      nodes.set(key, { project, version, reasons: new Set() });
    }
    nodes.get(key).reasons.add(reason);
  };

  const addEdge = (dependencyKey, dependentKey) => {
    if (!edges.has(dependencyKey)) edges.set(dependencyKey, new Set());
    edges.get(dependencyKey).add(dependentKey);
  };

  for (const { project, version, reason } of topLevelSelections) {
    const key = nodeKey({ project, version });
    addReason(key, project, version, reason);
    worklist.push({ project, version, key });
  }

  while (worklist.length > 0) {
    const { project, version, key } = worklist.shift();
    if (visited.has(key)) continue;
    visited.add(key);

    const projectData = registry.get(project);
    if (!projectData) {
      registryErrors.push({
        type: 'unknown-project',
        project,
        version,
        message: `Project "${project}" is not present in the registry`
      });
      continue;
    }

    const buildEntry = projectData.builds[version];
    if (buildEntry === undefined) {
      registryErrors.push({
        type: 'unknown-version',
        project,
        version,
        message: `Project "${project}" has no build entry for version "${version}"`
      });
      continue;
    }

    const dependencies = projectData.dependencies || {};
    const dependencyShortNames = Object.keys(buildEntry).filter(
      k => Object.prototype.hasOwnProperty.call(dependencies, k)
    );

    for (const shortName of dependencyShortNames) {
      const depProject = deriveProjectName(dependencies[shortName]);
      const depVersion = buildEntry[shortName];
      const depKey = nodeKey({ project: depProject, version: depVersion });

      addReason(depKey, depProject, depVersion, `dependency of ${key}`);
      addEdge(depKey, key);

      if (!visited.has(depKey)) {
        worklist.push({ project: depProject, version: depVersion, key: depKey });
      }
    }
  }

  return { nodes, edges, registryErrors };
}
