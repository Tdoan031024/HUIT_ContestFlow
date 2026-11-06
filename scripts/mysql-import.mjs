import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';

const [mysqlPath, host, port, user, database, backupFile] = process.argv.slice(2);
if (!mysqlPath || !host || !port || !user || !database || !backupFile) {
  console.error('Thiếu tham số kết nối MySQL hoặc tệp backup.');
  process.exit(2);
}

const mysql = spawn(mysqlPath, [
  '--protocol=TCP', `--host=${host}`, `--port=${port}`, `--user=${user}`, `--database=${database}`,
], { stdio: ['pipe', 'inherit', 'inherit'], env: process.env });
const input = createReadStream(backupFile);
input.on('error', (error) => {
  console.error(`Không đọc được tệp backup: ${error.message}`);
  mysql.kill();
});
mysql.on('error', (error) => {
  console.error(`Không chạy được mysql.exe: ${error.message}`);
  process.exitCode = 1;
});
mysql.on('close', (code) => { process.exitCode = code ?? 1; });
input.pipe(mysql.stdin);
