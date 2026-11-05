const env = process.env;

/**
 * Runtime configuration for the nightly build orchestrator, built from
 * environment variables with inline defaults, matching the pattern used by
 * webapp/lib/config.js elsewhere in this repo.
 */
const config = {
  registry: {
    gitUrl: env.CORK_BUILD_REGISTRY_URL || 'https://github.com/ucd-library/cork-build-registry.git',
    ref: env.CORK_BUILD_REGISTRY_REF || 'main'
  },
  corkKubeBin: env.CORK_KUBE_BIN || 'cork-kube',
  gcloudBin: env.CORK_GCLOUD_BIN || 'gcloud',
  gcbProject: env.CORK_GCB_PROJECT || undefined,
  highCpu: env.CORK_HIGH_CPU === 'true',
  execByDefault: env.CORK_BUILD_EXEC === 'true',
  pollIntervalMs: env.CORK_BUILD_POLL_INTERVAL_MS ? Number(env.CORK_BUILD_POLL_INTERVAL_MS) : 15000
};

export default config;
