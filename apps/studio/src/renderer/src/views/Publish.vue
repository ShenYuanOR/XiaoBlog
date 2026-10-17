<script setup lang="ts">
import { computed, ref } from 'vue';
import repoGuide from '../../../../resources/guides/01-repo.svg';
import tokenGuide from '../../../../resources/guides/02-token.svg';
import pagesGuide from '../../../../resources/guides/03-pages.svg';
import { guides, pagesSettingsUrl, parseRepo, tokenUrl } from '../../../../src/main/wizard.ts';
import { useSession } from '../stores/session.ts';

const images = [repoGuide, tokenGuide, pagesGuide];
const session = useSession();
const link = ref('');
const token = ref('');
const message = ref('这一步只做引导和本地配置，不会推送。');
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

async function writeConfig(): Promise<void> {
  const repo = parsed.value;
  if (!session.siteDir || !repo) {
    message.value = '先打开站点，并粘贴仓库链接';
    return;
  }
  const result = await window.xiao.wizard.write(session.siteDir, repo.owner, repo.repo, 'master');
  message.value = result.ok ? '已写好本地配置和工作流，还没有推送' : result.message;
}
</script>

<template>
  <section>
    <h1>部署向导</h1>
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
  </section>
</template>
