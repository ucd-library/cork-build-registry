import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTopLevelVersion } from '../lib/version-selector.js';

test('picks the highest semver tag over main/dev/branch keys', () => {
  const selection = selectTopLevelVersion({
    builds: { '2.16.0': {}, '2.15.1': {}, 'sandbox': {} }
  });
  assert.equal(selection.version, '2.16.0');
  assert.equal(selection.reason, 'top-level: highest semver tag');
});

test('handles v-prefixed semver tags and ignores branch keys', () => {
  const selection = selectTopLevelVersion({
    builds: { 'v4.6.0': {}, 'v4.5.0': {}, 'sandbox': {}, 'stage': {}, 'intranet': {} }
  });
  assert.equal(selection.version, 'v4.6.0');
});

test('falls back to main when no semver tag exists', () => {
  const selection = selectTopLevelVersion({
    builds: { 'main': {}, 'sandbox': {} }
  });
  assert.equal(selection.version, 'main');
  assert.equal(selection.reason, 'top-level: main branch (no semver tag)');
});

test('falls back to dev when no semver tag or main exists', () => {
  const selection = selectTopLevelVersion({
    builds: { 'dev': {}, 'sandbox': {} }
  });
  assert.equal(selection.version, 'dev');
  assert.equal(selection.reason, 'top-level: dev branch (no semver tag or main)');
});

test('returns null when nothing qualifies', () => {
  const selection = selectTopLevelVersion({
    builds: { 'sandbox': {}, 'stage': {} }
  });
  assert.equal(selection, null);
});

test('ignores bare major-version keys like "16" (not valid semver)', () => {
  const selection = selectTopLevelVersion({
    builds: { '16': {} }
  });
  assert.equal(selection, null);
});

test('prefers semver over dev when both exist', () => {
  const selection = selectTopLevelVersion({
    builds: { '5.4.5': {}, 'dev': {} }
  });
  assert.equal(selection.version, '5.4.5');
});
