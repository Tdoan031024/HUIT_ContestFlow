import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import mariadb from 'mariadb';

const connectionString = process.env.DATABASE_URL;
const username = (process.env.HCF_ADMIN_SEED_USERNAME || 'ContestFlow.Huitmedia').trim().toLowerCase();
const password = process.env.HCF_ADMIN_SEED_PASSWORD;

if (!connectionString) throw new Error('DATABASE_URL is required.');
if (process.env.NODE_ENV === 'production') throw new Error('Admin seeding is disabled in production.');
if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)) throw new Error('Admin username is invalid.');
if (!password || password.length < 12 || password.length > 128) {
  throw new Error('Set HCF_ADMIN_SEED_PASSWORD to a password between 12 and 128 characters.');
}

const url = new URL(connectionString);
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (url.protocol !== 'mysql:' || !localHosts.has(url.hostname.toLowerCase())) {
  throw new Error('Admin seeding is limited to a local MySQL database.');
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
  await connection.beginTransaction();
  const existing = await connection.query(
    'SELECT `id` FROM `users` WHERE `username` = ? LIMIT 1 FOR UPDATE',
    [username],
  );
  const legacyAdmin = !existing.length && username === 'contestflow.huitmedia'
    ? await connection.query(
      "SELECT `id` FROM `users` WHERE `username` = 'contestflow' AND `system_role` = 'ADMIN' LIMIT 1 FOR UPDATE",
    )
    : [];
  const account = existing[0] || legacyAdmin[0];

  if (account) {
    await connection.query(
      "UPDATE `users` SET `username` = ?, `password_hash` = ?, `full_name` = 'ContestFlow', `system_role` = 'ADMIN', `is_active` = TRUE, `updated_at` = CURRENT_TIMESTAMP(3) WHERE `id` = ?",
      [username, passwordHash, account.id],
    );
    await connection.commit();
    console.log(`Admin account '${username}' updated.`);
  } else {
    await connection.query(
      "INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `full_name`, `system_role`, `is_active`, `created_at`, `updated_at`) VALUES (?, ?, NULL, ?, 'ContestFlow', 'ADMIN', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
      [randomUUID(), username, passwordHash],
    );
    await connection.commit();
    console.log(`Admin account '${username}' created.`);
  }
} catch (error) {
  await connection.rollback().catch(() => {});
  console.error(`Admin seeding failed (${error?.code || 'database error'}).`);
  process.exitCode = 1;
} finally {
  await connection.end();
}
