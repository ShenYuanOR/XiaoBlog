import { reactive } from 'vue';

export type NoticeKind = 'info' | 'error';

export interface NoticeAction {
  label: string;
  run: () => void;
}

export interface Notice {
  id: number;
  key?: string;
  text: string;
  kind: NoticeKind;
  action?: NoticeAction;
}

export const notices = reactive<Notice[]>([]);
let sequence = 0;
const timers = new Map<number, number>();

export function notify(text: string, kind: NoticeKind = 'info', key?: string, action?: NoticeAction): void {
  const content = text.trim();
  if (!content) return;
  const life = action ? 12000 : 4200;
  if (key) {
    const current = notices.find((item) => item.key === key);
    if (current) {
      current.text = content;
      current.kind = kind;
      current.action = action;
      window.clearTimeout(timers.get(current.id));
      timers.set(
        current.id,
        window.setTimeout(() => dismiss(current.id), life),
      );
      return;
    }
  }
  const id = ++sequence;
  notices.push({ id, ...(key ? { key } : {}), text: content, kind, ...(action ? { action } : {}) });
  while (notices.length > 3) {
    const oldest = notices[0];
    if (oldest) dismiss(oldest.id);
  }
  timers.set(
    id,
    window.setTimeout(() => dismiss(id), life),
  );
}

export function dismiss(id: number): void {
  const index = notices.findIndex((item) => item.id === id);
  if (index >= 0) notices.splice(index, 1);
  const timer = timers.get(id);
  if (timer) window.clearTimeout(timer);
  timers.delete(id);
}
