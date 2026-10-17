export const packageLimit = 230 * 1024 * 1024;

export function withinPackageLimit(bytes: number): boolean {
  return bytes <= packageLimit;
}

export function readPackFlags(yml: string): {
  unpackNode: boolean;
  runAsNode: boolean;
  guides: boolean;
} {
  return {
    unpackNode: yml.includes('**/*.node'),
    runAsNode: yml.includes('runAsNode: true'),
    guides: yml.includes('guides'),
  };
}
