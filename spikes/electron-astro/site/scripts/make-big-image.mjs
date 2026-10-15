import { randomFillSync } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'content', 'posts', 'big', 'cover.jpg');
const minBytes = 20 * 1024 * 1024;
const width = 5000;
const height = 4000;
const raw = Buffer.allocUnsafe(width * height * 3);
randomFillSync(raw);
await mkdir(path.dirname(out), { recursive: true });
await sharp(raw, { raw: { width, height, channels: 3 } })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(out);
const { size } = await stat(out);
if (size < minBytes) {
  throw new Error(`大图只有 ${size} 字节，未达到 20MB`);
}
console.log(`${out} ${size}`);
