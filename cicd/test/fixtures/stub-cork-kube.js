#!/usr/bin/env node
// Stands in for `cork-kube build gcb --no-wait` in command-runner tests:
// prints canned JSON to stdout based on the first argv value, without ever
// touching a real cork-kube/gcloud.
const mode = process.argv[2];

if (mode === 'success') {
  console.log(JSON.stringify({ buildId: 'build-123', status: 'success' }));
} else if (mode === 'error') {
  console.log(JSON.stringify({ status: 'error', message: 'boom' }));
} else if (mode === 'success-with-progress-output') {
  console.log('Using local cork-build-registry directory: /some/path');
  console.log('');
  console.log('Submitting build to Google Cloud project: some-project');
  console.log(JSON.stringify({ buildId: 'build-456', status: 'success' }));
} else {
  console.log('not json');
}
