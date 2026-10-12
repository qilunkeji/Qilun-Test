import { createRouter, createWebHistory } from 'vue-router';
import { api, setCsrf } from './logic/api';

// Route table mirrors the legacy 10 views; H5 public flow lives under /h5.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: () => import('./views/HomeView.vue') },
    { path: '/jobs', name: 'jobs', component: () => import('./views/JobsView.vue') },
    { path: '/jobs/new', name: 'job-create', component: () => import('./views/JobCreateView.vue') },
    { path: '/jobs/:id', name: 'job-detail', component: () => import('./views/JobDetailView.vue') },
    { path: '/talents', name: 'talents', component: () => import('./views/TalentsView.vue') },
    { path: '/talents/new', name: 'talent-import', component: () => import('./views/TalentImportView.vue') },
    { path: '/talents/:id', name: 'talent-detail', component: () => import('./views/TalentDetailView.vue') },
    { path: '/assessments', name: 'assessments', component: () => import('./views/AssessmentCenterView.vue') },
    { path: '/interviews', name: 'interviews', component: () => import('./views/InterviewsView.vue') },
    { path: '/interviews/new', name: 'interview-create', component: () => import('./views/InterviewCreateView.vue') },
    { path: '/interviews/new/:applicationId', name: 'interview-create-for', component: () => import('./views/InterviewCreateView.vue') },
    { path: '/resume-library', name: 'resume-library', component: () => import('./views/ResumeLibraryView.vue') },
    { path: '/assistant', name: 'assistant', component: () => import('./views/AiCenterView.vue') },
    { path: '/optimize', name: 'optimize', component: () => import('./views/RecruitingView.vue') },
    { path: '/project-groups', name: 'project-groups', component: () => import('./views/ProjectGroupsView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/settings/models', name: 'model-settings', component: () => import('./views/ModelSettingsView.vue') },
    { path: '/interviews/:id', name: 'interview-detail', component: () => import('./views/InterviewDetailView.vue') },
    { path: '/resume-screens', name: 'resume-screens', component: () => import('./views/ResumeScreensView.vue') },
    { path: '/extension-grants', name: 'extension-grants', component: () => import('./views/ExtensionGrantsView.vue') },
    { path: '/public-entries', name: 'public-entries', component: () => import('./views/PublicEntryManagerView.vue') },
    { path: '/assessment/rules', name: 'assessment-rules', component: () => import('./views/AssessmentRulesView.vue') },
    { path: '/assessment/replica', name: 'assessment-replica', component: () => import('./views/AssessmentReplicaView.vue') },
    { path: '/assessment/studio', name: 'report-studio', component: () => import('./views/ReportStudioView.vue') },
    { path: '/assessment/binding', name: 'assessment-binding', component: () => import('./views/AssessmentBindView.vue') },
    { path: '/assessment/evidence', name: 'gh-evidence', component: () => import('./views/GhEvidenceView.vue') },
    { path: '/assessment/experiment', name: 'rule-experiment', component: () => import('./views/RuleExperimentView.vue') },,
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
