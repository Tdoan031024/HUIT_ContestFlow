const SIZE = 37; // QR version 5, error correction level L
const DATA_CODEWORDS = 108;
const ECC_CODEWORDS = 26;

function fieldTables() {
  const exponent = new Uint8Array(512);
  const logarithm = new Uint8Array(256);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    exponent[i] = value;
    logarithm[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) exponent[i] = exponent[i - 255];
  return { exponent, logarithm };
}

const gf = fieldTables();
function multiply(a: number, b: number) {
  return !a || !b ? 0 : gf.exponent[gf.logarithm[a] + gf.logarithm[b]];
}

function errorCorrection(data: number[]) {
  let generator = [1];
  for (let i = 0; i < ECC_CODEWORDS; i += 1) {
    const next = new Array<number>(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) {
      next[j] ^= generator[j];
      next[j + 1] ^= multiply(generator[j], gf.exponent[i]);
    }
    generator = next;
  }
  const message = [...data, ...new Array<number>(ECC_CODEWORDS).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = message[i];
    if (!factor) continue;
    for (let j = 0; j < generator.length; j += 1) message[i + j] ^= multiply(generator[j], factor);
  }
  return message.slice(data.length);
}

function codewords(value: string) {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.length > 106) throw new Error('Liên kết quá dài để tạo mã QR.');
  const bits: number[] = [];
  const push = (number: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((number >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);
  const maxBits = DATA_CODEWORDS * 8;
  push(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((n, bit) => (n << 1) | bit, 0));
  for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1) data.push(pad % 2 ? 0x11 : 0xec);
  return [...data, ...errorCorrection(data)];
}

function formatInformation(mask: number) {
  const data = (0b01 << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

export function createQrMatrix(value: string): boolean[][] {
  const matrix: Array<Array<boolean | null>> = Array.from({ length: SIZE }, () => new Array<boolean | null>(SIZE).fill(null));
  const set = (row: number, column: number, dark: boolean) => {
    if (row >= 0 && row < SIZE && column >= 0 && column < SIZE) matrix[row][column] = dark;
  };
  const finder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr += 1) for (let dc = -1; dc <= 7; dc += 1) {
      const row = top + dr;
      const column = left + dc;
      if (row < 0 || row >= SIZE || column < 0 || column >= SIZE) continue;
      const inFinder = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark = inFinder && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      set(row, column, dark);
    }
  };
  finder(0, 0);
  finder(0, SIZE - 7);
  finder(SIZE - 7, 0);
  for (let i = 8; i < SIZE - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) {
    set(30 + dr, 30 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  for (let i = 0; i < 15; i += 1) {
    if (i < 6) set(i, 8, false);
    else if (i < 8) set(i + 1, 8, false);
    else set(SIZE - 15 + i, 8, false);
    if (i < 8) set(8, SIZE - 1 - i, false);
    else if (i < 9) set(8, 15 - i, false);
    else set(8, 15 - 1 - i, false);
  }
  set(SIZE - 8, 8, true);

  const bits = codewords(value).flatMap((word) => Array.from({ length: 8 }, (_, index) => (word >>> (7 - index)) & 1));
  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const row = upward ? SIZE - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset;
        if (matrix[row][column] !== null) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex++] === 1 : false;
        set(row, column, bit !== ((row + column) % 2 === 0)); // mask 0
      }
    }
    upward = !upward;
  }

  const format = formatInformation(0);
  for (let i = 0; i < 15; i += 1) {
    const bit = ((format >>> i) & 1) !== 0;
    if (i < 6) set(i, 8, bit);
    else if (i < 8) set(i + 1, 8, bit);
    else set(SIZE - 15 + i, 8, bit);
    if (i < 8) set(8, SIZE - 1 - i, bit);
    else if (i < 9) set(8, 15 - i, bit);
    else set(8, 15 - 1 - i, bit);
  }
  set(SIZE - 8, 8, true);
  return matrix.map((row) => row.map(Boolean));
}

export function qrSvgPath(matrix: boolean[][]) {
  const quietZone = 4;
  const commands: string[] = [];
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) commands.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`); }));
  return { size: matrix.length + quietZone * 2, path: commands.join('') };
}
