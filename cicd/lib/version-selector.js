import semver from 'semver';
import { isValidSemver, normalizeVersionKey } from './util.js';

/**
 * Selects which build of a project should be built this run, following
 * precedence: highest semver tag, else "main", else "dev", else none.
 *
 * @param {object} project - A loaded registry project, as returned by
 *   registry-loader.js (must have a `builds` object).
 * @returns {{version: string, reason: string}|null} The selected build key
 *   and a human-readable reason, or null if nothing qualifies.
 */
export function selectTopLevelVersion(project) {
  const keys = Object.keys(project.builds || {});

  const semverKeys = keys.filter(isValidSemver);
  if (semverKeys.length > 0) {
    const highest = semverKeys.reduce((best, key) =>
      semver.rcompare(normalizeVersionKey(key), normalizeVersionKey(best)) < 0 ? key : best
    );
    return { version: highest, reason: 'top-level: highest semver tag' };
  }

  if (Object.prototype.hasOwnProperty.call(project.builds, 'main')) {
    return { version: 'main', reason: 'top-level: main branch (no semver tag)' };
  }

  if (Object.prototype.hasOwnProperty.call(project.builds, 'dev')) {
    return { version: 'dev', reason: 'top-level: dev branch (no semver tag or main)' };
  }

  return null;
}
