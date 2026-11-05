import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { deriveProjectName } from './util.js';

const execFileAsync = promisify(execFile);

/**
 * Shallow-clones the cork-build-registry repository into a fresh temp
 * directory so its repositories/*.json files can be read without needing an
 * existing local checkout.
 *
 * @param {object} opts
 * @param {string} opts.gitUrl - Git URL of the registry repository.
 * @param {string} opts.ref - Branch/tag to clone.
 * @returns {Promise<string>} Absolute path to the cloned repository.
 */
export async function cloneRegistry({ gitUrl, ref }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cork-build-registry-'));
  await execFileAsync('git', ['clone', '--depth', '1', '--branch', ref, gitUrl, dir]);
  return dir;
}

/**
 * Reads and parses every repositories/*.json file found under a
 * cork-build-registry checkout directory.
 *
 * @param {string} dir - Path to a cork-build-registry checkout (or any
 *   directory containing a `repositories` subfolder in the same shape).
 * @returns {Promise<{registry: Map<string, object>, loadErrors: object[]}>}
 *   `registry` is keyed by each project's derived short name (from its
 *   `repository` URL, not its filename). Each entry's `cicd` is `false` only
 *   when the file explicitly sets `"cicd": false` at its root - see
 *   version-selector.js/build-planner.js for what that excludes. `loadErrors`
 *   lists any file that failed to parse, so one bad file doesn't abort the
 *   whole run.
 */
export async function loadRegistryFromDir(dir) {
  const repositoriesDir = path.join(dir, 'repositories');
  let filenames;
  try {
    filenames = (await fs.readdir(repositoriesDir)).filter(name => name.endsWith('.json'));
  } catch (e) {
    throw new Error(`Cannot read repositories directory at ${repositoriesDir}: ${e.message}`);
  }

  const registry = new Map();
  const loadErrors = [];

  for (const filename of filenames) {
    const filePath = path.join(repositoriesDir, filename);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed.repository) {
        throw new Error('missing required "repository" field');
      }
      const name = deriveProjectName(parsed.repository);
      registry.set(name, {
        name,
        repository: parsed.repository,
        cicd: parsed.cicd !== false,
        dependencies: parsed.dependencies || {},
        builds: parsed.builds || {}
      });
    } catch (e) {
      loadErrors.push({ file: filename, message: e.message });
    }
  }

  return { registry, loadErrors };
}

/**
 * Loads the registry, either from a local directory (for testing/local
 * development against this repo's own working tree) or by cloning it fresh
 * from git (the default, since the registry changes independently of any
 * deploy of this tool).
 *
 * @param {object} [opts={}]
 * @param {string} [opts.gitUrl] - Registry git URL, used when `localPath` is not given.
 * @param {string} [opts.ref] - Registry git ref, used when `localPath` is not given.
 * @param {string} [opts.localPath] - Path to an existing registry checkout; skips cloning entirely.
 * @returns {Promise<{registry: Map<string, object>, loadErrors: object[]}>}
 */
export async function loadRegistry(opts = {}) {
  if (opts.localPath) {
    return loadRegistryFromDir(opts.localPath);
  }

  const dir = await cloneRegistry({ gitUrl: opts.gitUrl, ref: opts.ref });
  try {
    return await loadRegistryFromDir(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
