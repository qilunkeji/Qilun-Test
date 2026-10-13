<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, type Job, type Page } from '../logic/api';
import Notice from '../components/Notice.vue';
import LoadingState from '../components/LoadingState.vue';

// Legacy Dashboard (main.tsx): hero + job grid + library links.
type DashboardData = { jobs: number; candidates: number; applications: number; expired: number; agent_pending?: { pending_count: number; stale_count: number } };

const router = useRouter();
const data = ref<DashboardData | null>(null);
const jobs = ref<Page<Job> | null>(null);
const error = ref('');

onMounted(() => {
  Promise.all([api<DashboardData>('/dashboard'), api<Page<Job>>('/jobs?page=1&page_size=12')])
    .then(([d, j]) => { data.value = d; jobs.value = j; })
    .catch(e => { error.value = (e as Error).message; });
});

const active = computed(() => jobs.value?.items.filter(j => j.status === 'open') ?? []);
const shown = computed(() => active.value.length ? active.value : (jobs.value?.items.slice(0, 6) ?? []));
</script>

<template>
  <section class="home-hero home-hero-refined">
    <div class="hero-copy">
      <div class="hero-kicker">齐论 AI · 人才管理</div>
      <h1>人才管理工作台</h1>
      <p>让招聘、测评与人才档案，有序协同。</p>
      <div class="hero-actions">
        <button class="primary" @click="router.push('/jobs/new')">新建招聘岗位</button>
        <button class="hero-secondary" @click="router.push('/assessments')">进入测评中心 <b aria-hidden="true">→</b></button>
      </div>
    </div>
  </section>

  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <Notice v-if="data?.agent_pending?.pending_count" :kind="data.agent_pending.stale_count ? 'error' : undefined">
    AI 助手处理中 {{ data.agent_pending.pending_count }} 项 <button @click="router.push('/assistant')">查看处理记录 →</button>
  </Notice>

  <section class="home-section">
    <div class="home-title">
      <div>
        <h2>{{ active.length ? '招聘中的岗位' : shown.length ? '最近岗位' : '招聘岗位' }}</h2>
        <p>{{ active.length ? '管理发布与招聘进度' : shown.length ? '选择岗位，继续编辑或发布' : '从一个新岗位开始' }}</p>
      </div>
      <button @click="router.push('/jobs')">全部岗位 →</button>
    </div>
    <div class="job-grid">
      <article v-for="j in shown" :key="j.id" class="job-card">
        <div class="job-card-top"><span>{{ j.status === 'open' ? '招聘中' : '待发布' }}</span><small>V{{ j.revision }}</small></div>
        <h3>{{ j.title }}</h3>
        <p>{{ j.department }} · {{ j.location }}</p>
        <dl><dt>负责人</dt><dd>{{ j.owner }}</dd></dl>
        <div>
          <button class="primary" @click="router.push(`/jobs/${j.id}`)">编辑岗位</button>
          <button @click="router.push('/optimize')">招聘优化</button>
        </div>
      </article>
      <LoadingState v-if="!jobs && !error" text="正在读取岗位…" />
      <button v-else-if="!shown.length" class="job-card empty-job" @click="router.push('/jobs/new')">
        <b aria-hidden="true">＋</b><span>创建第一个招聘岗位</span>
      </button>
    </div>
  </section>

  <section class="home-section home-library">
    <div class="home-title">
      <div><h2>人才与测评</h2><p>档案、申请与测评，一处查看</p></div>
    </div>
    <div class="library-links">
      <button @click="router.push('/talents')">
        <strong>{{ data?.candidates ?? '—' }}</strong><span>人才档案</span><small>查看授权资料</small>
      </button>
      <button @click="router.push('/applications')">
        <strong>{{ data?.applications ?? '—' }}</strong><span>招聘申请</span><small>跟进岗位与人员</small>
      </button>
      <button @click="router.push('/assessments')">
        <strong aria-hidden="true">↗</strong><span>测评中心</span><small>发起邀请 · 查看报告</small>
      </button>
    </div>
  </section>
</template>
