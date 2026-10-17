const warnBytes = 50 * 1024 * 1024;
const blockBytes = 100 * 1024 * 1024;

export interface HttpResult {
  status: number;
  statusText: string;
  url: string;
  body: Uint8Array;
}

export type HttpFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: Uint8Array },
) => Promise<HttpResult>;

export function createHttpClient(fetchImpl: HttpFetch): {
  request: (request: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: AsyncIterable<Uint8Array>;
  }) => Promise<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body: AsyncIterableIterator<Uint8Array>;
    statusCode: number;
    statusMessage: string;
  }>;
} {
  return {
    async request(request) {
      const chunks: Uint8Array[] = [];
      if (request.body) {
        for await (const chunk of request.body) chunks.push(chunk);
      }
      const body = chunks.length === 0 ? undefined : concat(chunks);
      const response = await fetchImpl(request.url, {
        method: request.method ?? 'GET',
        headers: request.headers ?? {},
        ...(body ? { body } : {}),
      });
      return {
        url: response.url,
        method: request.method ?? 'GET',
        headers: {},
        statusCode: response.status,
        statusMessage: response.statusText,
        body: oneChunk(response.body),
      };
    },
  };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

async function* oneChunk(body: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield body;
}

export function gitAuth(token: string): {
  onAuth: () => { username: string; password: string };
  onAuthFailure: () => { cancel: true };
} {
  return {
    onAuth: () => ({ username: 'x-access-token', password: token }),
    onAuthFailure: () => ({ cancel: true }),
  };
}

export interface PushCheck {
  warnings: string[];
  errors: string[];
}

export function checkPush(input: {
  files: { path: string; bytes: number }[];
  gitignore: string;
  tracked: string[];
}): PushCheck {
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const file of input.files) {
    if (file.bytes > blockBytes) errors.push(`${file.path} 超过 100 MB`);
    else if (file.bytes > warnBytes) warnings.push(`${file.path} 超过 50 MB`);
  }
  for (const line of ['node_modules/', 'dist/', '.astro/']) {
    if (!input.gitignore.includes(line)) errors.push(`.gitignore 缺少 ${line}`);
  }
  if (!input.tracked.some((file) => file.replaceAll('\\', '/').endsWith('pnpm-lock.yaml'))) {
    errors.push('提交里没有 pnpm-lock.yaml');
  }
  return { warnings, errors };
}

export interface GitOps {
  commit: (message: string, author: { name: string; email: string }) => Promise<void>;
  push: (ref: string, force: boolean) => Promise<void>;
  fetch: (ref: string) => Promise<void>;
  pointAtRemote: (ref: string) => Promise<void>;
  takeRemoteOnly: () => Promise<void>;
}

export interface PublishInput {
  remoteEmpty: boolean;
  commonHistory: boolean;
  force: boolean;
  branch: string;
  authorName: string;
  authorEmail: string;
  login: string;
  when: Date;
  files: { path: string; bytes: number }[];
  gitignore: string;
  tracked: string[];
  git: GitOps;
}

export async function publishRepo(input: PublishInput): Promise<{
  message: string;
  force: boolean;
  warnings: string[];
  steps: string[];
}> {
  const check = checkPush(input);
  if (check.errors.length > 0) throw new Error(check.errors.join('；'));
  const message = `发布：${stamp(input.when)}`;
  const author = {
    name: input.authorName || input.login,
    email: input.authorEmail || `${input.login}@users.noreply.github.com`,
  };
  const steps: string[] = [];
  if (!input.remoteEmpty && !input.commonHistory && !input.force) {
    await input.git.fetch(input.branch);
    steps.push('fetch');
    await input.git.pointAtRemote(input.branch);
    steps.push('point');
    await input.git.takeRemoteOnly();
    steps.push('take');
  }
  await input.git.commit(message, author);
  steps.push('commit');
  await input.git.push(input.branch, input.force);
  steps.push(input.force ? 'push-force' : 'push');
  return { message, force: input.force, warnings: check.warnings, steps };
}

function stamp(when: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}
