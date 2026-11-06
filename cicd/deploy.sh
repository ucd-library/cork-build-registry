#!/usr/bin/env bash
#
# One-time (and re-runnable) setup for the nightly cork-build-registry build
# orchestrator as a Google Cloud Run Job, triggered nightly by Cloud
# Scheduler. This script is NOT meant to be run blindly - read it, fill in
# the TODO placeholders below with real values, and run each step yourself.
#
# Prerequisites:
#   - You have gcloud authenticated against the target GCP project.
#   - cork-kube is installed (Step 1 below uses it to build/push the image;
#     run from the repo root).

set -euo pipefail

GCP_PROJECT_ID="digital-ucdavis-edu"        # TODO: confirm this is the right GCP project
REGION="us-west1"                            # TODO: confirm region
IMAGE="us-west1-docker.pkg.dev/digital-ucdavis-edu/pub/cork-build-registry-cicd:main"
JOB_NAME="cork-build-registry-nightly"

RUNTIME_SA_NAME="cork-build-nightly-runner"
SCHEDULER_SA_NAME="cork-build-nightly-scheduler"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_INVOKER_SERVICE_ACCOUNT="${SCHEDULER_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

SCHEDULE="0 22 * * *"
TIME_ZONE="America/Los_Angeles"              # TODO: confirm desired timezone
TASK_TIMEOUT="21600s"                        # TODO: tune after observing a real run (max 604800s / 168h).
                                              # The job now waits for each wave of builds to actually
                                              # finish before submitting the next wave (see README.md
                                              # "Execution model: waves"), so this needs to cover the
                                              # slowest realistic end-to-end run, not just submission time.

# --- Step 0: create the two service accounts (skip if they already exist) ---
# See README.md "Service accounts" for what each one is for and why it needs
# exactly these roles and no more.
gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --display-name="cork-build-registry nightly build runner"

gcloud iam service-accounts create "${SCHEDULER_SA_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --display-name="Cloud Scheduler invoker for cork-build-registry nightly job"

# --- Step 1: build and push the cork-build-registry-cicd image --------------
# Run from the repo root, not from cicd/ - cork-kube resolves the image's
# context/build config from the root .cork-build file.
(cd "$(dirname "${BASH_SOURCE[0]}")/.." && cork-kube build gcb --project cork-build-registry --version main)

# --- Step 2: create/update the Cloud Run Job ---------------------------------
gcloud run jobs deploy "${JOB_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --project="${GCP_PROJECT_ID}" \
  --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
  --tasks=1 \
  --max-retries=0 \
  --task-timeout="${TASK_TIMEOUT}" \
  --memory=1Gi \
  --cpu=1

# --- Step 3: runtime service account needs to submit Cloud Build jobs -------
# (cork-kube build gcb shells out to `gcloud builds submit`)
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role="roles/cloudbuild.builds.editor"

# --- Step 4: allow the Scheduler's invoking identity to run this job --------
gcloud run jobs add-iam-policy-binding "${JOB_NAME}" \
  --region="${REGION}" \
  --project="${GCP_PROJECT_ID}" \
  --member="serviceAccount:${SCHEDULER_INVOKER_SERVICE_ACCOUNT}" \
  --role="roles/run.invoker"

# --- Step 5: nightly trigger -------------------------------------------------
gcloud scheduler jobs create http "${JOB_NAME}-trigger" \
  --project="${GCP_PROJECT_ID}" \
  --location="${REGION}" \
  --schedule="${SCHEDULE}" \
  --time-zone="${TIME_ZONE}" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCP_PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --http-method=POST \
  --oauth-service-account-email="${SCHEDULER_INVOKER_SERVICE_ACCOUNT}"

# --- Manual on-demand run (off-schedule, for testing) -----------------------
#   gcloud run jobs execute "${JOB_NAME}" --region="${REGION}" --project="${GCP_PROJECT_ID}"
