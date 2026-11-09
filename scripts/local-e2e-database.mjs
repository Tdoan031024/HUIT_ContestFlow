import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import mariadb from 'mariadb';

const mode = process.argv[2];
const schema = process.env.HCF_E2E_SCHEMA ?? '';
const stateFile = process.env.HCF_E2E_STATE_FILE ?? '';
const baseUrl = process.env.DATABASE_URL;
if (!['ensure', 'mark', 'drop'].includes(mode)) throw new Error('Expected ensure, mark, or drop mode.');
if (!/^huit_contestflow_codex_e2e_[a-f0-9]{8}$/.test(schema)) throw new Error('Refusing a schema outside the isolated local E2E namespace.');
if (!stateFile || !baseUrl) throw new Error('Missing local E2E state path or DATABASE_URL.');

const uri = new URL(baseUrl);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(uri.hostname)) throw new Error('Refusing a non-local database host.');
const connection = await mariadb.createConnection({
  host: uri.hostname,
  port: Number(uri.port || 3306),
  user: decodeURIComponent(uri.username),
  password: decodeURIComponent(uri.password),
  connectTimeout: 8000,
});

try {
  if (mode === 'ensure') {
    const rows = await connection.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [schema]);
    if (rows.length) throw new Error(`Schema ${schema} already exists; refusing to reuse or clear it.`);
    const marker = randomBytes(32).toString('hex');
    await connection.query(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const databaseUrl = new URL(baseUrl);
    databaseUrl.pathname = `/${schema}`;
    await writeFile(stateFile, JSON.stringify({ schema, marker, databaseUrl: databaseUrl.toString() }), { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(`Created isolated schema ${schema}.\n`);
  } else if (mode === 'mark') {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    if (state.schema !== schema || !/^[a-f0-9]{64}$/.test(state.marker)) throw new Error('E2E database owner marker is invalid.');
    await connection.query(`CREATE TABLE \`${schema}\`.codex_e2e_owner (marker CHAR(64) NOT NULL PRIMARY KEY, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query(`INSERT INTO \`${schema}\`.codex_e2e_owner (marker) VALUES (?)`, [state.marker]);
    process.stdout.write(`Marked isolated schema ${schema}.\n`);
  } else {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    if (state.schema !== schema || !/^[a-f0-9]{64}$/.test(state.marker)) throw new Error('E2E database owner marker is invalid.');
    const table = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [schema, 'codex_e2e_owner']);
    if (table.length) {
      const rows = await connection.query(`SELECT marker FROM \`${schema}\`.codex_e2e_owner WHERE marker = ?`, [state.marker]);
      if (rows.length !== 1) throw new Error('E2E database marker not found; refusing to drop this schema.');
    }
    await connection.query(`DROP DATABASE \`${schema}\``);
    process.stdout.write(`Removed isolated schema ${schema}.\n`);
  }
} finally {
  await connection.end();
}
