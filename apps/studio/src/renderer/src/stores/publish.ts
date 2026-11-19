import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface PublishStepView {
  key: 'check' | 'push' | 'build' | 'live';
  label: string;
  state: 'wait' | 'run' | 'ok' | 'fail' | 'skip';
  startedAt: number;
  ms: number;
  detail: string;
  more: string;
  url: string;
  action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
  slug: string;
}

export interface PublishJobView {
  id: string;
  siteDir: string;
  status: 'running' | 'ok' | 'fail';
  steps: PublishStepView[];
  sha: string;
  pushRejected: boolean;
  startedAt: number;
  finishedAt: number;
  siteUrl: string;
  code: string;
  checks: {
    key: 'url' | 'workflow' | 'build' | 'seo';
    ok: boolean;
    label: string;
    detail: string;
    more: string;
    slug: string;
    action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
  }[];
}

export const usePublish = defineStore('publish', () => {
  const jobs = ref<Record<string, PublishJobView | null>>({});
  const now = ref(Date.now());
  let bound = false;
  let clock = 0;

  function jobOf(siteDir: string): PublishJobView | null {
    if (!siteDir) return null;
    return jobs.value[siteDir] ?? null;
  }

  function bind(): void {
    if (bound) return;
    bound = true;
    clock = window.setInterval(() => {
      now.value = Date.now();
    }, 1000);
    window.xiao.publish.onJob((payload) => {
      jobs.value = { ...jobs.value, [payload.siteDir]: payload.job };
    });
  }

  async function hydrate(siteDir: string): Promise<void> {
    if (!siteDir) return;
    const result = await window.xiao.publish.job(siteDir);
    if (!result.ok) return;
    jobs.value = { ...jobs.value, [siteDir]: result.data };
  }

  function stop(): void {
    if (clock) window.clearInterval(clock);
    clock = 0;
  }

  return { jobs, now, jobOf, bind, hydrate, stop };
});
