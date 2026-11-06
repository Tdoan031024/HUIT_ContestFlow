import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import mariadb from 'mariadb';

const connectionString = process.env.DATABASE_URL;
const username = (process.env.HCF_JUDGE_SEED_USERNAME || 'Judge.Huitmedia').trim().toLowerCase();
const fullName = (process.env.HCF_JUDGE_SEED_FULL_NAME || 'Tài khoản Giám khảo').trim();
const password = process.env.HCF_JUDGE_SEED_PASSWORD;

if (!connectionString) throw new Error('DATABASE_URL is required.');
if (process.env.NODE_ENV === 'production') throw new Error('Judge seeding is disabled in production.');
if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)) throw new Error('Judge username is invalid.');
if (fullName.length < 2 || fullName.length > 160) throw new Error('Judge full name is invalid.');
if (!password || password.length < 12 || password.length > 128) {
  throw new Error('Set HCF_JUDGE_SEED_PASSWORD to a password between 12 and 128 characters.');
}

const url = new URL(connectionString);
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (url.protocol !== 'mysql:' || !localHosts.has(url.hostname.toLowerCase())) {
  throw new Error('Judge seeding is limited to a local MySQL database.');
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
    'SELECT `id`, `system_role` FROM `users` WHERE `username` = ? LIMIT 1 FOR UPDATE',
    [username],
  );

  if (existing.length && existing[0].system_role !== 'JUDGE') {
    throw new Error('The requested username belongs to a non-judge account.');
  }

  if (existing.length) {
    await connection.query(
      'UPDATE `users` SET `password_hash` = ?, `full_name` = ?, `is_active` = TRUE, `updated_at` = CURRENT_TIMESTAMP(3) WHERE `id` = ?',
      [passwordHash, fullName, existing[0].id],
    );
    await connection.commit();
    console.log(`Judge account '${username}' updated.`);
  } else {
    await connection.query(
      "INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `full_name`, `system_role`, `is_active`, `created_at`, `updated_at`) VALUES (?, ?, NULL, ?, ?, 'JUDGE', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
      [randomUUID(), username, passwordHash, fullName],
    );
    await connection.commit();
    console.log(`Judge account '${username}' created.`);
  }
} catch (error) {
  await connection.rollback().catch(() => {});
  const code = error?.code || (error instanceof Error ? 'seed error' : 'database error');
  console.error(`Judge seeding failed (${code}).`);
  process.exitCode = 1;
} finally {
  await connection.end();
}
