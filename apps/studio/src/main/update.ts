function compare(left: string, right: string): number {
  const a = left.split('.').map((part) => Number(part));
  const b = right.split('.').map((part) => Number(part));
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function planUpdate(
  current: string,
  remoteVersion: string | null,
): { ask: boolean; from: string; to: string } {
  if (!remoteVersion || compare(current, remoteVersion) >= 0) {
    return { ask: false, from: current, to: current };
  }
  return { ask: true, from: current, to: remoteVersion };
}
