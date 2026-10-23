import { reactive } from 'vue';

export type NoticeKind = 'info' | 'error';

export interface Notice {
  id: number;
  key?: string;
  text: string;
  kind: NoticeKind;
}

export const notices = reactive<Notice[]>([]);
let sequence = 0;
const timers = new Map<number, number>();

export function notify(text: string, kind: NoticeKind = 'info', key?: string): void {
  const content = text.trim();
  if (!content) return;
  if (key) {
    const current = notices.find((item) => item.key === key);
    if (current) {
      current.text = content;
      current.kind = kind;
      window.clearTimeout(timers.get(current.id));
      timers.set(
        current.id,
        window.setTimeout(() => dismiss(current.id), 4200),
      );
      return;
    }
  }
  const id = ++sequence;
  notices.push({ id, ...(key ? { key } : {}), text: content, kind });
  while (notices.length > 3) {
    const oldest = notices[0];
    if (oldest) dismiss(oldest.id);
  }
  timers.set(
    id,
    window.setTimeout(() => dismiss(id), 4200),
  );
}

export function dismiss(id: number): void {
  const index = notices.findIndex((item) => item.id === id);
  if (index >= 0) notices.splice(index, 1);
  const timer = timers.get(id);
  if (timer) window.clearTimeout(timer);
  timers.delete(id);
}
