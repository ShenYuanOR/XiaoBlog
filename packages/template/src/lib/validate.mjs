import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkBuiltSite } from './links.mjs';
import { slugErrors } from './rules.mjs';
import { auditBuiltSite } from './seo-audit.mjs';

export { checkBuiltSite } from './links.mjs';
export { htmlPostProblems };

const DATE_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;

/** 与 posts.ts 的 scalar 一样去掉成对的单引号或双引号，不解释转义。 */
function unquoteScalar(value) {
  const text = value.trim();
  if (
    text.length >= 2 &&
    ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

/** 轻量 frontmatter 解析（只给校验用；引号规则与 src/lib/posts.ts 的 scalar 一致）。 */
function frontmatterFields(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) return null;
  const fields = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const entry = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!entry) continue;
    fields[entry[1]] = unquoteScalar(entry[2] ?? '');
  }
  return fields;
}

/** HTML 文章（index.html）的校验：格式互斥、必填 frontmatter 与基础类型。 */
function htmlPostProblems(postsDir, slugs) {
  const problems = [];
  for (const slug of slugs) {
    const dir = path.join(postsDir, slug);
    let files = [];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    const hasMarkdown = files.includes('index.md');
    const hasHtml = files.includes('index.html');
    if (hasMarkdown && hasHtml) {
      problems.push(
        `文章 ${slug} 同时存在 index.md 与 index.html；同一篇文章只能选一种格式（保留一个、删掉另一个）。`,
      );
      continue;
    }
    if (!hasHtml) continue;
    let source = '';
    try {
      source = readFileSync(path.join(dir, 'index.html'), 'utf8');
    } catch (error) {
      problems.push(
        `文章 ${slug} 的 index.html 读不到：${error instanceof Error ? error.message : '未知错误'}`,
      );
      continue;
    }
    const fields = frontmatterFields(source);
    if (!fields) {
      problems.push(
        `文章 ${slug} 的 index.html 缺少 --- frontmatter 头部（需要一个 title 和一个 date）。`,
      );
      continue;
    }
    if (!fields.title) problems.push(`文章 ${slug} 的 HTML frontmatter 缺少 title。`);
    if (!fields.date) problems.push(`文章 ${slug} 的 HTML frontmatter 缺少 date。`);
    else if (!DATE_RE.test(fields.date)) {
      problems.push(
        `文章 ${slug} 的 HTML frontmatter date 格式不对：${fields.date}（应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss）。`,
      );
    }
    for (const key of ['draft', 'noindex', 'standalone']) {
      const value = fields[key];
      if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') {
        problems.push(`文章 ${slug} 的 HTML frontmatter ${key} 只能是 true / false。`);
      }
    }
  }
  return problems;
}

export function xiaoValidate() {
  return {
    name: 'xiao-validate',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const dist = dir.pathname
          ? decodeURIComponent(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'))
          : String(dir);
        const distDir = dist.replace(/\/$/, '');
        let config = {};
        try {
          config = JSON.parse(readFileSync(path.join(process.cwd(), 'xiao.config.json'), 'utf8'));
        } catch {
          config = {};
        }
        const audited = auditBuiltSite(distDir, config);
        const reportDir = path.join(process.cwd(), '.xiao');
        mkdirSync(reportDir, { recursive: true });
        writeFileSync(
          path.join(reportDir, 'seo-report.json'),
          `${JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              siteUrl: config.site?.url ?? '',
              pageCount: audited.pages.length,
              issues: audited.issues,
              pages: audited.pages,
            },
            null,
            2,
          )}\n`,
        );
        const posts = path.join(process.cwd(), 'src', 'content', 'posts');
        let slugs = [];
        try {
          slugs = readdirSync(posts).filter((name) =>
            statSync(path.join(posts, name)).isDirectory(),
          );
        } catch {
          slugs = [];
        }
        const slugProblems = slugErrors(slugs);
        const htmlProblems = htmlPostProblems(posts, slugs);
        if (slugProblems.length > 0 || htmlProblems.length > 0) {
          throw new Error([...slugProblems, ...htmlProblems].join('\n'));
        }
        const broken = checkBuiltSite(distDir);
        if (broken.length > 0) {
          throw new Error(`站内死链：\n${broken.join('\n')}`);
        }
      },
    },
  };
}
