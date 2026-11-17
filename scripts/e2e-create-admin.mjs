import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import mariadb from 'mariadb';

const connectionString = process.env.DATABASE_URL;
const email = process.env.HCF_E2E_ADMIN_EMAIL;
const password = process.env.HCF_E2E_ADMIN_PASSWORD;

if (!connectionString || !email || !password) throw new Error('Missing isolated E2E database or Admin fixture settings.');
if (!/^codex-e2e-admin\+[a-f0-9]{8}@huit\.test$/i.test(email)) throw new Error('Refusing to create an Admin outside the E2E email namespace.');
if (password.length < 12 || password.length > 128) throw new Error('E2E Admin password must be between 12 and 128 characters.');

const url = new URL(connectionString);
const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
if (url.protocol !== 'mysql:' || !localHosts.has(url.hostname.toLowerCase())) {
  throw new Error('E2E Admin creation is limited to a local MySQL database.');
}

const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
  charset: 'utf8mb4',
  connectTimeout: 3000,
});

const salt = randomBytes(16).toString('hex');
const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;

try {
  const existing = await connection.query('SELECT `id` FROM `users` WHERE `email` = ? LIMIT 1', [email]);
  if (existing.length) throw new Error('E2E Admin email already exists; refusing to overwrite an account.');
  await connection.query(
    "INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `full_name`, `system_role`, `is_active`, `created_at`, `updated_at`) VALUES (?, NULL, ?, ?, 'Temporary E2E Admin', 'ADMIN', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
    [randomUUID(), email, passwordHash],
  );
} finally {
  await connection.end();
}
