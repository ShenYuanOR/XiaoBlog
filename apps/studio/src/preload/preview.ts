import { contextBridge, ipcRenderer } from 'electron';

interface LocTarget {
  closest: (selector: string) => LocTarget | null;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
  getAttribute: (name: string) => string | null;
  scrollIntoView: (options: { block: 'center' }) => void;
  tagName?: string;
}

export type StageHit = {
  file: string;
  offset: string;
  place: 'before' | 'after' | 'into';
  tag: string;
};

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

function locSelector(file: string, offset: string): string {
  const value = `${file}:${offset}`;
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value;
  return `[data-xiao-loc="${escaped}"]`;
}

function makeBox(id: string, border: string, events = false): HTMLElement {
  const existing = document.getElementById(id);
  if (existing) return existing;
  const element = document.createElement('div');
  element.id = id;
  element.style.cssText = [
    'position:fixed',
    events ? 'pointer-events:none' : 'pointer-events:none',
    `border:${border}`,
    'z-index:2147483647',
    'display:none',
    'box-sizing:border-box',
    'border-radius:2px',
  ].join(';');
  document.documentElement.append(element);
  return element;
}

function hoverBox(): HTMLElement {
  return makeBox('xiao-loc-hover', '1px solid rgba(59,130,246,.85)');
}

function selectedBox(): HTMLElement {
  const frame = makeBox('xiao-loc-selected', '2px solid #3b82f6');
  if (!document.getElementById('xiao-loc-label')) {
    const label = document.createElement('div');
    label.id = 'xiao-loc-label';
    label.style.cssText = [
      'position:absolute',
      'left:-2px',
      'top:-18px',
      'height:16px',
      'padding:0 6px',
      'border-radius:2px 2px 0 0',
      'background:#3b82f6',
      'color:#fff',
      'font:11px/16px system-ui,sans-serif',
      'white-space:nowrap',
      'max-width:240px',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'pointer-events:none',
    ].join(';');
    frame.append(label);
  }
  if (!document.getElementById('xiao-loc-handle-e')) {
    const handle = document.createElement('div');
    handle.id = 'xiao-loc-handle-e';
    handle.dataset.edge = 'width';
    handle.style.cssText = [
      'position:absolute',
      'top:50%',
      'right:-5px',
      'width:10px',
      'height:10px',
      'margin-top:-5px',
      'border:2px solid #3b82f6',
      'border-radius:1px',
      'background:#fff',
      'pointer-events:auto',
      'cursor:ew-resize',
      'display:none',
    ].join(';');
    frame.append(handle);
  }
  if (!document.getElementById('xiao-loc-handle-pad')) {
    const handle = document.createElement('div');
    handle.id = 'xiao-loc-handle-pad';
    handle.dataset.edge = 'pad';
    handle.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:4px',
      'width:10px',
      'height:10px',
      'margin-left:-5px',
      'border:2px solid #3b82f6',
      'border-radius:1px',
      'background:#fff',
      'pointer-events:auto',
      'cursor:ns-resize',
      'display:none',
    ].join(';');
    frame.append(handle);
  }
  return frame;
}

let catalog: { name: string; label: string }[] = [];
let typingEl: HTMLElement | null = null;

function onTypeKey(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) event.preventDefault();
}

function onTypeBlur(event: FocusEvent): void {
  const el = event.currentTarget;
  if (!(el instanceof HTMLElement) || !selectedLoc) return;
  ipcRenderer.send('preview:text', {
    file: selectedLoc.file,
    offset: selectedLoc.offset,
    text: el.textContent ?? '',
  });
}

function releaseTyping(): void {
  if (!typingEl) return;
  typingEl.contentEditable = 'false';
  typingEl.removeEventListener('blur', onTypeBlur);
  typingEl.removeEventListener('keydown', onTypeKey);
  typingEl = null;
}

function isArticleFile(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  return normalized.includes('/content/posts/') && normalized.endsWith('/index.html');
}

function armTyping(target: LocTarget): void {
  if (!(target instanceof HTMLElement) || !selectedLoc || !isArticleFile(selectedLoc.file)) {
    releaseTyping();
    return;
  }
  const nested = [...target.children].some((child) => !child.id.startsWith('xiao-'));
  if (nested) {
    releaseTyping();
    return;
  }
  if (typingEl === target) return;
  releaseTyping();
  target.contentEditable = 'plaintext-only';
  target.spellcheck = false;
  target.addEventListener('blur', onTypeBlur);
  target.addEventListener('keydown', onTypeKey);
  typingEl = target;
}

function centerGuide(): HTMLElement {
  const existing = document.getElementById('xiao-loc-center');
  if (existing) return existing;
  const element = document.createElement('div');
  element.id = 'xiao-loc-center';
  element.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'z-index:2147483645',
    'display:none',
    'width:0',
    'border-left:1px dashed #e3b341',
  ].join(';');
  document.documentElement.append(element);
  return element;
}

function inserterMenu(): HTMLElement {
  const existing = document.getElementById('xiao-insert-menu');
  if (existing) return existing;
  const menu = document.createElement('div');
  menu.id = 'xiao-insert-menu';
  menu.style.cssText = [
    'position:absolute',
    'left:50%',
    'top:calc(100% + 8px)',
    'transform:translateX(-50%)',
    'width:180px',
    'max-height:220px',
    'overflow:auto',
    'padding:4px',
    'border-radius:8px',
    'background:#1a212d',
    'color:#e8ecf4',
    'box-shadow:0 8px 24px rgb(0 0 0 / 35%)',
    'font:12px/1.4 system-ui,sans-serif',
    'pointer-events:auto',
    'display:none',
    'z-index:2',
  ].join(';');
  document.documentElement.append(menu);
  return menu;
}

function closeInserter(): void {
  const menu = document.getElementById('xiao-insert-menu');
  if (menu) menu.style.display = 'none';
}

function openInserter(anchor: HTMLElement): void {
  const menu = inserterMenu();
  menu.replaceChildren();
  if (catalog.length === 0) return;
  for (const item of catalog) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.style.cssText = [
      'display:block',
      'width:100%',
      'height:28px',
      'border:0',
      'border-radius:6px',
      'background:transparent',
      'color:inherit',
      'text-align:left',
      'padding:0 8px',
      'cursor:pointer',
    ].join(';');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedLoc) return;
      ipcRenderer.send('preview:insertBlock', {
        file: selectedLoc.file,
        offset: selectedLoc.offset,
        name: item.name,
        place: 'after',
      });
      closeInserter();
    });
    menu.append(button);
  }
  if (menu.parentElement !== anchor) anchor.append(menu);
  menu.style.display = 'block';
}

function ensureInserter(frame: HTMLElement): void {
  let button = document.getElementById('xiao-insert-btn');
  if (!button) {
    button = document.createElement('button');
    button.id = 'xiao-insert-btn';
    button.type = 'button';
    button.textContent = '+';
    button.setAttribute('aria-label', '在这块后面插入');
    button.style.cssText = [
      'position:absolute',
      'left:50%',
      'bottom:-14px',
      'width:22px',
      'height:22px',
      'margin-left:-11px',
      'border:0',
      'border-radius:11px',
      'background:#3b82f6',
      'color:#fff',
      'font:16px/22px system-ui,sans-serif',
      'cursor:pointer',
      'pointer-events:auto',
      'z-index:3',
    ].join(';');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = document.getElementById('xiao-insert-menu');
      if (menu && menu.style.display === 'block') closeInserter();
      else openInserter(frame);
    });
    frame.append(button);
  } else if (button.parentElement !== frame) {
    frame.append(button);
  }
  button.style.display = catalog.length > 0 ? 'block' : 'none';
}

function dropLine(): HTMLElement {
  const existing = document.getElementById('xiao-loc-drop');
  if (existing) return existing;
  const element = document.createElement('div');
  element.id = 'xiao-loc-drop';
  element.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'z-index:2147483646',
    'display:none',
    'height:2px',
    'background:#3b82f6',
    'box-shadow:0 0 0 1px rgba(59,130,246,.35)',
  ].join(';');
  document.documentElement.append(element);
  return element;
}

function place(frame: HTMLElement, target: LocTarget): void {
  const rect = target.getBoundingClientRect();
  frame.style.display = 'block';
  frame.style.left = `${rect.left}px`;
  frame.style.top = `${rect.top}px`;
  frame.style.width = `${Math.max(0, rect.width)}px`;
  frame.style.height = `${Math.max(0, rect.height)}px`;
}

function hide(frame: HTMLElement): void {
  frame.style.display = 'none';
}

let hoverTarget: LocTarget | null = null;
let selectedTarget: LocTarget | null = null;
let selectedLoc: { file: string; offset: string } | null = null;
let selectedLabel = '';
let handles = { width: false, pad: false };
let zoom = 1;
let spaceDown = false;
let panning = false;
let panLast = { x: 0, y: 0 };
let resizing: { prop: 'width' | 'pad'; start: number; startPx: number } | null = null;
let ignoreClick = false;

function paintHover(): void {
  const frame = hoverBox();
  if (!hoverTarget || hoverTarget === selectedTarget) {
    hide(frame);
    return;
  }
  place(frame, hoverTarget);
}

function paintSelected(): void {
  const frame = selectedBox();
  const label = document.getElementById('xiao-loc-label');
  const east = document.getElementById('xiao-loc-handle-e');
  const pad = document.getElementById('xiao-loc-handle-pad');
  if (!selectedTarget) {
    hide(frame);
    return;
  }
  place(frame, selectedTarget);
  if (label) {
    label.textContent = selectedLabel;
    label.style.display = selectedLabel ? 'block' : 'none';
  }
  if (east) east.style.display = handles.width ? 'block' : 'none';
  if (pad) pad.style.display = handles.pad ? 'block' : 'none';
  ensureInserter(frame);
  if (selectedTarget) armTyping(selectedTarget);
  else releaseTyping();
}

function refreshBoxes(): void {
  if (selectedLoc) {
    const next = document.querySelector(locSelector(selectedLoc.file, selectedLoc.offset));
    selectedTarget = next ? (next as unknown as LocTarget) : null;
  }
  paintHover();
  paintSelected();
}

function setSelected(
  loc: { file: string; offset: string } | null,
  label = '',
  scroll = false,
): void {
  selectedLoc = loc;
  selectedLabel = label;
  if (!loc) {
    selectedTarget = null;
    paintSelected();
    paintHover();
    return;
  }
  const element = document.querySelector(locSelector(loc.file, loc.offset));
  selectedTarget = element ? (element as unknown as LocTarget) : null;
  if (selectedTarget && scroll) selectedTarget.scrollIntoView({ block: 'center' });
  paintSelected();
  paintHover();
}

function asHtml(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>('[data-xiao-loc]');
}

function hitAt(x: number, y: number): StageHit | null {
  const raw = document.elementFromPoint(x, y);
  const locEl = raw instanceof Element ? raw.closest('[data-xiao-loc]') : null;
  if (!(locEl instanceof HTMLElement)) return null;
  const loc = locOf(locEl);
  if (!loc) return null;
  const rect = locEl.getBoundingClientRect();
  const relY = (y - rect.top) / Math.max(1, rect.height);
  const relX = (x - rect.left) / Math.max(1, rect.width);
  const hasChildLoc =
    [...locEl.querySelectorAll(':scope > [data-xiao-loc], :scope > * [data-xiao-loc]')].length > 0;
  let place: StageHit['place'] =
    relY < 0.28 ? 'before' : relY > 0.72 ? 'after' : hasChildLoc ? 'into' : 'after';
  if (!hasChildLoc && relY >= 0.28 && relY <= 0.72) place = relY < 0.5 ? 'before' : 'after';
  // 靠近中线时吸进容器，而不是停在缝上。
  if (hasChildLoc && Math.abs(relX - 0.5) < 0.12 && relY > 0.2 && relY < 0.8) place = 'into';
  return { ...loc, place, tag: locEl.tagName.toLowerCase() };
}

function showDrop(hit: StageHit | null): void {
  const line = dropLine();
  const guide = centerGuide();
  if (!hit) {
    hide(line);
    guide.style.display = 'none';
    return;
  }
  const el = document.querySelector(locSelector(hit.file, hit.offset));
  if (!(el instanceof HTMLElement)) {
    hide(line);
    return;
  }
  const rect = el.getBoundingClientRect();
  line.style.display = 'block';
  line.style.left = `${rect.left}px`;
  line.style.width = `${rect.width}px`;
  guide.style.display = 'block';
  guide.style.left = `${rect.left + rect.width / 2}px`;
  guide.style.top = `${rect.top}px`;
  guide.style.height = `${rect.height}px`;
  if (hit.place === 'into') {
    line.style.top = `${rect.top + rect.height / 2}px`;
    line.style.height = '0';
    line.style.border = '1px dashed #3b82f6';
    line.style.background = 'transparent';
    line.style.height = `${Math.max(8, rect.height - 8)}px`;
    line.style.top = `${rect.top + 4}px`;
    return;
  }
  line.style.border = '0';
  line.style.height = '2px';
  line.style.background = '#3b82f6';
  line.style.top = `${hit.place === 'before' ? rect.top : rect.bottom}px`;
}

function applyZoom(next: number): void {
  zoom = Math.min(2, Math.max(0.5, Math.round(next * 20) / 20));
  document.documentElement.style.zoom = String(zoom);
  // 窄画布里 1px 溢出就会挤出横向滚动条，条本身画在原生层边缘，会压住底栏。
  document.documentElement.style.overflowX = 'hidden';
  ipcRenderer.send('preview:camera', { zoom });
  refreshBoxes();
}

function bindChrome(): void {
  document.addEventListener('mouseover', (event) => {
    hoverTarget = asElement(event.target)?.closest('[data-xiao-loc]') ?? null;
    paintHover();
  });
  document.addEventListener('mouseout', (event) => {
    const next = asElement(event.relatedTarget)?.closest('[data-xiao-loc]') ?? null;
    if (next) return;
    hoverTarget = null;
    paintHover();
  });
  document.addEventListener(
    'click',
    (event) => {
      if (ignoreClick) {
        ignoreClick = false;
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        (event.target.dataset.edge || event.target.closest('#xiao-insert-btn, #xiao-insert-menu'))
      ) {
        return;
      }
      const element = asHtml(event.target);
      const loc = locOf(event.target);
      if (!element || !loc) return;
      const leaf = ![...element.children].some((child) => !child.id.startsWith('xiao-'));
      if (isArticleFile(loc.file) && leaf) {
        ipcRenderer.send('preview:pick', loc);
        setSelected(loc, '');
        requestAnimationFrame(() => typingEl?.focus());
        return;
      }
      if (element === selectedTarget && element.isContentEditable) return;
      event.preventDefault();
      event.stopPropagation();
      ipcRenderer.send('preview:pick', loc);
      setSelected(loc, '');
    },
    true,
  );
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.edge) return;
    if (!selectedTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = selectedTarget.getBoundingClientRect();
    const prop = target.dataset.edge === 'pad' ? 'pad' : 'width';
    resizing = {
      prop,
      start: prop === 'width' ? event.clientX : event.clientY,
      startPx: prop === 'width' ? rect.width : 16,
    };
    target.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', (event) => {
    if (panning) {
      window.scrollBy(panLast.x - event.clientX, panLast.y - event.clientY);
      panLast = { x: event.clientX, y: event.clientY };
      refreshBoxes();
      return;
    }
    if (!resizing) return;
    const delta =
      resizing.prop === 'width' ? event.clientX - resizing.start : resizing.start - event.clientY;
    ipcRenderer.send('preview:resize', {
      prop: resizing.prop,
      px: Math.max(0, resizing.startPx + delta),
    });
  });
  document.addEventListener('pointerup', () => {
    if (resizing) ignoreClick = true;
    resizing = null;
    panning = false;
  });
  window.addEventListener(
    'wheel',
    (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      applyZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1));
    },
    { passive: false },
  );
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      spaceDown = true;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      spaceDown = false;
      panning = false;
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!spaceDown || event.button !== 0) return;
    panning = true;
    panLast = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  });
  window.addEventListener('scroll', refreshBoxes, true);
  window.addEventListener('resize', refreshBoxes);
  ipcRenderer.on(
    'preview:focus',
    (
      _event,
      payload: {
        file: string;
        offset: string;
        label?: string;
        handles?: { width?: boolean; pad?: boolean };
      } | null,
    ) => {
      if (!payload?.file) {
        handles = { width: false, pad: false };
        setSelected(null);
        return;
      }
      handles = { width: Boolean(payload.handles?.width), pad: Boolean(payload.handles?.pad) };
      const same = selectedLoc?.file === payload.file && selectedLoc?.offset === payload.offset;
      setSelected({ file: payload.file, offset: payload.offset }, payload.label ?? '', !same);
    },
  );
  ipcRenderer.on('preview:drop', (_event, hit: StageHit | null) => {
    showDrop(hit);
  });
  ipcRenderer.on('preview:camera', (_event, payload: { zoom?: number }) => {
    if (typeof payload?.zoom === 'number') applyZoom(payload.zoom);
  });
  ipcRenderer.on('preview:catalog', (_event, items: { name: string; label: string }[]) => {
    catalog = Array.isArray(items) ? items : [];
    paintSelected();
  });
}

function keepInside(): void {
  document.documentElement.style.overflowX = 'hidden';
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    keepInside();
    bindChrome();
  });
} else {
  keepInside();
  bindChrome();
}

contextBridge.exposeInMainWorld('__xiaoStage', {
  hit: (x: number, y: number) => hitAt(x, y),
  drop: (hit: StageHit | null) => showDrop(hit),
  zoom: () => zoom,
});
