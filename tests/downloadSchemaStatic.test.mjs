import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));

test('backend schema seeds the six 0.3.0 GitHub assets and exposes grouped counts', () => {
  const schemaPath = path.join(testDir, '..', 'tmp', 'backend', 'supabase_schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const expectedAssets = [
    'metis.0.3.0.Bundle.exe',
    'metis.0.3.0.Lite.exe',
    'metis.0.3.0.Bundle.macOS.arm64.dmg',
    'metis.0.3.0.Bundle.macOS.x64.dmg',
    'metis.0.3.0.Lite.macOS.arm64.dmg',
    'metis.0.3.0.Lite.macOS.x64.dmg',
  ];

  assert.match(schema, /create table if not exists public\.release_download_assets/);
  assert.match(schema, /create table if not exists public\.release_download_events/);
  assert.match(schema, /create or replace view public\.view_download_counts/);
  assert.match(schema, /sync_github_release_asset_download_count/);
  for (const asset of expectedAssets) {
    assert.match(schema, new RegExp(asset.replaceAll('.', '\\.')));
  }
});
