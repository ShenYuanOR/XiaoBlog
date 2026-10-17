export const responsiveWidths = [360, 768, 1024, 1280, 1440] as const;

export interface ResponsiveIssue {
  page: string;
  viewport: number;
  level: string;
  rule: string;
  selector: string;
}

export function tagIssues(
  page: string,
  viewport: number,
  issues: { level: string; rule: string; selector: string }[],
): ResponsiveIssue[] {
  return issues.map((issue) => ({ page, viewport, ...issue }));
}
