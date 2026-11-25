// Помощник тестов: проверка JSON по схемам контракта через tools/check_contract.py.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'locaction-contract-'));
let n = 0;

export function assertValid(kind, data) {
  const file = join(dir, `${kind}-${n++}.json`);
  writeFileSync(file, JSON.stringify(data));
  try {
    execFileSync('python', ['tools/check_contract.py', kind, file], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  } catch (error) {
    assert.fail(`${kind} не прошёл контракт:\n${error.stdout}`);
  }
}

export const example = (name) => JSON.parse(readFileSync(`contract/examples/${name}`, 'utf8'));
