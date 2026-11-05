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

test('treats a bare major-version key like "16" as 16.0.0', () => {
  const selection = selectTopLevelVersion({
    builds: { '16': {} }
  });
  assert.equal(selection.version, '16');
  assert.equal(selection.reason, 'top-level: highest semver tag');
});

test('treats a partial "16.0" key the same as "16"', () => {
  const selection = selectTopLevelVersion({
    builds: { '16.0': {} }
  });
  assert.equal(selection.version, '16.0');
});

test('picks the highest among a mix of bare, partial, and full version keys', () => {
  const selection = selectTopLevelVersion({
    builds: { '9': {}, '16': {}, '16.4': {}, 'main': {} }
  });
  assert.equal(selection.version, '16.4');
});

test('still ignores non-numeric branch keys even when they contain digits', () => {
  const selection = selectTopLevelVersion({
    builds: { 'feature-123': {}, 'main': {} }
  });
  assert.equal(selection.version, 'main');
});

test('prefers semver over dev when both exist', () => {
  const selection = selectTopLevelVersion({
    builds: { '5.4.5': {}, 'dev': {} }
  });
  assert.equal(selection.version, '5.4.5');
});
