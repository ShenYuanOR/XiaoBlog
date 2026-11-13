import 'monaco-editor/nls/lang/zh-cn.js';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router.ts';
import { notify } from './notice.ts';
import { useSession } from './stores/session.ts';
import { bootTheme } from './theme.ts';
import '../../../node_modules/monaco-editor/min/vs/editor/editor.main.css';
import './ui/tokens.css';
import './ui/base.css';

// 先落主题再挂载，避免首帧闪白。
bootTheme();

window.__csp = [];
window.addEventListener('securitypolicyviolation', (event) => {
  const line = `CSP ${event.violatedDirective} ${event.blockedURI}`;
  window.__csp?.push(line);
  console.error(line);
});

const pinia = createPinia();
createApp(App).use(pinia).use(router).mount('#app');
const session = useSession(pinia);
let liveTaskId = '';
let liveKind = '';
window.xiao.preview.onWindow((event) => {
  session.previewWindowOpen = event.open;
  if (!event.open) session.setPreviewMode('off');
});
void window.xiao.preview.windowOpen().then((result) => {
  if (result.ok) session.previewWindowOpen = result.data;
});
window.xiao.runtime.onLog((event) => session.pushLog(event.text));
window.xiao.runtime.onReady((event) => {
  if (event.taskId !== liveTaskId) return;
  session.building = false;
  session.previewUrl = event.url;
  session.previewSiteDir = session.siteDir;
  session.pushLog(`预览已就绪 ${event.url}\n`);
});
window.xiao.runtime.onStart((event) => {
  liveTaskId = event.taskId;
  liveKind = event.kind;
  session.building = true;
  session.previewUrl = '';
  session.previewSiteDir = '';
});
window.xiao.runtime.onExit((event) => {
  if (event.taskId !== liveTaskId) return;
  session.building = false;
  session.previewUrl = '';
  session.previewSiteDir = '';
  session.pushLog(event.message ? `${event.message}\n` : `进程结束 ${event.code}\n`);
  if (event.code !== 0 && liveKind === 'dev') {
    notify(
      '站点预览停了。点顶栏「预览」再开独立窗口；页面画布也会一起停。若刚换过站点，等依赖装好后再试。',
      'error',
      'preview-exit',
    );
  }
});
let reloadCount = 0;
let reloadTimer = 0;
window.xiao.project.onReload(() => {
  session.setConflict(null);
  reloadCount += 1;
  window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => {
    const count = reloadCount;
    reloadCount = 0;
    notify(count > 1 ? `${count} 个文件已按磁盘刷新` : '文件已按磁盘刷新', 'info', 'reload');
  }, 500);
});
window.xiao.project.onConflict((event) => session.setConflict(event));
