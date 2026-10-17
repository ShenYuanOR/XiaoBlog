import { createRouter, createWebHashHistory } from 'vue-router';
import Shell from './views/Shell.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/', component: Shell }],
});
