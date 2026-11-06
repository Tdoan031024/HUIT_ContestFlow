# HUIT ContestFlow

Responsive competition management and judging web application.

## Single Node.js application

The whole product runs as one Next.js application. The browser UI and server-side API use the same Node.js process: pages live in `src/app`, and backend endpoints live in `src/app/api`. MySQL is the persistent database; Prisma ORM manages the schema and migrations.

## Local development

1. Install Node.js 22 and npm.
2. Copy `.env.example` to `.env` and replace `ADMIN_SETUP_KEY` with a random value. Keep `.env` private.
3. Start MySQL with `docker compose up -d mysql` or use an existing MySQL 8+ instance.
4. Install packages with `npm install`.
5. Apply the committed schema with `npm run db:deploy`.
6. Start the web application with `npm run dev`.

Open `http://localhost:3000/setup` to create the first Admin account using the configured one-time setup key. After that, sign in at `/login`. The login page can keep a device signed in for 30 days; without that option, the browser session ends when the browser closes and the server session expires after 12 hours. Dashboard data is read from MySQL; no sample records are inserted automatically. `GET /api/health` checks the application and database connection.

To seed the local Admin account from PowerShell, set `HCF_ADMIN_SEED_PASSWORD` in the current terminal session and run `npm run db:seed-admin`. The seed defaults to the username `ContestFlow.Huitmedia`, stores only a scrypt password hash, and refuses to run against production or a non-local MySQL host. Do not put the seed password in `.env` or source control.

To seed a local Judge account, set `HCF_JUDGE_SEED_PASSWORD` in the current terminal session and run `npm run db:seed-judge`. It defaults to the username `Judge.Huitmedia`, stores only a scrypt password hash, and uses no email address. An Admin can assign this account to a round by entering its username in the Judge assignment form.

The administrator creates and assigns Judge accounts from a competition. Share initial passwords with each Judge through a separate secure channel. Judge accounts only see their assigned judging tasks; Judges can view published results for competitions they are assigned to.

## Included workflows

- Admin: create, edit, archive, and safely duplicate competitions; manage event details, rounds, contestant records and CSV import; create Judge accounts and reset a Judge password; configure score criteria and round policies; preview a rubric; coordinate the live entry; monitor score sheets; reopen a score with a reason; lock/publish results; export per-Judge and per-criterion CSV scores; and inspect audit events.
- Judge: sign in, see assigned tasks, save a draft while scoring, submit a score sheet, and review the submitted sheet.
- Responsive workspace layouts support desktop, tablet, and mobile browser widths.

## Verification

Run `npm run build` to check the production build and TypeScript. For the workflow check, start the app and run `npm run test:e2e` from PowerShell. The E2E script uses the configured `DATABASE_URL` and one-time `ADMIN_SETUP_KEY`; it creates temporary test accounts/competition records and removes them afterward. Run it only against an isolated development or test database where first-Admin setup is still enabled, never against production.

## MySQL backup and restore

`npm run db:backup` writes a timestamped SQL backup to the ignored `backups/` folder and prints its SHA-256 checksum. Restore only into an existing, verified target database. The script requires an explicit confirmation switch because matching tables in that target will be replaced:

```powershell
npm run db:restore -- -BackupFile "D:\backups\huit-contestflow-20261105-120000.sql" -TargetDatabase huit_contestflow_restore -ConfirmTargetDatabaseReplacement
```

The application database user must have the required permissions on the target. Keep backups outside source control, restrict access, and test restores against a separate database before relying on them for recovery.

## Deployment

Deploy this repository as one Node.js app using the host's Node.js application manager. Set `DATABASE_URL` and a strong, one-time `ADMIN_SETUP_KEY` in the host's environment, run `npm run db:deploy`, build with `npm run build`, then start with `npm start`. Once the first Admin is created, remove `ADMIN_SETUP_KEY` from the production environment to disable bootstrap. Apply committed migrations before each release and keep a database backup before deployment.

### GitHub Actions CI/CD

`.github/workflows/ci-cd.yml` validates the Prisma schema and builds with Node.js 22 on pull requests and pushes to `main`. A successful `main` build also creates a short-lived cPanel release artifact. Automatic deployment is disabled until the cPanel target is configured; then set the repository variable `CPANEL_DEPLOY_ENABLED=true`. The job also supports an explicit deploy through the workflow's `workflow_dispatch` input.

Configure these repository secrets: `CPANEL_HOST`, `CPANEL_USER`, `CPANEL_SSH_KEY`, `CPANEL_SSH_PORT`, and `CPANEL_KNOWN_HOSTS`. Configure repository variables: `CPANEL_APP_PATH` (the existing cPanel Node.js application root) and optionally `CPANEL_NODE_BIN` (defaults to the cPanel Node.js 22 path). Keep the production `.env` on the server; the uploaded artifact does not contain it. Set `CPANEL_AUTO_MIGRATE=true` only after reviewing migrations and confirming the production backup/restore process. The cPanel application must already use Node.js 22 and restart on `tmp/restart.txt`.

See `docs/TECH_STACK.md` for architecture decisions and the implementation sequence.
See `docs/DATABASE_OPERATIONS.md` for backup/restore details and the local recovery rehearsal.
