<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import repoGuide from '../../../../resources/guides/01-repo.svg';
import tokenGuide from '../../../../resources/guides/02-token.svg';
import pagesGuide from '../../../../resources/guides/03-pages.svg';
import { responsiveWidths } from '../../../../src/main/responsive.ts';
import { guides, pagesSettingsUrl, parseRepo, tokenUrl } from '../../../../src/main/wizard.ts';
import { useSession } from '../stores/session.ts';

const images = [repoGuide, tokenGuide, pagesGuide];
const session = useSession();
const link = ref('');
const token = ref('');
const message = ref('这一步只做引导和本地配置，不会推送。');
const selector = ref('#wide');
const changes = ref<{ posts: string[]; pages: string[]; settings: string[] }>({
  posts: [],
  pages: [],
  settings: [],
});
const history = ref<{ at: string; repo: string }[]>([]);
const blocked = ref(false);
const parsed = computed(() => parseRepo(link.value));

async function saveToken(): Promise<void> {
  const repo = parsed.value;
  if (!repo || !token.value) {
    message.value = repo ? '先粘贴 Token' : '仓库链接格式不对';
    return;
  }
  const result = await window.xiao.secret.save(`${repo.owner}/${repo.repo}`, token.value, '');
  token.value = '';
  message.value = result.ok ? 'Token 已加密保存' : result.message;
}

async function locate(): Promise<void> {
  await window.xiao.preview.focusSelector(selector.value);
  message.value = `已让预览滚动到 ${selector.value}`;
}

function planRepublish(): void {
  message.value = '重新发布已准备。现在不会连接 Actions，也不会推送。';
}

async function loadGate(): Promise<void> {
  if (!session.siteDir) return;
  const listed = await window.xiao.publish.changes(session.siteDir);
  if (listed.ok) changes.value = listed.data;
  const seo = await window.xiao.seo.check(session.siteDir);
  blocked.value = seo.ok ? seo.data.some((row) => row.level === 'error') : true;
  const past = await window.xiao.publish.history(session.siteDir);
  if (past.ok) history.value = past.data;
}

async function writeConfig(): Promise<void> {
  const repo = parsed.value;
  if (!session.siteDir || !repo) {
    message.value = '先打开站点，并粘贴仓库链接';
    return;
  }
  const result = await window.xiao.wizard.write(session.siteDir, repo.owner, repo.repo, 'master');
  message.value = result.ok ? '已写好本地配置和工作流，还没有推送' : result.message;
  if (result.ok && parsed.value) {
    const recorded = await window.xiao.publish.record(
      session.siteDir,
      `${parsed.value.owner}/${parsed.value.repo}`,
    );
    if (recorded.ok) history.value = recorded.data;
  }
}

onMounted(() => void loadGate());
</script>

<template>
  <section>
    <h1>部署向导</h1>
    <h2>改动</h2>
    <p>文章 {{ changes.posts.length }}，页面 {{ changes.pages.length }}，设置 {{ changes.settings.length }}</p>
    <p v-if="blocked">体检有 error，不能发布。</p>
    <button type="button" :disabled="blocked" @click="message = '门禁已通过。现在不会推送。'">
      发布
    </button>
    <h2>部署历史</h2>
    <ul>
      <li v-for="item in history" :key="item.at">{{ item.at }} {{ item.repo }}</li>
    </ul>
    <p>{{ message }}</p>
    <article v-for="(guide, index) in guides" :key="guide.id">
      <h2>{{ guide.title }}</h2>
      <img :src="images[index]" :alt="guide.title" width="320" />
      <p>{{ guide.text }}</p>
      <p>
        <a :href="guide.id === 'pages' && parsed ? pagesSettingsUrl(parsed.owner, parsed.repo) : guide.href">
          打开这一步
        </a>
        <a :href="guide.doc">官方说明</a>
      </p>
    </article>
    <label>
      仓库链接
      <input v-model="link" />
    </label>
    <p v-if="link && !parsed">格式不对。用 https、ssh 或 owner/repo。</p>
    <label>
      Token
      <input v-model="token" type="password" autocomplete="off" />
    </label>
    <button type="button" @click="saveToken">加密保存 Token</button>
    <p v-if="parsed">
      <a :href="tokenUrl">生成 Token</a>
    </p>
    <button type="button" @click="writeConfig">写入本地配置</button>
    <h2>响应式</h2>
    <p>视口 {{ responsiveWidths.join('、') }}。点问题会在预览里滚动到对应元素。</p>
    <label>选择器 <input v-model="selector" /></label>
    <button type="button" @click="locate">在预览中定位</button>
    <h2>Actions</h2>
    <p>失败时显示作业日志最后 50 行。重新发布会做一次空提交再推送。</p>
    <button type="button" @click="planRepublish">重新发布</button>
  </section>
</template>
