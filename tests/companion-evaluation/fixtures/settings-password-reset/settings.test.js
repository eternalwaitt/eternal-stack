import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSettings } from './src/settings/page.js';

test('blank display name renders the documented anonymous label', () => {
  assert.match(renderSettings({ displayName: '' }), /Anonymous/);
});

test('missing display name does not crash the settings page', () => {
  assert.match(renderSettings({}), /Anonymous/);
});
