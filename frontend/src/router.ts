import { createRouter, createWebHistory } from 'vue-router';
import { api, setCsrf } from './logic/api';

// Route table mirrors the legacy 10 views; H5 public flow lives under /h5.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: () => import('./views/HomeView.vue') },
    { path: '/jobs', name: 'jobs', component: () => import('./views/JobsView.vue') },
    { path: '/jobs/:id', name: 'job-detail', component: () => import('./views/JobDetailView.vue') },
    { path: '/talents', name: 'talents', component: () => import('./views/TalentsView.vue') },
    { path: '/assessments', name: 'assessments', component: () => import('./views/AssessmentCenterView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/h5', name: 'h5-entry', component: () => import('./views/H5EntryView.vue') },
    { path: '/h5/quiz', name: 'h5-quiz', component: () => import('./views/H5QuizView.vue') },
    { path: '/h5/report', name: 'h5-report', component: () => import('./views/H5ReportView.vue') },
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
  ],
});

// session bootstrap: fetch /auth/me, redirect unauthenticated business routes to login
router.beforeEach(async (to) => {
  if (to.path.startsWith('/h5')) return true;
  try {
    const me = await api<{ username: string; role: string; csrf_token: string }>('/auth/me');
    setCsrf(me.csrf_token);
    return true;
  } catch {
    if (to.name === 'login') return true;
    return { name: 'login' };
  }
});
