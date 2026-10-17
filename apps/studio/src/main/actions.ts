import type { GitOps } from './git.ts';

export interface ActionJob {
  name: string;
  status: string;
  conclusion: string;
}

export function readActions(body: string, sha: string): { found: boolean; jobs: ActionJob[] } {
  const parsed = JSON.parse(body) as {
    workflow_runs?: { head_sha?: string }[];
    jobs?: { name?: string; status?: string; conclusion?: string | null }[];
  };
  if (parsed.workflow_runs && !parsed.workflow_runs.some((run) => run.head_sha === sha)) {
    return { found: false, jobs: [] };
  }
  return {
    found: true,
    jobs: (parsed.jobs ?? []).map((job) => ({
      name: job.name ?? '',
      status: job.status ?? '',
      conclusion: job.conclusion ?? '',
    })),
  };
}

export function summarizeLog(text: string): string {
  return text.split(/\r?\n/).slice(-50).join('\n');
}

export async function republish(
  git: GitOps,
  branch: string,
  message: string,
  author: { name: string; email: string },
): Promise<void> {
  await git.commit(message, author);
  await git.push(branch, false);
}
