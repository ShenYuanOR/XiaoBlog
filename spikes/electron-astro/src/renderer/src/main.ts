import { shikiToMonaco } from '@shikijs/monaco';
import * as monaco from 'monaco-editor';
import 'monaco-editor/language/css/monaco.contribution';
import 'monaco-editor/language/html/monaco.contribution';
import 'monaco-editor/language/json/monaco.contribution';
import 'monaco-editor/language/typescript/monaco.contribution';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import { createHighlighter } from 'shiki';

const astroSample = `---
const title = "晓"
---
<div class="card">
  <p>{title}</p>
</div>
<style>
  .card { color: red; }
</style>
`;

const samples = {
  astro: astroSample,
  markdown: '# 标题\n\n一段 **粗体**。\n',
  css: '.card {\n  color: red;\n}\n',
  typescript: 'const title: string = "晓"\ntitle.\n',
  json: '{\n  "title": "晓"\n}\n',
};

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

const csp: string[] = [];
document.addEventListener('securitypolicyviolation', (event) => {
  csp.push(event.violatedDirective);
});

const host = document.querySelector('#editor');
const status = document.querySelector('#status');
if (!(host instanceof HTMLDivElement) || !(status instanceof HTMLElement)) {
  throw new Error('页面结构不对');
}
const editorHost = host;

monaco.languages.register({ id: 'astro' });
monaco.languages.setLanguageConfiguration('astro', {
  comments: { blockComment: ['<!--', '-->'] },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
    ['<', '>'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
});

const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['astro', 'markdown', 'css', 'typescript', 'json'],
});
shikiToMonaco(highlighter, monaco);

const editor = monaco.editor.create(editorHost, {
  value: samples.astro,
  language: 'astro',
  theme: 'github-light',
  automaticLayout: true,
});

let dark = false;
document.querySelector('#theme')?.addEventListener('click', () => {
  dark = !dark;
  monaco.editor.setTheme(dark ? 'github-dark' : 'github-light');
});

function tokenTypes(source: string, language: string): string[] {
  return [
    ...new Set(monaco.editor.tokenize(source, language).flatMap((line) => line.map((token) => token.type))),
  ];
}

async function completionCount(language: 'typescript' | 'css' | 'json', source: string, line: number, column: number): Promise<number> {
  const extension = language === 'typescript' ? 'ts' : language;
  const model = monaco.editor.createModel(
    source,
    language,
    monaco.Uri.parse(`file:///demo/sample.${extension}`),
  );
  editor.setModel(model);
  editor.setPosition({ lineNumber: line, column });
  editor.trigger('xiao', 'editor.action.triggerSuggest', {});
  const deadline = Date.now() + 4000;
  let count = 0;
  while (Date.now() < deadline) {
    count = document.querySelectorAll('.suggest-widget .monaco-list-row').length;
    if (count > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  editor.trigger('xiao', 'hideSuggestWidget', {});
  model.dispose();
  editor.setModel(null);
  return count;
}

function backgroundColor(): string {
  const node = editorHost.querySelector('.monaco-editor');
  return node instanceof HTMLElement ? getComputedStyle(node).backgroundColor : '';
}

interface CheckResult {
  astroTypes: string[];
  markdownTypes: string[];
  light: string;
  dark: string;
  typescript: number;
  css: number;
  json: number;
  csp: string[];
}

async function check(): Promise<CheckResult> {
  monaco.editor.setTheme('github-light');
  const light = backgroundColor();
  monaco.editor.setTheme('github-dark');
  const darkBackground = backgroundColor();
  monaco.editor.setTheme('github-light');
  return {
    astroTypes: tokenTypes(samples.astro, 'astro'),
    markdownTypes: tokenTypes(samples.markdown, 'markdown'),
    light,
    dark: darkBackground,
    typescript: await completionCount('typescript', samples.typescript, 2, 7),
    css: await completionCount('css', '.card { color: }', 1, 16),
    json: await completionCount('json', '{\n  "', 2, 4),
    csp: [...csp],
  };
}

window.__xiaoMonacoCheck = check;
status.textContent = 'Monaco 已就绪';

declare global {
  interface Window {
    __xiaoMonacoCheck?: () => Promise<CheckResult>;
  }
}
