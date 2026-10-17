import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router.ts';
import './shell.css';

window.__csp = [];
window.addEventListener('securitypolicyviolation', (event) => {
  const line = `CSP ${event.violatedDirective} ${event.blockedURI}`;
  window.__csp?.push(line);
  console.error(line);
});

createApp(App).use(createPinia()).use(router).mount('#app');
