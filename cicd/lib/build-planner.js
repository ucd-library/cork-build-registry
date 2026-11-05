import { loadRegistry } from './registry-loader.js';
import { selectTopLevelVersion } from './version-selector.js';
import { buildDependencyGraph } from './graph-builder.js';
import { topologicalLevels } from './topo-sort.js';
import { formatCorkKubeGcbArgs } from './command-runner.js';
import { nodeKey } from './util.js';

/**
 * Finds every node reachable from a set of starting node keys by following
 * "must be built before" edges forward (i.e. every transitive dependent).
 * Used both to exclude unbuildable nodes before execution and, identically,
 * to cascade-skip nodes during execution when a real build fails.
 *
 * @param {object} opts
 * @param {string[]} opts.startKeys - Node keys to start the walk from.
 * @param {Map<string, Set<string>>} opts.edges - dependency -> dependents map.
 * @returns {Set<string>} All node keys reachable from startKeys, including startKeys themselves.
 */
export function transitiveDependents({ startKeys, edges }) {
  const result = new Set(startKeys);
  const worklist = [...startKeys];
  while (worklist.length > 0) {
    const key = worklist.shift();
    for (const dependent of edges.get(key) || []) {
      if (!result.has(dependent)) {
        result.add(dependent);
        worklist.push(dependent);
      }
    }
  }
  return result;
}

/**
 * Computes the full nightly build plan: loads the registry, selects which
 * version(s) of each project to build this run, walks the dependency
 * closure, excludes anything unbuildable (registry errors or cycles) along
 * with everything that transitively depends on it, and topologically sorts
 * what remains.
 *
 * Top-level selection is driven by each project's root `"cicd"` field:
 *   - Not set: the usual precedence in version-selector.js - highest semver
 *     tag, else `main`, else `dev`, else skipped.
 *   - `false`: never a top-level build target.
 *   - An array of build keys: exactly those versions are built, in the
 *     order listed, instead of the semver/main/dev precedence.
 * Either way, this only controls *top-level* selection - if some other
 * project's build still pins a specific version of a `false` (or
 * explicit-list) project as a dependency, that version is still included in
 * the plan, since the dependent genuinely needs it to exist.
 *
 * @param {object} [opts={}]
 * @param {string} [opts.gitUrl] - Registry git URL (ignored if localPath is set).
 * @param {string} [opts.ref] - Registry git ref (ignored if localPath is set).
 * @param {string} [opts.localPath] - Local registry checkout path, skips cloning.
 * @param {string[]} [opts.projectFilter] - If given, restricts top-level
 *   selection to these project names (dependency pull-in still applies normally).
 * @param {string} [opts.gcbProject] - GCP project passed through to each build command.
 * @param {boolean} [opts.highCpu] - Passed through to each build command.
 * @returns {Promise<{
 *   plan: Array<{project: string, version: string, reasons: string[], args: string[]}>,
 *   edges: Map<string, Set<string>>,
 *   levels: string[][],
 *   issues: Array<{type: string, message: string}>
 * }>} `plan` is flattened wave order (every dependency before its
 *   dependents); `levels` groups the same node keys into waves of mutually
 *   independent projects, for executing a whole wave in parallel and only
 *   waiting between waves (see build-executor.js).
 */
export async function createPlan(opts = {}) {
  const { registry, loadErrors } = await loadRegistry({
    gitUrl: opts.gitUrl,
    ref: opts.ref,
    localPath: opts.localPath
  });

  const issues = loadErrors.map(e => ({
    type: 'load-error',
    message: `Failed to parse repositories/${e.file}: ${e.message}`
  }));

  const projectNames = opts.projectFilter && opts.projectFilter.length > 0
    ? opts.projectFilter
    : [...registry.keys()];

  const topLevelSelections = [];
  for (const name of projectNames) {
    const project = registry.get(name);
    if (!project) {
      issues.push({ type: 'unknown-project', message: `Requested project "${name}" is not present in the registry` });
      continue;
    }
    if (project.cicd === false) {
      issues.push({
        type: 'cicd-disabled',
        message: `Skipping ${name}: "cicd": false is set in the registry (still built if another project pins a specific version of it as a dependency)`
      });
      continue;
    }

    if (Array.isArray(project.cicd)) {
      if (project.cicd.length === 0) {
        issues.push({
          type: 'cicd-empty-list',
          message: `Skipping ${name}: "cicd" is an empty list in the registry`
        });
        continue;
      }
      for (const version of project.cicd) {
        topLevelSelections.push({
          project: name,
          version,
          reason: `top-level: explicitly listed in registry "cicd"`
        });
      }
      continue;
    }

    const selection = selectTopLevelVersion(project);
    if (!selection) {
      issues.push({
        type: 'no-buildable-version',
        message: `Skipping ${name}: no semver tag, main, or dev build found`
      });
      continue;
    }
    topLevelSelections.push({ project: name, version: selection.version, reason: selection.reason });
  }

  const { nodes, edges, registryErrors } = buildDependencyGraph({ registry, topLevelSelections });
  for (const e of registryErrors) {
    issues.push({ type: e.type, message: e.message });
  }

  const unbuildableKeys = registryErrors.map(e => nodeKey({ project: e.project, version: e.version }));
  const excluded = transitiveDependents({ startKeys: unbuildableKeys, edges });
  for (const key of excluded) {
    if (!unbuildableKeys.includes(key)) {
      issues.push({
        type: 'skipped-dependency-error',
        message: `Skipping ${key}: depends on a project/version with a registry error`
      });
    }
  }

  const buildableNodes = new Map([...nodes].filter(([key]) => !excluded.has(key)));
  const { levels, cycleExcluded } = topologicalLevels({ nodes: buildableNodes, edges });
  for (const key of cycleExcluded) {
    issues.push({ type: 'cycle-excluded', message: `Excluding ${key}: part of a dependency cycle` });
  }

  const order = levels.flat();
  const plan = order.map(key => {
    const node = buildableNodes.get(key);
    return {
      project: node.project,
      version: node.version,
      reasons: [...node.reasons],
      args: formatCorkKubeGcbArgs({
        project: node.project,
        version: node.version,
        gcbProject: opts.gcbProject,
        highCpu: opts.highCpu
      })
    };
  });

  return { plan, edges, levels, issues };
}
