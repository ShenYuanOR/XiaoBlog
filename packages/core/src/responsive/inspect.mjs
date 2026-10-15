export async function inspectPage() {
  function selectorOf(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (!parent || parent === document.body) return tag;
    const index = [...parent.children].indexOf(element) + 1;
    return `${selectorOf(parent)} > ${tag}:nth-child(${index})`;
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isBlockBox(element) {
    const style = getComputedStyle(element);
    if (style.position === 'absolute' && element.getAttribute('aria-hidden') === 'true')
      return false;
    return (
      style.display === 'block' ||
      style.display === 'flex' ||
      style.display === 'grid' ||
      style.display === 'list-item' ||
      style.position === 'absolute'
    );
  }

  if (document.fonts?.ready) await document.fonts.ready;
  for (const image of document.images) {
    image.loading = 'eager';
    try {
      await image.decode();
    } catch {
      // 坏图不阻塞其余规则。
    }
  }
  const issues = [];
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth + 1) {
    issues.push({ level: 'error', rule: 'page-overflow', selector: 'html' });
  }
  // 移动仿真里页面一旦横向溢出，innerWidth 会变成设定宽度的 4 倍。clientWidth 仍是 CSS 视口。
  const viewport = Math.min(window.innerWidth, root.clientWidth);
  for (const element of document.body.querySelectorAll('*')) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.right > viewport + 1) {
      issues.push({ level: 'error', rule: 'element-overflow', selector: selectorOf(element) });
    }
    const overflow = getComputedStyle(element).overflowX;
    if (
      (overflow === 'hidden' || overflow === 'clip') &&
      element.scrollWidth > element.clientWidth + 1
    ) {
      if ((element.textContent ?? '').trim().length > 0) {
        issues.push({ level: 'error', rule: 'text-clip', selector: selectorOf(element) });
      }
    }
    if (
      viewport < 768 &&
      element.matches('a,button,input,summary,[role="button"]') &&
      (rect.width < 32 || rect.height < 32)
    ) {
      issues.push({ level: 'warn', rule: 'tap-target', selector: selectorOf(element) });
    }
    if (
      element instanceof HTMLImageElement &&
      (!element.hasAttribute('width') || !element.hasAttribute('height'))
    ) {
      issues.push({ level: 'warn', rule: 'img-size', selector: selectorOf(element) });
    }
  }
  for (const parent of document.querySelectorAll('body, body *')) {
    const blocks = [...parent.children].filter(
      (element) => element instanceof HTMLElement && isVisible(element) && isBlockBox(element),
    );
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        const left = blocks[i].getBoundingClientRect();
        const right = blocks[j].getBoundingClientRect();
        const width = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        if (width > 0 && height > 0 && width * height > 4) {
          issues.push({ level: 'warn', rule: 'overlap', selector: selectorOf(blocks[j]) });
        }
      }
    }
  }
  return issues;
}
