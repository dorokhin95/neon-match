// Упаковка dist-yandex в neon-match-yandex.zip для загрузки в Консоль Яндекс Игр.
// index.html обязан лежать в корне архива. Названия файлов — латиница без пробелов.

import { createWriteStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const DIST = 'dist-yandex';
const OUT = 'neon-match-yandex.zip';

// --- Минимальный writer ZIP-архива (store/deflate), без внешних зависимостей ---

class ZipWriter {
  constructor(stream) {
    this.stream = stream;
    this.entries = [];
    this.offset = 0;
  }
  async add(name, data) {
    const crc = crc32(data);
    const isDeflated = data.length > 0;
    const compressed = isDeflated ? deflateRawSync(data) : data;
    const method = isDeflated ? 8 : 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0x21, 12); // date (1996-01-01, deterministic)
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28); // extra length
    await write(this.stream, header);
    await write(this.stream, Buffer.from(name, 'utf8'));
    await write(this.stream, compressed);
    this.entries.push({ name, crc, compressedSize: compressed.length, size: data.length, offset: this.offset, method });
    this.offset += 30 + name.length + compressed.length;
  }
  async finalize() {
    const central = Buffer.alloc(46);
    const start = this.offset;
    for (const e of this.entries) {
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0, 8);
      central.writeUInt16LE(e.method, 10);
      central.writeUInt16LE(0, 12);
      central.writeUInt16LE(0x21, 14);
      central.writeUInt32LE(e.crc, 16);
      central.writeUInt32LE(e.compressedSize, 20);
      central.writeUInt32LE(e.size, 24);
      central.writeUInt16LE(e.name.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(e.offset, 42);
      await write(this.stream, central.subarray(0, 46));
      await write(this.stream, Buffer.from(e.name, 'utf8'));
      this.offset += 46 + e.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.offset - start, 12);
    end.writeUInt32LE(start, 16);
    end.writeUInt16LE(0, 20);
    await write(this.stream, end);
    this.stream.end();
  }
}

function write(stream, buf) {
  return new Promise((resolve, reject) => {
    stream.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function collect(dir, base = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await collect(join(dir, entry.name), rel)));
    else files.push(rel);
  }
  return files;
}

async function main() {
  const distStat = await stat(DIST).catch(() => null);
  if (!distStat?.isDirectory()) {
    console.error(`Error: ${DIST} not found. Run "npm run build:yandex" first.`);
    process.exit(1);
  }
  const files = await collect(DIST);
  if (!files.includes('index.html')) {
    console.error('Error: index.html is missing from the build root.');
    process.exit(1);
  }
  const bad = files.filter((f) => /[^\x20-\x7e]/.test(f) || /\s/.test(f));
  if (bad.length > 0) {
    console.error('Error: non-ASCII/space file names are not allowed for Yandex:', bad);
    process.exit(1);
  }
  const out = createWriteStream(OUT);
  const zip = new ZipWriter(out);
  for (const rel of files) {
    await zip.add(rel, await readFile(join(DIST, rel)));
  }
  await zip.finalize();
  const total = (await stat(OUT)).size;
  const mb = (total / 1024 / 1024).toFixed(2);
  console.log(`${OUT}: ${files.length} files, ${mb} MB (limit 100 MB)`);
  if (total > 100 * 1024 * 1024) {
    console.error('Error: archive exceeds the 100 MB Yandex Games limit.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
