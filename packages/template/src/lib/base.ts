/** `BASE_URL` 在 Astro 7 里可能没有尾斜杠，拼接前先补上。 */
export function withBase(path = ''): string {
  const raw = import.meta.env.BASE_URL || '/';
  const prefix = raw.endsWith('/') ? raw : `${raw}/`;
  const rest = path.replace(/^\/+/, '');
  return rest ? `${prefix}${rest}` : prefix;
}
