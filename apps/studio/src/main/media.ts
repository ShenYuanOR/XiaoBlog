import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/**
 * 媒体库 v1（.agents/specs/article-redesign.md §4）。
 *
 * 设计原则：
 * - 不建私有索引文件：每次扫描站点目录得出列表与引用数（站点随项目走，可直接迁出）。
 * - 扫描范围固定为 `src/content/posts/**` 与 `public/**`，只认图片扩展名。
 * - 删除不是硬删：移到站点 `.xiao/trash/<时间戳>/<原相对路径>`，并让 `.xiao` 自忽略 git。
 * - 所有入参路径先做「站点内 + 无 .. + 图片扩展名」校验，非法一律中文报错。
 */

export const MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'] as const;

export type MediaExtension = (typeof MEDIA_EXTENSIONS)[number];

const MEDIA_EXT_SET = new Set<string>(MEDIA_EXTENSIONS);

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

/** 媒体扫描根（站点相对路径，`/` 分隔）。 */
export const MEDIA_ROOTS = ['src/content/posts', 'public'] as const;

/** 上传默认目标目录；实际会再按年份分子目录（spec §4：public/media/<yyyy>/<name>-<hash>.<ext>）。 */
export const DEFAULT_UPLOAD_TARGET = 'public/media';

/** 引用扫描的文本文件类型。 */
const REFERENCE_EXTENSIONS = new Set(['md', 'markdown', 'html', 'htm', 'astro', 'css']);

/** 扫描/替换引用时要跳过的目录（站点内不该出现，但用户目录可能混进来）。 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.astro',
  '.git',
  '.xiao',
  '.xiao-recycle',
  '.vite',
  'coverage',
  'release',
  'out',
]);

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_REFERENCE_FILE_BYTES = 1024 * 1024;
const MAX_FILENAME_CHARS = 120;

/** 匹配文本里的图片路径（相对 / 站内绝对）；允许中文文件名。 */
const IMAGE_REFERENCE =
  /(?:\.{0,2}\/)?[\w@%+~./\-\u4e00-\u9fa5]+\.(?:png|jpe?g|webp|gif|svg|avif)/gi;

export interface MediaItem {
  /** 站点相对路径，`/` 分隔。 */
  path: string;
  name: string;
  ext: string;
  /** 字节数。 */
  size: number;
  /** 修改时间（ISO 字符串）。 */
  mtime: string;
  /** 被引用次数（扫 md/markdown/html/htm/astro/css 里的相对与站内路径）。 */
  refs: number;
  /** refs === 0 即未引用。 */
  used: boolean;
  /** 缩略图地址：`xiao-asset://media/?site=…&path=…`。 */
  url: string;
}

export interface MediaUploadInput {
  name: string;
  /**
   * 文件字节。渲染层直接传 `Uint8Array`（结构化克隆，快）；
   * 也接受 `number[]`，方便旧的调用方与 node 用例。
   */
  bytes: number[] | Uint8Array;
}

export interface MediaUploadResult {
  uploaded: string[];
  failed: { name: string; reason: string }[];
}

export interface MediaDeleteResult {
  trashed: string[];
  /** 回收目录（站点相对路径），如 `.xiao/trash/2026-10-24T…`。 */
  trashDir: string;
  missing: string[];
}

export interface MediaRenameResult {
  from: string;
  to: string;
  /** 引用被改写的文本文件数。 */
  updatedFiles: number;
}

export interface MediaAsset {
  /** 磁盘绝对路径。 */
  file: string;
  mime: string;
}

/* ---------- 路径与校验 ---------- */

function existsFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function existsDir(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** 校验并返回站点根（绝对路径）。 */
function siteRoot(siteDir: string): string {
  if (typeof siteDir !== 'string' || !siteDir.trim()) throw new Error('还没有选择站点');
  const root = path.resolve(siteDir);
  if (!existsDir(root)) throw new Error('站点文件夹不存在或打不开');
  return root;
}

function insideRoot(root: string, full: string): boolean {
  const rel = path.relative(root, full);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function mediaExtension(name: string): string {
  return path
    .extname(String(name ?? ''))
    .replace(/^\./, '')
    .toLowerCase();
}

export function isMediaName(name: string): boolean {
  return MEDIA_EXT_SET.has(mediaExtension(name));
}

/**
 * 把外部传入的站点相对路径规整为 `/` 分隔；拒绝绝对路径与 `..`。
 * 只做路径安全，不管扩展名。
 */
export function normalizeSiteRelative(relPath: string): string {
  const raw = String(relPath ?? '')
    .trim()
    .replace(/\\/g, '/');
  if (!raw) throw new Error('路径不能为空');
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) throw new Error('只允许站点内的相对路径');
  const segments = raw.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new Error('路径不合法：不能包含 .. 或空段');
    }
  }
  return segments.join('/');
}

/** 媒体路径校验：站点内相对路径 + 图片扩展名。 */
export function normalizeMediaRelative(relPath: string): string {
  const rel = normalizeSiteRelative(relPath);
  if (!isMediaName(rel)) {
    throw new Error(`只支持 ${MEDIA_EXTENSIONS.join(' / ')} 图片`);
  }
  return rel;
}

function resolveInside(root: string, rel: string): string {
  const full = path.resolve(root, ...rel.split('/'));
  if (!insideRoot(root, full)) throw new Error('路径越出了站点文件夹');
  return full;
}

export function mediaUrl(siteDir: string, relPath: string): string {
  const site = encodeURIComponent(path.resolve(siteDir));
  const rel = encodeURIComponent(relPath);
  return `xiao-asset://media/?site=${site}&path=${rel}`;
}

/* ---------- 文件遍历 ---------- */

interface WalkHit {
  rel: string;
  full: string;
}

/**
 * 深度优先遍历 `startRel` 下的文件；跳过 node_modules / dist / .git / .xiao 等目录。
 * 不跟随软链接，避免站点里的链接把扫描/改写带出站点。
 */
function walkFiles(root: string, startRel: string, visit: (hit: WalkHit) => void): void {
  const start = startRel ? path.resolve(root, ...startRel.split('/')) : root;
  if (!existsDir(start)) return;
  const stack: WalkHit[] = [{ rel: startRel, full: start }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      entries = readdirSync(current.full, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const rel = current.rel ? `${current.rel}/${entry.name}` : entry.name;
      const full = path.join(current.full, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push({ rel, full });
        continue;
      }
      if (entry.isFile()) visit({ rel, full });
    }
  }
}

/** 扫描站点媒体文件（`src/content/posts/**` + `public/**`）。 */
function collectMediaPaths(root: string): string[] {
  const found: string[] = [];
  for (const startRel of MEDIA_ROOTS) {
    walkFiles(root, startRel, (hit) => {
      if (isMediaName(hit.rel)) found.push(hit.rel);
    });
  }
  return found.sort((a, b) => a.localeCompare(b, 'zh-Hans'));
}

/** 读取引用扫描需要的文本文件内容（跳过超大文件与媒体本身）。 */
function readReferenceSources(root: string): { rel: string; text: string }[] {
  const sources: { rel: string; text: string }[] = [];
  walkFiles(root, '', (hit) => {
    const ext = mediaExtension(hit.rel);
    if (!REFERENCE_EXTENSIONS.has(ext)) return;
    let size = 0;
    try {
      size = statSync(hit.full).size;
    } catch {
      return;
    }
    if (size > MAX_REFERENCE_FILE_BYTES) return;
    try {
      sources.push({ rel: hit.rel, text: readFileSync(hit.full, 'utf8') });
    } catch {
      // 读不了的文件不影响其余引用统计。
    }
  });
  return sources;
}

/* ---------- 引用计数 ---------- */

/** 把文本里的一条图片路径解析成站点相对路径（若它指向已知媒体）。 */
function resolveReference(reference: string, fromDir: string, targets: Set<string>): string | null {
  const value = reference.replace(/\\/g, '/');
  const candidates: string[] = [];
  if (value.startsWith('/')) {
    const tail = value.replace(/^\/+/, '');
    // 站内绝对路径：既可能是站点根下的文件，也可能是 public/ 映射（/media/... → public/media/...）。
    candidates.push(tail, `public/${tail}`);
  } else {
    const joined = path.posix.normalize(path.posix.join(fromDir, value));
    if (joined !== '..' && !joined.startsWith('../')) candidates.push(joined);
  }
  for (const candidate of candidates) {
    if (targets.has(candidate)) return candidate;
  }
  return null;
}

/** 统计目标媒体被引用次数；一次扫描复用到所有文件。 */
function countReferences(root: string, targets: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const target of targets) counts.set(target, 0);
  const sources = readReferenceSources(root);
  for (const source of sources) {
    const fromDir = path.posix.dirname(source.rel);
    for (const match of source.text.matchAll(IMAGE_REFERENCE)) {
      const resolved = resolveReference(match[0], fromDir, targets);
      if (resolved) counts.set(resolved, (counts.get(resolved) ?? 0) + 1);
    }
  }
  return counts;
}

/* ---------- 列表 ---------- */

/** 扫描媒体并计算引用数；UI 直接消费这个结果。 */
export function listMedia(siteDir: string): MediaItem[] {
  const root = siteRoot(siteDir);
  const paths = collectMediaPaths(root);
  const counts = countReferences(root, new Set(paths));
  const items: MediaItem[] = [];
  for (const rel of paths) {
    try {
      const full = path.join(root, ...rel.split('/'));
      const stat = statSync(full);
      if (!stat.isFile()) continue;
      const refs = counts.get(rel) ?? 0;
      items.push({
        path: rel,
        name: path.posix.basename(rel),
        ext: mediaExtension(rel),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        refs,
        used: refs > 0,
        url: mediaUrl(root, rel),
      });
    } catch {
      // 扫描期间文件被删/无权读取：跳过，不让整张列表挂掉。
    }
  }
  return items;
}

/* ---------- 缩略图协议 ---------- */

/** 解析缩略图请求：只允许站点内、图片扩展名的已存在文件。 */
export function resolveMediaAsset(siteDir: string, relPath: string): MediaAsset | null {
  try {
    const rel = normalizeMediaRelative(relPath);
    const root = siteRoot(siteDir);
    const full = resolveInside(root, rel);
    if (!existsFile(full)) return null;
    return { file: full, mime: MIME_TYPES[mediaExtension(rel)] ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}

/** 兼容旧的文章内图片协议（`?site=&slug=&name=`）：只读文章目录里的图片。 */
export function resolvePostImage(siteDir: string, slug: string, name: string): MediaAsset | null {
  try {
    const cleanSlug = String(slug ?? '').trim();
    const cleanName = String(name ?? '').trim();
    if (!cleanSlug || !cleanName) return null;
    if (cleanSlug.includes('/') || cleanSlug.includes('\\') || cleanSlug.includes('..'))
      return null;
    if (
      cleanName.includes('/') ||
      cleanName.includes('\\') ||
      cleanName.includes('..') ||
      cleanName.startsWith('.')
    ) {
      return null;
    }
    if (!isMediaName(cleanName)) return null;
    const root = siteRoot(siteDir);
    const full = path.join(root, 'src', 'content', 'posts', cleanSlug, cleanName);
    if (!insideRoot(root, full) || !existsFile(full)) return null;
    return {
      file: full,
      mime: MIME_TYPES[mediaExtension(cleanName)] ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/* ---------- 上传 ---------- */

/** 文件名主干：保留中英文与数字，空格/非法字符折叠成 `-`。 */
function slugifyBase(name: string): string {
  const base = String(name ?? '')
    .replace(/\.[^.]*$/, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase();
  return base.slice(0, 60) || 'image';
}

function uniquePath(dirFull: string, dirRel: string, base: string, ext: string): string {
  const hash = randomBytes(3).toString('hex');
  let candidate = `${base}-${hash}.${ext}`;
  let index = 2;
  while (existsFile(path.join(dirFull, candidate))) {
    candidate = `${base}-${hash}-${index}.${ext}`;
    index += 1;
  }
  return `${dirRel}/${candidate}`;
}

function validateUploadTarget(target: string): string {
  const rel = normalizeSiteRelative(target || DEFAULT_UPLOAD_TARGET);
  if (!rel.startsWith('public/') && !rel.startsWith('src/content/posts/')) {
    throw new Error('上传目录只能放在 public/ 或文章目录下');
  }
  return rel;
}

/**
 * 上传图片：`files[{name, bytes}]` 写进 `target`（默认 public/media，按年份分子目录）。
 * 文件名改为 `<原主干>-<随机 6 位>.<ext>`，重名自动加 `-2`、`-3` 后缀。
 * 单文件不合法只记入 failed，不影响其余文件。
 */
export function uploadMedia(
  siteDir: string,
  files: MediaUploadInput[],
  target = DEFAULT_UPLOAD_TARGET,
): MediaUploadResult {
  const root = siteRoot(siteDir);
  if (!Array.isArray(files) || files.length === 0) throw new Error('没有选择要上传的文件');
  const targetRel = validateUploadTarget(target);
  const year = String(new Date().getFullYear());
  const dirRel = targetRel === DEFAULT_UPLOAD_TARGET ? `${targetRel}/${year}` : targetRel;
  const dirFull = resolveInside(root, dirRel);
  mkdirSync(dirFull, { recursive: true });

  const result: MediaUploadResult = { uploaded: [], failed: [] };
  for (const file of files) {
    const name = typeof file?.name === 'string' ? file.name : '';
    try {
      if (!name) throw new Error('文件名不能为空');
      const ext = mediaExtension(name);
      if (!MEDIA_EXT_SET.has(ext)) {
        throw new Error(`只支持 ${MEDIA_EXTENSIONS.join(' / ')} 图片`);
      }
      const bytes = file.bytes;
      if (!bytes || bytes.length === 0) throw new Error('文件内容为空');
      if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('图片超过 50MB，先压缩再上传');
      const base = slugifyBase(name);
      const rel = uniquePath(dirFull, dirRel, base, ext);
      const full = resolveInside(root, rel);
      writeFileSync(full, Buffer.from(bytes));
      result.uploaded.push(rel);
    } catch (error) {
      result.failed.push({
        name: name || '（未命名文件）',
        reason: error instanceof Error ? error.message : '上传失败',
      });
    }
  }
  return result;
}

/* ---------- 删除 ---------- */

function ensureLocalIgnore(root: string): void {
  const dir = path.join(root, '.xiao');
  mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!existsSync(ignore)) {
    // `.xiao` 是站点本地资料（回收区/备份），不进 git、不进产物。
    writeFileSync(ignore, '*\n');
  }
}

function moveFile(from: string, to: string): void {
  mkdirSync(path.dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch {
    // 跨盘/权限特殊情况下退回复制 + 删除。
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

/**
 * 删除媒体：移动进 `.xiao/trash/<时间戳>/<原相对路径>`。
 * `force !== true` 且有引用时抛错（中文说明被谁引用），UI 二次确认后传 force。
 */
export function deleteMedia(siteDir: string, relPaths: string[], force = false): MediaDeleteResult {
  const root = siteRoot(siteDir);
  if (!Array.isArray(relPaths) || relPaths.length === 0) throw new Error('没有选择要删除的图片');
  const targets = relPaths.map((item) => normalizeMediaRelative(item));
  const unique = [...new Set(targets)];
  const counts = countReferences(root, new Set(unique));
  const referenced = unique.filter((rel) => (counts.get(rel) ?? 0) > 0);
  if (referenced.length > 0 && !force) {
    const detail = referenced
      .slice(0, 3)
      .map((rel) => `${rel}（${counts.get(rel) ?? 0} 处）`)
      .join('、');
    const suffix = referenced.length > 3 ? ` 等 ${referenced.length} 张` : '';
    throw new Error(`这些图片还被引用着：${detail}${suffix}。确认要连引用一起删吗？`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const trashDir = `.xiao/trash/${stamp}`;
  const trashFull = resolveInside(root, trashDir);
  ensureLocalIgnore(root);

  const trashed: string[] = [];
  const missing: string[] = [];
  for (const rel of unique) {
    const full = resolveInside(root, rel);
    if (!existsFile(full)) {
      missing.push(rel);
      continue;
    }
    moveFile(full, path.join(trashFull, ...rel.split('/')));
    trashed.push(rel);
  }
  return { trashed, trashDir, missing };
}

/* ---------- 重命名 ---------- */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** public/ 下的文件在站点里对应的 URL 路径；其它目录返回原相对路径。 */
function servedPath(rel: string): string {
  return rel.startsWith('public/') ? rel.slice('public/'.length) : rel;
}

/**
 * 尽力改写引用：只替换「精确路径片段」，不做正则模糊匹配。
 * 覆盖相对引用（`./x.png`、`../a/x.png`）、站内绝对引用（`/media/x.png`）、站点相对字面量。
 * 裸文件名（如 CSS `url(x.png)` 且同目录）不在覆盖范围，避免误伤同名文件。
 */
function rewriteReferences(root: string, oldRel: string, newRel: string): number {
  const sources = readReferenceSources(root);
  let updated = 0;
  for (const source of sources) {
    const fromDir = path.posix.dirname(source.rel);
    const pairs: [string, string][] = [];

    const relativeOld = path.posix.relative(fromDir, oldRel);
    const relativeNew = path.posix.relative(fromDir, newRel);
    if (relativeOld.startsWith('.')) {
      pairs.push([relativeOld, relativeNew]);
    } else {
      pairs.push([`./${relativeOld}`, `./${relativeNew}`]);
    }

    const absoluteOld = `/${servedPath(oldRel)}`;
    const absoluteNew = `/${servedPath(newRel)}`;
    pairs.push([absoluteOld, absoluteNew]);

    pairs.push([oldRel, newRel]);
    pairs.push([servedPath(oldRel), servedPath(newRel)]);

    const ordered = pairs
      .filter((pair) => pair[0] && pair[0] !== pair[1])
      .sort((a, b) => b[0].length - a[0].length);
    if (ordered.length === 0) continue;

    const lookup = new Map(ordered);
    const pattern = new RegExp(ordered.map((pair) => escapeRegExp(pair[0])).join('|'), 'g');
    const next = source.text.replace(pattern, (match) => lookup.get(match) ?? match);
    if (next === source.text) continue;
    try {
      writeFileSync(path.join(root, ...source.rel.split('/')), next);
      updated += 1;
    } catch {
      // 某个引用文件写不进去（只读/被占用）时继续处理其它文件。
    }
  }
  return updated;
}

function validateNewName(newName: string, fallbackExt: string): { base: string; ext: string } {
  const raw = String(newName ?? '').trim();
  if (!raw) throw new Error('新文件名不能为空');
  if (raw.includes('/') || raw.includes('\\')) throw new Error('新文件名不能包含路径分隔符');
  if (/[<>:"|?*\u0000-\u001f]/.test(raw)) throw new Error('新文件名不能包含 < > : " | ? * 等字符');
  if (raw.length > MAX_FILENAME_CHARS) throw new Error('新文件名太长');
  const givenExt = mediaExtension(raw);
  const ext = givenExt || fallbackExt;
  if (!MEDIA_EXT_SET.has(ext)) {
    throw new Error(`只支持 ${MEDIA_EXTENSIONS.join(' / ')} 图片`);
  }
  const base = givenExt ? raw.slice(0, raw.length - givenExt.length - 1).trim() : raw;
  if (!base) throw new Error('新文件名不能为空');
  if (base.startsWith('.')) throw new Error('新文件名不能以点开头');
  return { base, ext };
}

/**
 * 重命名媒体（同目录内），并尽力更新引用。
 * 返回实际改动文件数；目标已存在时中文报错。
 */
export function renameMedia(siteDir: string, relPath: string, newName: string): MediaRenameResult {
  const root = siteRoot(siteDir);
  const oldRel = normalizeMediaRelative(relPath);
  const oldFull = resolveInside(root, oldRel);
  if (!existsFile(oldFull)) throw new Error('要重命名的图片不存在了，刷新列表再试');
  const { base, ext } = validateNewName(newName, mediaExtension(oldRel));
  const dir = path.posix.dirname(oldRel);
  const newRel = dir === '.' ? `${base}.${ext}` : `${dir}/${base}.${ext}`;
  if (newRel === oldRel) return { from: oldRel, to: newRel, updatedFiles: 0 };
  const newFull = resolveInside(root, newRel);
  if (existsFile(newFull)) throw new Error('同一目录下已经有同名文件，换一个名字再试');
  renameSync(oldFull, newFull);
  const updatedFiles = rewriteReferences(root, oldRel, newRel);
  return { from: oldRel, to: newRel, updatedFiles };
}
