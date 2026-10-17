import { createRouter, createWebHashHistory } from 'vue-router';
import Shell from './views/Shell.vue';
import Welcome from './views/Welcome.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Welcome },
    { path: '/studio', component: Shell },
  ],
});
