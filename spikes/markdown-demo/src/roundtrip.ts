import { Crepe } from '@milkdown/crepe';
import { fixtures } from '../../../packages/core/src/markdown/fixtures.ts';
import {
  markDirty,
  openMarkdown,
  saveMarkdown,
  type SaveResult,
} from '../../../packages/core/src/markdown/index.ts';

const docs = import.meta.glob('../../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface Row {
  name: string;
  reason: SaveResult['reason'];
  code: string;
  same: boolean;
  rawDiff: boolean;
}

async function roundtrip(name: string, source: string): Promise<Row> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:240px;opacity:0';
  document.body.append(host);
  const session = markDirty(openMarkdown(source));
  const crepe = new Crepe({ root: host, defaultValue: session.body });
  await crepe.create();
  const current = crepe.getMarkdown();
  const saved = saveMarkdown(session, current);
  await crepe.destroy();
  host.remove();
  return {
    name,
    reason: saved.reason,
    code: saved.code ?? '',
    same: saved.text === source,
    rawDiff: current !== session.body,
  };
}

async function keyLatency(): Promise<{ ms: number; changed: boolean }> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:240px';
  document.body.append(host);
  const crepe = new Crepe({ root: host, defaultValue: '测'.repeat(10000) });
  await crepe.create();
  const view = host.querySelector('.ProseMirror');
  if (!(view instanceof HTMLElement)) throw new Error('找不到编辑区');
  view.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(view);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const before = view.textContent ?? '';
  const started = performance.now();
  document.execCommand('insertText', false, '啊');
  const ms = performance.now() - started;
  const changed = (view.textContent ?? '') !== before;
  await crepe.destroy();
  host.remove();
  return { ms, changed };
}

const rows: Row[] = [];
for (const [name, source] of Object.entries(docs)) rows.push(await roundtrip(name, source));
for (const [name, source] of Object.entries(fixtures))
  rows.push(await roundtrip(`fixture:${name}`, source));
const latency = await keyLatency();
const failed = rows.filter((row) => !row.same);
const summary = {
  total: rows.length,
  same: rows.length - failed.length,
  rawDiff: rows.filter((row) => row.rawDiff).length,
  failed: failed.map((row) => ({ name: row.name, reason: row.reason, code: row.code })),
  latency,
};
window.__xiaoCrepeSummary = summary;
const log = document.querySelector('#log');
if (log) log.textContent = JSON.stringify(summary, null, 2);

declare global {
  interface Window {
    __xiaoCrepeSummary?: typeof summary;
  }
}
