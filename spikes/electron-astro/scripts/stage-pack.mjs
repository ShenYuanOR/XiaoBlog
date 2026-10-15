import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(spikeRoot, 'site');
const stagedRoot = path.join(spikeRoot, 'resources', 'staged');
const templateRoot = path.join(stagedRoot, 'template');
const pnpmRoot = path.join(stagedRoot, 'pnpm');
const storeRoot = path.join(stagedRoot, 'store');
const packRoot = path.join(stagedRoot, 'pack');
const guideRoot = path.join(stagedRoot, 'guides');
const archivePath = path.join(stagedRoot, 'pnpm-store.tar.zst');

const tinyJpeg = Buffer.from(
  'ffd8ffdb00430006040506050406060506070706080a100a0a09090a140e0f0c1017141818171416161a1d251f1a1b231c1616202c20232627292a29191f2d302d283025282928ffdb0043010707070a080a130a0a13281a161a2828282828282828282828282828282828282828282828282828282828282828282828282828282828282828282828282828ffc00011080010001003012200021101031101ffc4001500010100000000000000000000000000000007ffc40014100100000000000000000000000000000000ffc40014010100000000000000000000000000000005ffc40014110100000000000000000000000000000000ffda000c03010002110311003f009b007c2bffd9',
  'hex',
);

function run(command, args, options = {}) {
  const line = [command, ...args].join(' ');
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/d', '/c', line], {
      stdio: 'inherit',
      windowsHide: true,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出码 ${code}`));
    });
  });
}

async function sha256(file) {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
}

async function findFile(dir, name) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(full, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return '';
}

const site = path.resolve(siteRoot);
await rm(stagedRoot, { recursive: true, force: true });
await mkdir(stagedRoot, { recursive: true });
await cp(site, templateRoot, {
  recursive: true,
  filter: (source) => {
    const relative = path.relative(site, source);
    if (!relative) return true;
    const parts = relative.split(path.sep);
    if (parts.includes('node_modules') || parts.includes('dist') || parts[0] === '.astro')
      return false;
    if (relative.replaceAll('\\', '/') === 'src/content/posts/big/cover.jpg') return false;
    return true;
  },
});
await writeFile(path.join(templateRoot, 'src', 'content', 'posts', 'big', 'cover.jpg'), tinyJpeg);

await mkdir(packRoot, { recursive: true });
await run('npm.cmd', ['pack', '@pnpm/exe.win32-x64@12.11.2', '--pack-destination', packRoot], {
  cwd: spikeRoot,
});
const packed = (await readdir(packRoot)).find((name) => name.endsWith('.tgz'));
if (!packed) throw new Error('没有下到 pnpm exe 包');
await mkdir(pnpmRoot, { recursive: true });
await run('C:\\Windows\\System32\\tar.exe', ['-xzf', path.join(packRoot, packed), '-C', pnpmRoot]);
const extracted = await findFile(pnpmRoot, 'pnpm.exe');
if (!extracted) throw new Error('包里没有 pnpm.exe');
if (path.resolve(extracted) !== path.resolve(pnpmRoot, 'pnpm.exe')) {
  await writeFile(path.join(pnpmRoot, 'pnpm.exe'), await readFile(extracted));
  await rm(path.join(pnpmRoot, 'package'), { recursive: true, force: true });
}

await mkdir(storeRoot, { recursive: true });
await run(path.join(pnpmRoot, 'pnpm.exe'), ['fetch', '--store-dir', storeRoot], {
  cwd: templateRoot,
});
await rm(path.join(templateRoot, 'node_modules'), { recursive: true, force: true });
await run('C:\\Windows\\System32\\tar.exe', [
  '-cf',
  path.join(stagedRoot, 'store.tar'),
  '-C',
  stagedRoot,
  'store',
]);
await run('zstd', ['-T0', '-19', '-f', path.join(stagedRoot, 'store.tar'), '-o', archivePath], {
  env: { ...process.env, MSYS2_ARG_CONV_EXCL: '*' },
});
await rm(path.join(stagedRoot, 'store.tar'), { force: true });
await rm(storeRoot, { recursive: true, force: true });
await rm(packRoot, { recursive: true, force: true });

await mkdir(guideRoot, { recursive: true });
await cp(
  path.join(spikeRoot, 'resources', 'guides', 'smartscreen.txt'),
  path.join(guideRoot, 'smartscreen.txt'),
);
const lockHash = await sha256(path.join(templateRoot, 'pnpm-lock.yaml'));
const archiveHash = await sha256(archivePath);
const archiveSize = (await stat(archivePath)).size;
const pnpmSize = (await stat(path.join(pnpmRoot, 'pnpm.exe'))).size;
await writeFile(
  path.join(guideRoot, 'checksums.txt'),
  `pnpm-lock.yaml ${lockHash}\npnpm-store.tar.zst ${archiveHash}\n`,
);
console.log(
  JSON.stringify({ archiveBytes: archiveSize, pnpmBytes: pnpmSize, lockHash, archiveHash }),
);
