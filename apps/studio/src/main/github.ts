export interface GitResponse {
  status: number;
  body: string;
}

export type GitFetch = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<GitResponse>;

export class GitHubService {
  constructor(private readonly fetchImpl: GitFetch) {}

  repo(owner: string, name: string, token: string): Promise<GitResponse> {
    return this.fetchImpl(`https://api.github.com/repos/${owner}/${name}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'XiaoBlog',
      },
    });
  }
}
