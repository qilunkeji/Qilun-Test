<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, setCsrf, type Session } from './logic/api';
import { bootstrapSession, clearSession, sessionState } from './logic/session';
import Notice from './components/Notice.vue';

const route = useRoute();
const router = useRouter();

// Legacy nav (main.tsx): exact 8 items; non-business roles only see 设置.
const nav: { id: string; label: string; path: string }[] = [
  { id: 'dashboard', label: '首页', path: '/' },
  { id: 'jobs', label: '岗位管理', path: '/jobs' },
  { id: 'optimize', label: '招聘优化', path: '/optimize' },
  { id: 'assessments', label: '测评中心', path: '/assessments' },
  { id: 'interviews', label: '面试评估', path: '/interviews' },
  { id: 'talents', label: '人才档案', path: '/talents' },
  { id: 'resume-library', label: '简历库', path: '/resume-library' },
  { id: 'settings', label: '设置', path: '/settings' },
];

const isH5 = computed(() => route.path.startsWith('/h5'));
const error = ref('');
const menuOpen = ref(false);
const busy = ref(false);
const username = ref('');
const password = ref('');
const loginOptions = ref<{ unified_login: boolean; local_password_login: boolean; login_url: string | null } | null>(null);

const session = computed(() => sessionState.session);
const ready = computed(() => sessionState.ready);
const business = computed(() => !!session.value && ['hr', 'talent_lead'].includes(session.value.role));
const visibleNav = computed(() => nav.filter(n => business.value || n.id === 'settings'));

const currentView = computed(() => {
  const p = route.path;
  if (p === '/') return 'dashboard';
  const seg = '/' + (p.split('/').filter(Boolean)[0] ?? '');
  return nav.find(n => n.path === seg)?.id ?? (p === '/assistant' ? 'assistant' : p.startsWith('/applications') ? 'applications' : seg === '/settings' ? 'settings' : '');
});
const denied = computed(() => !!session.value && !business.value && currentView.value !== 'settings');

watch(() => currentView.value, v => {
  document.title = `${nav.find(n => n.id === v)?.label ?? '人才管理'} · 齐论AI人才管理`;
}, { immediate: true });

onMounted(async () => {
  await bootstrapSession();
  if (!sessionState.session) {
    api<{ unified_login: boolean; local_password_login: boolean; login_url: string | null }>('/auth/options')
      .then(o => { loginOptions.value = o; })
      .catch(() => { error.value = '登录配置暂不可用，请刷新后重试。'; });
  }
});

function go(path: string) {
  menuOpen.value = false;
  router.push(path);
}

function unifiedLogin() {
  window.location.assign('/api/iam/login');
}

async function login() {
  busy.value = true;
  error.value = '';
  try {
    await api('/auth/login', { username: username.value, password: password.value });
    const me = await api<Session>('/auth/me');
    setCsrf(me.csrf_token);
    sessionState.session = me;
    router.push(['hr', 'talent_lead'].includes(me.role) ? '/' : '/settings');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function logout() {
  try {
    await api('/auth/logout', {});
  } catch (e) {
    error.value = (e as Error).message;
    return;
  }
  clearSession();
}
</script>

<template>
  <router-view v-if="isH5" />

  <main v-else-if="!ready" class="loading">正在验证登录状态…</main>

  <!-- Legacy login-layout: dark brand story + form panel (premium.css V1.1). -->
  <div v-else-if="!session" class="login-layout">
    <section class="login-story">
      <div class="brand brand-dark"><img src="/brand/qilun-logo-dark.png" alt="齐论 AI" /></div>
      <div class="login-message">
        <span>QILUN TALENT INTELLIGENCE</span>
        <h1>汇聚真实证据，<br />让人才因 AI 而成事。</h1>
        <p>将岗位、人才、测评与面试织成一条可追溯的决策链路。<br />保留未知，让人工判断有据可循。</p>
        <div class="brand-principles"><b>汇聚</b><b>共构</b><b>融合</b><b>生长</b></div>
      </div>
      <p class="subtle">人才管理系统 · 齐论 AI 工作空间</p>
    </section>
    <main class="login-main">
      <form @submit.prevent="login">
        <span class="eyebrow">SECURE WORKSPACE</span>
        <h2>登录管理后台</h2>
        <p class="muted">内部成员入口 · 候选人无需后台账号</p>
        <Notice v-if="error" kind="error">{{ error }}</Notice>
        <p v-if="!loginOptions" class="muted">正在读取登录配置…</p>
        <template v-else-if="loginOptions.unified_login">
          <button type="button" class="primary" @click="unifiedLogin">使用齐论账号登录</button>
          <p class="login-help">账号与权限由齐论统一账号中心管理；仅已获人才系统授权的成员可进入。</p>
        </template>
        <template v-else>
          <label class="field"><span>账号</span><input v-model="username" name="username" autocomplete="username" required /></label>
          <label class="field"><span>密码</span><input v-model="password" name="password" type="password" autocomplete="current-password" required /></label>
          <button class="primary" :disabled="busy">{{ busy ? '正在登录…' : '登录工作台' }}</button>
          <p class="login-help">内部授权账号登录，不开放自助注册。</p>
        </template>
      </form>
    </main>
  </div>

  <!-- Legacy shell.top-shell: sticky top-header + workspace + footer. -->
  <div v-else class="shell top-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <header class="top-header">
      <button class="top-brand" aria-label="返回工作台" @click="go(business ? '/' : '/settings')">
        <img src="/brand/qilun-logo-light.png" alt="齐论 AI" />
        <small>TALENT MANAGEMENT</small>
      </button>
      <nav aria-label="主要导航" :class="{ open: menuOpen }">
        <button v-for="n in visibleNav" :key="n.id" :aria-current="currentView === n.id ? 'page' : undefined"
          :class="{ active: currentView === n.id }" @click="go(n.path)">{{ n.label }}</button>
      </nav>
      <button class="mobile-nav-toggle" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">{{ menuOpen ? '关闭' : '菜单' }}</button>
      <div class="account">
        <strong>{{ session.username }}</strong>
        <button @click="logout">退出</button>
      </div>
    </header>
    <div class="workspace">
      <main id="main-content" class="content" tabindex="-1">
        <Notice v-if="error" kind="error">{{ error }} <button @click="error = ''">关闭</button></Notice>
        <section v-if="denied" class="panel route-unavailable">
          <h1>页面暂不可访问</h1>
          <p>请确认账号权限或返回工作台。此提示不确认任何档案是否存在。</p>
          <button @click="go(business ? '/' : '/settings')">返回工作台</button>
        </section>
        <router-view v-else />
      </main>
      <footer>
        <span>齐论 AI · 让每一个人因 AI 而成事</span>
        <span>真实透明 · 开放共享 · 以终为始</span>
      </footer>
    </div>
  </div>
</template>
