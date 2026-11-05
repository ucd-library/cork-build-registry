# cork-build-registry-cicd

Nightly build orchestrator for this registry. Computes the set of
`(project, version)` builds needed this run - the latest build of every
project, plus every version any of those builds pin a dependency to - dedupes
it, orders it so dependencies build before dependents, and (optionally) runs
`cork-kube build gcb` for each one.

## Version selection (per project)

0. If the project's `repositories/<name>.json` has `"cicd": false` at its
   root, it is never selected as a top-level build target - the dry-run
   output still prints why. It can still end up in the plan anyway if some
   other project's build pins a specific version of it as a dependency, since
   that dependent genuinely needs that version to exist.
1. Highest valid semver tag among that project's `builds` keys.
2. Else `main`, if present.
3. Else `dev`, if present.
4. Else the project is skipped for this run (it may still be pulled in by
   another project's dependency pin).

## Usage

```bash
# Print the plan without building anything (default)
node bin/cork-build-nightly.js --registry-path /path/to/cork-build-registry

# Actually run the builds
node bin/cork-build-nightly.js --exec

# Restrict to one or more projects (dependency pull-in still applies)
node bin/cork-build-nightly.js -p postgres --exec
```

## Flags / environment variables

| Flag | Env var | Default | Description |
| --- | --- | --- | --- |
| `--exec` | `CORK_BUILD_EXEC=true` | off | Actually run builds instead of just printing the plan |
| `--registry-url <url>` | `CORK_BUILD_REGISTRY_URL` | this repo on GitHub | Registry git URL to clone |
| `--registry-ref <ref>` | `CORK_BUILD_REGISTRY_REF` | `main` | Registry git ref to clone |
| `--registry-path <path>` | - | - | Use a local registry checkout instead of cloning |
| `--gcb-project <id>` | `CORK_GCB_PROJECT` | cork-kube's own default | GCP project to submit builds to |
| `--high-cpu` | `CORK_HIGH_CPU=true` | off | Use a high-cpu Cloud Build machine type |
| `-p, --project <name>` | - | all projects | Restrict top-level selection to named project(s), repeatable |
| `--poll-interval-ms <ms>` | `CORK_BUILD_POLL_INTERVAL_MS` | `15000` | How often to poll Cloud Build for a wave's build status |

`cork-kube` and `gcloud` are resolved via `$PATH` by default; override with
`CORK_KUBE_BIN` / `CORK_GCLOUD_BIN` if needed (mainly useful for testing
against stub binaries).

## Execution model: waves

The build plan is grouped into topological "waves": every project in a wave
is independent of every other project in that same wave (neither depends on
the other), and every project in a wave has all of its dependencies already
built in an earlier wave.

For each wave, in order:

1. Every project in the wave is submitted to Cloud Build via `cork-kube build
   gcb --no-wait`, which hands the build off and immediately returns
   `{"buildId": "...", "status": "success"}` (or `{"status": "error",
   "message": "..."}` if submission itself was rejected) rather than
   streaming logs until the build finishes.
2. This job then polls Cloud Build (`gcloud builds describe`) for every build
   ID submitted in that wave, until all of them reach a terminal status.
3. Only once the whole wave is done does the next wave get submitted.

This keeps the guarantee that matters - a dependency's image actually exists
in Artifact Registry before a dependent's build starts - while still letting
independent projects build in parallel within a wave, instead of the fully
serial one-at-a-time execution this job used before build IDs were
available. `built`/`failed` in the summary below reflect real Cloud Build
outcomes, not just whether submission was accepted.

## Failure handling

A build is treated as failed if either cork-kube rejects the submission
before it ever reaches Cloud Build (e.g. a registry data problem), or the
build runs in Cloud Build and finishes with a non-`SUCCESS` status. Either
way, everything that transitively depends on it is skipped rather than
submitted in a later wave, while every independent branch keeps going. The
process exits non-zero if anything failed, anything was skipped as a result,
or the registry data itself had a problem (an unresolvable version pin, or a
dependency cycle).

Real build failures also still fire the `--notify error` Slack notification
from cork-kube itself, same as any other build - this job's own summary and
exit code are a second, structured signal on top of that, not a replacement
for it.

## Local testing

`npm test` runs hermetic unit tests against `test/fixtures/registry` (no
network, no `cork-kube`, no `gcloud`). To sanity-check against this repo's
real, live data with zero network calls or credentials, run from the repo
root:

```bash
node cicd/bin/cork-build-nightly.js --registry-path .
```

## Deployment

See `deploy.sh` for the Cloud Run Job + Cloud Scheduler setup (nightly at
10pm). The image is built the same way every other image in this repo is
built - via its entry in the root `.cork-build` file:

```bash
cork-kube build gcb --project cork-build-registry --version main --no-cache
```

### Service accounts

Two separate, narrowly-scoped service accounts are used - one to run the job,
one only to let Cloud Scheduler trigger it. `deploy.sh` creates both (Step 0)
and grants each exactly the one role it needs; this section explains why.

**1. Runtime service account** (`cork-build-nightly-runner`) - this is the
identity the Cloud Run Job actually executes as. The orchestrator itself only
needs to `git clone` the (public) registry repo and run `cork-kube build gcb`,
which submits a build to Cloud Build - it does not push images or touch
Artifact Registry directly (the Cloud Build execution itself does that, under
its own service account, which is separate, pre-existing project
configuration and not something this job needs permissions for). So this
account needs exactly:

| Role | Why |
| --- | --- |
| `roles/cloudbuild.builds.editor` (project-level) | Lets it call `gcloud builds submit`, which is what `cork-kube build gcb` shells out to for every build in the plan |

Create it and grant the role:

```bash
gcloud iam service-accounts create cork-build-nightly-runner \
  --project="${GCP_PROJECT_ID}" \
  --display-name="cork-build-registry nightly build runner"

gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:cork-build-nightly-runner@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"
```

**2. Scheduler invoker service account** (`cork-build-nightly-scheduler`) -
this account is never used to do any work. Cloud Scheduler authenticates as
it (via an OIDC token) purely to call the Cloud Run Admin API's `:run`
endpoint for this one job. It needs exactly:

| Role | Why |
| --- | --- |
| `roles/run.invoker`, scoped to the `cork-build-registry-nightly` Cloud Run Job only (not project-wide) | Lets Cloud Scheduler start an execution of this specific job and nothing else |

Create it and grant the role (the job must already exist - this comes after
Step 1 in `deploy.sh`):

```bash
gcloud iam service-accounts create cork-build-nightly-scheduler \
  --project="${GCP_PROJECT_ID}" \
  --display-name="Cloud Scheduler invoker for cork-build-registry nightly job"

gcloud run jobs add-iam-policy-binding cork-build-registry-nightly \
  --region="${REGION}" \
  --project="${GCP_PROJECT_ID}" \
  --member="serviceAccount:cork-build-nightly-scheduler@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

Neither account should ever be granted `roles/editor`, `roles/owner`, or any
broader Cloud Build/Run role than the two above - both are deliberately
single-purpose so a compromise of either has minimal blast radius.
