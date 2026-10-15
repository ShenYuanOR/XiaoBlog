export interface FrontmatterSplit {
  fmRaw: string;
  body: string;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function splitFrontmatter(source: string): FrontmatterSplit {
  const match = FRONTMATTER.exec(source);
  if (!match || !source.startsWith('---')) return { fmRaw: '', body: source };
  return { fmRaw: match[0], body: source.slice(match[0].length) };
}

export function patchFrontmatter(fmRaw: string, patch: Readonly<Record<string, string>>): string {
  if (!fmRaw) return fmRaw;
  let next = fmRaw;
  for (const [key, value] of Object.entries(patch)) {
    const line = new RegExp(`^(${key}:[ \\t]*).*$`, 'm');
    if (line.test(next)) {
      next = next.replace(line, `$1${value}`);
      continue;
    }
    next = next.replace(/(\r?\n)---\s*$/, `$1${key}: ${value}$1---`);
  }
  return next;
}
