# MySQL operations

The application uses the `DATABASE_URL` from `.env` locally and from the host environment in production. Never commit `.env`, SQL backups, or a backup containing real contestant data.

## Create a backup on Windows

Install the MySQL client utilities (`mysqldump.exe`) or set `HCF_MYSQLDUMP_BIN` to its full path. Then run:

```powershell
npm run db:backup
```

The script creates `backups/huit-contestflow-<timestamp>.sql`, prints its size and SHA-256, and removes a partial file if the dump fails. Store the backup in protected storage with access limited to project operators. Keep more than one recent copy and retain the checksum with the copy.

## Restore to a separate database

Create an empty MySQL database first and grant the configured application user access to it. Verify the target name and backup file, then run:

```powershell
npm run db:restore -- -BackupFile "D:\backups\huit-contestflow-20261105-120000.sql" -TargetDatabase huit_contestflow_restore -ConfirmTargetDatabaseReplacement
```

The script does not create or drop databases. It imports the SQL dump into the explicitly named, existing target. The confirmation switch is required because tables with the same names in the target are replaced by the dump. Do not point a restore rehearsal at the active production database.

## Recovery rehearsal

1. Create a dedicated, empty restore database.
2. Restore a recent backup into that database.
3. Run `npm run db:deploy` against the restored database only if it is behind the current code's migration level.
4. Point a local application instance at the restore database and confirm `/api/health` reports `database: ok`.
5. Sign in with a test account and inspect a competition, its rubric, scores, result snapshot, and audit log.
6. Record the backup timestamp, checksum, restore duration, and any issue in the operations log.

The backup and restore scripts provide the local mechanics. Production retention, off-site storage, recovery-time objectives, HTTPS, and deployment credentials still need to be configured on the selected hosting environment.

## Local rehearsal record

On 2026-11-05, a backup from the isolated local MySQL instance was restored into a separate scratch database. The restore contained 17 tables and passed the table-count check; the scratch database was then removed. This verifies the local dump/import mechanics, not a production recovery target or recovery-time objective.
