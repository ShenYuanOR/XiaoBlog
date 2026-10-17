import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router.ts';
import { useSession } from './stores/session.ts';
import './shell.css';

window.__csp = [];
window.addEventListener('securitypolicyviolation', (event) => {
  const line = `CSP ${event.violatedDirective} ${event.blockedURI}`;
  window.__csp?.push(line);
  console.error(line);
});

const pinia = createPinia();
createApp(App).use(pinia).use(router).mount('#app');
const session = useSession(pinia);
window.xiao.runtime.onLog((event) => session.pushLog(event.text));
window.xiao.runtime.onReady((event) => session.pushLog(`预览已就绪 ${event.url}\n`));
window.xiao.runtime.onExit((event) =>
  session.pushLog(event.message ? `${event.message}\n` : `进程结束 ${event.code}\n`),
);
window.xiao.project.onReload((event) => {
  session.reloaded = `${event.file} 已按磁盘刷新`;
  session.setConflict(null);
});
window.xiao.project.onConflict((event) => session.setConflict(event));
