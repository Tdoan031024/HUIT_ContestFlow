export type ContestantCsvRow = { rowNumber: number; displayName: string; organization: string; email: string; phone: string; title: string };
export type ContestantCsvIssue = { rowNumber: number | null; message: string };

const aliases: Record<keyof Omit<ContestantCsvRow, 'rowNumber'>, string[]> = {
  displayName: ['ten', 'ten thi sinh', 'ho ten', 'ho va ten', 'ten doi', 'ten nhom', 'name', 'display name', 'full name', 'team name', 'contestant', 'contestant name'],
  organization: ['don vi', 'truong', 'truong don vi', 'organization', 'school', 'team'],
  email: ['email', 'thu dien tu'],
  phone: ['dien thoai', 'so dien thoai', 'phone', 'telephone'],
  title: ['ten de tai', 'de tai', 'ten san pham', 'title', 'project'],
};

export function previewContestantCsv(source: string) {
  const parsed = parseCsv(source.replace(/^\uFEFF/, ''));
  if (parsed.error) return { rows: [] as ContestantCsvRow[], totalRows: 0, issues: [{ rowNumber: parsed.error.line, message: parsed.error.message }] };
  const records = parsed.rows.filter((record) => record.values.some((value) => value.trim()));
  if (!records.length) return { rows: [] as ContestantCsvRow[], totalRows: 0, issues: [{ rowNumber: null, message: 'Tệp không có dòng dữ liệu.' }] };

  let dataRecords = records;
  let indexes = { displayName: 0, organization: 1, email: 2, phone: 3, title: 4 };
  const header = records[0].values.map(normalizeHeader);
  const nameColumn = header.findIndex((value) => aliases.displayName.includes(value));
  if (nameColumn >= 0) {
    dataRecords = records.slice(1);
    indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, header.findIndex((value) => names.includes(value))])) as typeof indexes;
  }
  const rows = dataRecords.map(({ values, line }, index) => ({
    rowNumber: line,
    displayName: get(values, indexes.displayName),
    organization: get(values, indexes.organization),
    email: get(values, indexes.email),
    phone: get(values, indexes.phone),
    title: get(values, indexes.title),
  }));
  const issues: ContestantCsvIssue[] = [];
  if (rows.length > 500) issues.push({ rowNumber: null, message: `Có ${rows.length} dòng; mỗi lần chỉ nhập tối đa 500 dòng.` });
  const seenEmails = new Set<string>();
  for (const row of rows) {
    if (row.displayName.length < 2 || row.displayName.length > 180) issues.push({ rowNumber: row.rowNumber, message: 'Tên phải có từ 2 đến 180 ký tự.' });
    if (row.organization.length > 180) issues.push({ rowNumber: row.rowNumber, message: 'Đơn vị không được vượt quá 180 ký tự.' });
    if (row.title.length > 180) issues.push({ rowNumber: row.rowNumber, message: 'Tên đề tài không được vượt quá 180 ký tự.' });
    if (row.phone.length > 32) issues.push({ rowNumber: row.rowNumber, message: 'Số điện thoại không được vượt quá 32 ký tự.' });
    if (row.email && (row.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) issues.push({ rowNumber: row.rowNumber, message: 'Email không hợp lệ.' });
    if (row.email) {
      const key = row.email.toLocaleLowerCase('en-US');
      if (seenEmails.has(key)) issues.push({ rowNumber: row.rowNumber, message: 'Email bị lặp trong tệp.' });
      seenEmails.add(key);
    }
  }
  if (!rows.length) issues.push({ rowNumber: null, message: 'Không tìm thấy dòng dữ liệu sau phần tiêu đề.' });
  return { rows: rows.slice(0, 500), totalRows: rows.length, issues };
}

function get(values: string[], index: number) { return index >= 0 ? (values[index] ?? '').trim() : ''; }
function normalizeHeader(value: string) { return value.trim().toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'); }

function parseCsv(value: string): { rows: { values: string[]; line: number }[]; error?: { line: number; message: string } } {
  const rows: { values: string[]; line: number }[] = [];
  let values: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') { cell += '"'; index += 1; }
      else if (quoted) quoted = false;
      else if (!cell.trim()) quoted = true;
      else cell += char;
    } else if (char === ',' && !quoted) {
      values.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && value[index + 1] === '\n') index += 1;
      values.push(cell); rows.push({ values, line: rowLine });
      values = []; cell = ''; line += 1; rowLine = line;
    } else {
      if (char === '\n') line += 1;
      cell += char;
    }
  }
  if (quoted) return { rows: [], error: { line: rowLine, message: 'Thiếu dấu nháy kép đóng trong tệp CSV.' } };
  if (cell || values.length) { values.push(cell); rows.push({ values, line: rowLine }); }
  return { rows };
}
