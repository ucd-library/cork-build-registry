import semver from 'semver';

/**
 * Derives a project's registry short name from its git repository URL, the
 * same way webapp/lib/model.js does it. The registry's README is explicit
 * that the project name comes from the repository URL, not the filename, so
 * every consumer of repositories/*.json must derive names this way to stay
 * consistent with cork-kube's own resolution.
 *
 * @param {string} repositoryUrl - A project's `repository` field, e.g.
 *   "https://github.com/ucd-library/fin" or ".../fin.git".
 * @returns {string} The derived short name, e.g. "fin".
 */
export function deriveProjectName(repositoryUrl) {
  return repositoryUrl
    .replace(/\/+$/, '')
    .split('/')
    .pop()
    .replace(/\.git$/, '');
}

/**
 * Builds the dedup/graph key for a (project, version) pair.
 *
 * @param {object} opts
 * @param {string} opts.project - Registry project short name.
 * @param {string} opts.version - Build version/tag/branch key.
 * @returns {string} A stable key such as "fin@2.16.0".
 */
export function nodeKey({ project, version }) {
  return `${project}@${version}`;
}

/**
 * Checks whether a build key should be treated as a semantic version for the
 * purposes of top-level version selection. Wrapped separately from the
 * `semver` package so the precedence rule in version-selector.js reads
 * clearly and the behavior (e.g. "16" and "main" are not valid semver, but
 * "v4.8.8" is) is pinned down in one place with its own tests.
 *
 * @param {string} key - A raw build key from a project's `builds` object.
 * @returns {boolean} True if the key parses as a valid semantic version.
 */
export function isValidSemver(key) {
  return semver.valid(key) !== null;
}
