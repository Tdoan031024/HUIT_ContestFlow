import { readFile } from 'node:fs/promises';
import mariadb from 'mariadb';

const cleanupFile = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!cleanupFile || !databaseUrl) throw new Error('Cleanup requires a SQL file and DATABASE_URL.');

const uri = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(uri.hostname)) throw new Error('Refusing to clean a non-local database.');
const sql = await readFile(cleanupFile, 'utf8');
const connection = await mariadb.createConnection({
  host: uri.hostname,
  port: Number(uri.port || 3306),
  user: decodeURIComponent(uri.username),
  password: decodeURIComponent(uri.password),
  database: decodeURIComponent(uri.pathname.replace(/^\//, '')),
  connectTimeout: 5000,
});
try {
  for (const statement of sql.split(';').map((value) => value.trim()).filter(Boolean)) {
    await connection.query(statement);
  }
} finally {
  await connection.end();
}
