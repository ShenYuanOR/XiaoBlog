import { describe, expect, it } from 'vitest';
import { parseAstro, setText } from './index';
import { recordEdit, redoEdit, undoEdit, type FileHistory } from './history';
import type { EditableNode } from './types';

function textNode(source: string): { id: string } {
  const doc = parseAstro(source);
  const main = doc.tree[0] as EditableNode;
  const paragraph = main.children[0];
  const node = paragraph?.children[0];
  if (!node || node.kind !== 'text') throw new Error('找不到文本');
  return node;
}

describe('撤销重做', () => {
  it('连续 20 步后文件内容一致', () => {
    let text = '---\n---\n<main>\n  <p>开始</p>\n</main>\n';
    let history: FileHistory = { past: [], future: [] };
    const versions = [text];
    for (let step = 0; step < 20; step += 1) {
      const next = setText(parseAstro(text), textNode(text).id, `第${step}步`);
      history = recordEdit(history, text);
      text = next;
      versions.push(text);
    }
    for (let step = 19; step >= 0; step -= 1) {
      const undone = undoEdit(history, text);
      history = undone.history;
      text = undone.text;
      expect(text).toBe(versions[step]);
    }
    for (let step = 1; step <= 20; step += 1) {
      const redone = redoEdit(history, text);
      history = redone.history;
      text = redone.text;
      expect(text).toBe(versions[step]);
    }
  });
});
