import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir, ext) => readdirSync(dir, { recursive: true }).filter((f) => ext.some((e) => f.endsWith(e))).map((f) => join(dir, f));

test('texts use hyphen instead of em and en dashes', () => {
  const list = ['index.html', 'example.html', 'README.md', 'config.mjs', 'contract/README.md',
    ...files('app', ['.mjs', '.css']), ...files('api', ['.mjs'])];
  const bad = list.filter((f) => /[\u2013\u2014]/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});

test('config does not mention Overpass any more', () => {
  assert.ok(!/Overpass/.test(readFileSync('config.mjs', 'utf8')));
});
