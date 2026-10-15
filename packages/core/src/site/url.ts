/** 保证 base 以单个斜杠结尾，避免 `/demo` + `note` 粘成 `/demonote`。 */
export function withBase(base: string, path = ''): string {
  const raw = base.trim() || '/';
  const lead = raw.startsWith('/') ? raw : `/${raw}`;
  const prefix = lead.endsWith('/') ? lead : `${lead}/`;
  const rest = path.replace(/^\/+/, '');
  return rest ? `${prefix}${rest}` : prefix;
}

export function normalizeRoute(route: string): string {
  let value = route.replace(/\\/g, '/');
  if (!value.startsWith('/')) value = `/${value}`;
  value = value.replace(/\/+/g, '/');
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  if (value === '/index') return '/';
  return value;
}

export function absoluteUrl(siteUrl: string, route: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${normalizeRoute(route)}`;
}
