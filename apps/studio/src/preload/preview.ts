import { ipcRenderer } from 'electron';

interface LocTarget {
  closest: (selector: string) => LocTarget | null;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
  getAttribute: (name: string) => string | null;
  scrollIntoView: (options: { block: 'center' }) => void;
}

function asElement(target: EventTarget | null): LocTarget | null {
  if (!target || typeof target !== 'object' || !('closest' in target)) return null;
  return target as LocTarget;
}

function locOf(target: EventTarget | null): { file: string; offset: string } | null {
  const raw = asElement(target)?.closest('[data-xiao-loc]')?.getAttribute('data-xiao-loc');
  if (!raw) return null;
  const cut = raw.lastIndexOf(':');
  if (cut <= 0) return null;
  return { file: raw.slice(0, cut), offset: raw.slice(cut + 1) };
}

const box = (): HTMLElement => {
  const existing = document.getElementById('xiao-loc-box');
  if (existing) return existing;
  const element = document.createElement('div');
  element.id = 'xiao-loc-box';
  element.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'border:2px solid #1d4ed8',
    'z-index:2147483647',
    'display:none',
    'box-sizing:border-box',
  ].join(';');
  document.documentElement.append(element);
  return element;
};

function paint(target: EventTarget | null): void {
  const element = asElement(target)?.closest('[data-xiao-loc]');
  const frame = box();
  if (!element) {
    frame.style.display = 'none';
    return;
  }
  const rect = element.getBoundingClientRect();
  frame.style.display = 'block';
  frame.style.left = `${rect.left}px`;
  frame.style.top = `${rect.top}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
}

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('mouseover', (event) => paint(event.target));
  document.addEventListener(
    'click',
    (event) => {
      const loc = locOf(event.target);
      if (!loc) return;
      event.preventDefault();
      ipcRenderer.send('preview:pick', loc);
      paint(event.target);
    },
    true,
  );
  ipcRenderer.on('preview:focus', (_event, payload: { file: string; offset: string }) => {
    const selector = `[data-xiao-loc="${payload.file}:${payload.offset}"]`;
    const element = document.querySelector(selector);
    if (!element) return;
    element.scrollIntoView({ block: 'center' });
    paint(element);
  });
});
