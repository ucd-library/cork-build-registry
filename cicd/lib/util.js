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
 * A key that is purely numeric, dot-separated, with 1 to 3 components and an
 * optional leading "v" - e.g. "16", "16.0", "v16.0", "16.0.4". Deliberately
 * narrow so a branch name is never mistaken for a version: "main", "dev",
 * "sandbox", and anything else with letters never match.
 */
const PARTIAL_VERSION_PATTERN = /^v?\d+(\.\d+){0,2}$/;

/**
 * Normalizes a raw build key to a full semantic version, for comparing
 * versions against each other - the original key string (e.g. "16", not
 * "16.0.0") is still what gets passed to `cork-kube --version`, since that's
 * the actual tag/branch that exists.
 *
 * Handles full semver tags, optionally "v"-prefixed (e.g. "4.8.8",
 * "v4.8.8"), as well as partial numeric tags some projects use for a release
 * line - e.g. postgres tags a major version as "16", meaning "16.0.0"; "16.4"
 * would mean "16.4.0". Anything that isn't purely numeric and dot-separated
 * (optionally "v"-prefixed) is never coerced into a version.
 *
 * @param {string} key - A raw build key from a project's `builds` object.
 * @returns {string|null} The normalized semantic version, or null if the key
 *   isn't a version at all.
 */
export function normalizeVersionKey(key) {
  const exact = semver.valid(key);
  if (exact) return exact;
  if (PARTIAL_VERSION_PATTERN.test(key)) {
    const coerced = semver.coerce(key);
    if (coerced) return coerced.version;
  }
  return null;
}

/**
 * Checks whether a build key should be treated as a semantic version for the
 * purposes of top-level version selection. Wrapped separately from the
 * `semver` package so the precedence rule in version-selector.js reads
 * clearly and the behavior is pinned down in one place with its own tests.
 *
 * @param {string} key - A raw build key from a project's `builds` object.
 * @returns {boolean} True if the key parses as (or coerces to) a valid
 *   semantic version.
 */
export function isValidSemver(key) {
  return normalizeVersionKey(key) !== null;
}
