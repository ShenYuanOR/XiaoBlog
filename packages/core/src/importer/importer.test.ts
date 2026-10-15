import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { apply, readRedirectRules, scan } from './index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const corpusPosts = path.resolve(here, '../markdown/corpus/posts');
const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'xiao-import-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeSite(root: string, redirects: Record<string, string> = {}): string {
  const configPath = path.join(root, 'xiao.config.json');
  writeFileSync(configPath, `${JSON.stringify({ site: { title: '晓' }, redirects }, null, 2)}\n`);
  return configPath;
}

describe('三个来源适配器', () => {
  it('Hexo 把同目录图片收进文章文件夹', () => {
    const root = tempDir();
    const postsDir = path.join(root, 'source', '_posts');
    mkdirSync(postsDir, { recursive: true });
    writeFileSync(path.join(postsDir, 'pic.png'), 'png');
    writeFileSync(
      path.join(postsDir, 'hello.md'),
      '---\ntitle: Hello Hexo\ndate: 2026-01-02 03:04:05\ncategories: 笔记\n---\n\n![图](./pic.png)\n',
    );
    const report = scan({ name: 'hexo', postsDir });
    expect(report.posts).toHaveLength(1);
    expect(report.posts[0]?.slug).toBe('hello');
    expect(report.posts[0]?.category).toBe('笔记');
    expect(report.posts[0]?.images[0]?.exists).toBe(true);
    const configPath = writeSite(root);
    const applied = apply(report, { contentDir: path.join(root, 'out'), configPath });
    expect(applied.imagesCopied).toBe(1);
    const markdown = readFileSync(path.join(root, 'out', 'hello', 'index.md'), 'utf8');
    expect(markdown).toContain('](./pic.png)');
    expect(readFileSync(path.join(root, 'out', 'hello', 'pic.png'), 'utf8')).toBe('png');
  });

  it('Valaxy 用拼音 slug，并把旧 /posts/ 路径写进配置', () => {
    const root = tempDir();
    const postsDir = path.join(root, 'pages', 'posts');
    const publicDir = path.join(root, 'public');
    mkdirSync(path.join(publicDir, 'posts', '2024-02-01-zhong-wen'), { recursive: true });
    mkdirSync(postsDir, { recursive: true });
    writeFileSync(path.join(publicDir, 'posts', '2024-02-01-zhong-wen', 'a.png'), 'png');
    writeFileSync(
      path.join(postsDir, '2024-02-01-zhong-wen.md'),
      '---\ntitle: 中文\ndate: 2024-02-01\n---\n\n![图](/posts/2024-02-01-zhong-wen/a.png)\n',
    );
    const report = scan({
      name: 'valaxy',
      postsDir,
      publicDir,
      siteUrl: 'https://old.example',
    });
    expect(report.posts[0]?.slug).toBe('zhong-wen');
    expect(report.posts[0]?.oldUrl).toBe('https://old.example/posts/2024-02-01-zhong-wen');
    const configPath = writeSite(root);
    apply(report, { contentDir: path.join(root, 'out'), configPath });
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      redirects: Record<string, string>;
    };
    expect(config.redirects['/posts/2024-02-01-zhong-wen']).toBe('/posts/zhong-wen/');
    expect(readFileSync(path.join(root, 'out', 'zhong-wen', 'index.md'), 'utf8')).toContain(
      '](./a.png)',
    );
  });

  it('1.x 样例文章内容完整，图片改相对路径，旧文件名有重定向', () => {
    const root = tempDir();
    const report = scan({ name: 'xiao', postsDir: corpusPosts });
    expect(report.summary.total).toBe(2);
    expect(report.summary.missingImages).toBe(0);
    expect(report.slugConflicts).toEqual([]);
    const hello = report.posts.find((post) => post.slug === 'hello-xiao');
    const draft = report.posts.find((post) => post.slug === 'draft-test');
    expect(hello?.title).toBe('你好，晓');
    expect(hello?.content).toContain('图片归位测试');
    expect(hello?.content).toContain('![测试图片](/images/hello-xiao/2026-08-14-test-image.svg)');
    expect(hello?.images[0]?.exists).toBe(true);
    expect(draft?.draft).toBe(true);
    const yml = path.join(root, 'redirects.yml');
    writeFileSync(
      yml,
      'redirects:\n  - from: /manual-old\n    to: /posts/hello-xiao/\n    status: 301\n',
    );
    const configPath = writeSite(root, { '/kept': '/posts/hello-xiao/' });
    const applied = apply(report, {
      contentDir: path.join(root, 'src', 'content', 'posts'),
      configPath,
      redirectsFile: yml,
    });
    expect(applied.written).toHaveLength(2);
    expect(applied.imagesCopied).toBe(1);
    const markdown = readFileSync(
      path.join(root, 'src', 'content', 'posts', 'hello-xiao', 'index.md'),
      'utf8',
    );
    expect(markdown).toContain('title: "你好，晓"');
    expect(markdown).toContain('图片归位测试');
    expect(markdown).toContain('![测试图片](./2026-08-14-test-image.svg)');
    expect(markdown).toContain('[归档](/archives)');
    expect(markdown).toContain('category: "生活"');
    expect(
      readFileSync(path.join(root, 'src', 'content', 'posts', 'draft-test', 'index.md'), 'utf8'),
    ).toContain('draft: true');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      redirects: Record<string, string>;
    };
    expect(config.redirects['/kept']).toBe('/posts/hello-xiao/');
    expect(config.redirects['/manual-old']).toBe('/posts/hello-xiao/');
    expect(config.redirects['/2026-08-14-hello-xiao']).toBe('/posts/hello-xiao/');
    expect(config.redirects['/posts/2026-08-14-hello-xiao']).toBe('/posts/hello-xiao/');
    expect(config.redirects['/2026-08-14-draft-test']).toBeUndefined();
    const again = apply(report, {
      contentDir: path.join(root, 'src', 'content', 'posts'),
      configPath,
    });
    expect(again.skipped).toContain('hello-xiao（目标已存在）');
  });

  it('空的 redirects.yml 与 slug 冲突', () => {
    expect(readRedirectRules('redirects: []\n')).toEqual([]);
    const root = tempDir();
    const postsDir = path.join(root, 'posts');
    mkdirSync(postsDir, { recursive: true });
    const body = '---\ntitle: A\nslug: same\ndate: 2026-01-01 00:00:00\n---\n\n正文\n';
    writeFileSync(path.join(postsDir, '2026-01-01-a.md'), body);
    writeFileSync(path.join(postsDir, '2026-01-02-b.md'), body.replace('title: A', 'title: B'));
    const report = scan({ name: 'xiao', postsDir });
    expect(report.slugConflicts.some((item) => item.includes('slug 冲突'))).toBe(true);
  });
});
