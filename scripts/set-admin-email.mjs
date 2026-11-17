import mariadb from 'mariadb';

const connectionString = process.env.DATABASE_URL;
const username = (process.env.HCF_ADMIN_SEED_USERNAME || 'ContestFlow.Huitmedia').trim().toLowerCase();
const email = process.env.HCF_ADMIN_RECOVERY_EMAIL?.trim().toLowerCase();

if (!connectionString) throw new Error('DATABASE_URL is required.');
if (process.env.NODE_ENV === 'production') throw new Error('Admin email update is limited to local operations.');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set HCF_ADMIN_RECOVERY_EMAIL to a valid email address.');

const url = new URL(connectionString);
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (url.protocol !== 'mysql:' || !localHosts.has(url.hostname.toLowerCase())) {
  throw new Error('Admin email update is limited to a local MySQL database.');
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

try {
  await connection.beginTransaction();
  const accounts = await connection.query(
    "SELECT `id` FROM `users` WHERE `username` = ? AND `system_role` = 'ADMIN' LIMIT 1 FOR UPDATE",
    [username],
  );
  if (!accounts.length) throw new Error('Admin account not found.');
  const used = await connection.query('SELECT `id` FROM `users` WHERE `email` = ? AND `id` <> ? LIMIT 1 FOR UPDATE', [email, accounts[0].id]);
  if (used.length) throw new Error('That email is already assigned to another account.');
  await connection.query('UPDATE `users` SET `email` = ?, `updated_at` = CURRENT_TIMESTAMP(3) WHERE `id` = ?', [email, accounts[0].id]);
  await connection.commit();
  console.log(`Recovery email updated for Admin '${username}'.`);
} catch (error) {
  await connection.rollback().catch(() => {});
  console.error(`Admin email update failed (${error instanceof Error ? error.message : 'database error'}).`);
  process.exitCode = 1;
} finally {
  await connection.end();
}
