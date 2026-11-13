import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = new URL('../supabase-schema.sql', import.meta.url);
const output = new URL('../public/supabase-schema.sql', import.meta.url);
const sql = await readFile(source, 'utf8');
assert.ok(sql.includes('BEGIN;') && sql.includes('COMMIT;'), 'The complete installation transaction is required.');
assert.ok(!/\bDROP\s+(TABLE|SCHEMA)\b/i.test(sql), 'Do not distribute a destructive installation script.');

if (process.argv.includes('--check')) {
  assert.equal(await readFile(output, 'utf8'), sql, 'Run node scripts/export-sql.mjs after changing the canonical SQL file.');
} else {
  await mkdir(new URL('../public/', import.meta.url), { recursive: true });
  await copyFile(source, output);
}

console.log(`Complete SQL: ${sql.trimEnd().split('\n').length} lines, SHA-256 ${createHash('sha256').update(sql).digest('hex')}`);