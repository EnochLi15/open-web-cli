import { createRouter, createWebHistory } from 'vue-router';
import BoardView from '@/views/BoardView.vue';
import MembersView from '@/views/MembersView.vue';
import ReportsView from '@/views/ReportsView.vue';
import SettingsView from '@/views/SettingsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/board' },
    { path: '/board', name: 'board', component: BoardView },
    { path: '/members', name: 'members', component: MembersView },
    { path: '/reports', name: 'reports', component: ReportsView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
});
