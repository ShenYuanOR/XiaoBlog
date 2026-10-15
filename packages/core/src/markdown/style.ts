export interface MarkdownStyle {
  bullet: '-' | '*' | '+';
  rule: '-' | '*' | '_';
  emphasis: '*' | '_';
  strong: '*' | '_';
  fence: '`' | '~';
  listItemIndent: 'one' | 'tab' | 'mixed';
}

function winner<T extends string>(counts: Record<T, number>, fallback: T): T {
  let best = fallback;
  let score = -1;
  for (const [key, value] of Object.entries(counts) as [T, number][]) {
    if (value > score) {
      best = key;
      score = value;
    }
  }
  return best;
}

export function sniffStyle(body: string): MarkdownStyle {
  const bullets = { '-': 0, '*': 0, '+': 0 };
  const rules = { '-': 0, '*': 0, _: 0 };
  let emphasisStar = 0;
  let emphasisUnder = 0;
  let strongStar = 0;
  let strongUnder = 0;
  let fenceTick = 0;
  let fenceTilde = 0;
  let tabIndent = 0;
  for (const line of body.split(/\r?\n/)) {
    const bullet = /^(\s*)([-+*])\s+\S/.exec(line);
    if (bullet?.[2] === '-' || bullet?.[2] === '*' || bullet?.[2] === '+') bullets[bullet[2]] += 1;
    if (bullet?.[1]?.includes('\t')) tabIndent += 1;
    const rule = /^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/.exec(line);
    const marker = rule?.[2]?.[0];
    if (marker === '-' || marker === '*' || marker === '_') rules[marker] += 1;
    if (/^```/.test(line.trim())) fenceTick += 1;
    if (/^~~~/.test(line.trim())) fenceTilde += 1;
    strongStar += line.match(/\*\*[^*\n]+\*\*/g)?.length ?? 0;
    strongUnder += line.match(/__[^_\n]+__/g)?.length ?? 0;
    emphasisStar += line.match(/(?<!\*)\*[^*\n]+\*(?!\*)/g)?.length ?? 0;
    emphasisUnder += line.match(/(?<!_)_[^_\n]+_(?!_)/g)?.length ?? 0;
  }
  return {
    bullet: winner(bullets, '-'),
    rule: winner(rules, '-'),
    emphasis: emphasisUnder > emphasisStar ? '_' : '*',
    strong: strongUnder > strongStar ? '_' : '*',
    fence: fenceTilde > fenceTick ? '~' : '`',
    listItemIndent: tabIndent > 0 ? 'tab' : 'one',
  };
}
