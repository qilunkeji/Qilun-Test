<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, date, type Page } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy AssessmentCenter (assessment-center.tsx): 邀请与答题进度 / 已完成报告 tabs + 发起测评.
type InviteRow = { id: string; name: string; title: string; version: string; purpose: string; expires_at: string; submitted_at: string | null; participant_kind: string; created_at: string; project_group_id: string | null; candidate_id: string | null; revision: number | null; revoked_at: string | null };
type InviteList = Page<InviteRow> & { h5_origin: string; standard_assessment_available: boolean; standard_assessment_version: string };

const route = useRoute();
const tab = ref(route.query.tab === 'reports' ? 'reports' : 'invites');
const list = ref<InviteList | null>(null);
const reports = ref<InviteList | null>(null);
const error = ref('');
const creating = ref(false);
const purpose = ref('人才发展沟通');
const days = ref(7);
const created = ref<{ url: string; expires_at: string } | null>(null);

const rows = computed(() => (tab.value === 'reports' ? reports.value : list.value));

async function load() {
  error.value = '';
  try {
    if (tab.value === 'reports') {
      reports.value = await api<InviteList>('/assessment/invites?view=reports');
    } else {
      list.value = await api<InviteList>('/assessment/invites');
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
watch(tab, load);

async function createInvite() {
  creating.value = true;
  error.value = '';
  try {
    created.value = await api<{ id: string; url: string; expires_at: string }>('/assessment/invites', { purpose: purpose.value, days: days.value });
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creating.value = false;
  }
}

function inviteState(r: InviteRow) {
  if (r.submitted_at) return '已完成';
  if (r.revoked_at) return '已停止访问';
  if (new Date(r.expires_at) < new Date()) return '已到期';
  return r.revision ? '答题中' : '待开始';
}
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>测评中心</h1>
      <p>邀请与进度在这里管理，完成后到报告页查看个人结果。</p>
    </div>
  </div>

  <div class="tabbar" aria-label="测评栏目">
    <button :aria-pressed="tab === 'invites'" :class="{ active: tab === 'invites' }" @click="tab = 'invites'">邀请与答题进度</button>
    <button :aria-pressed="tab === 'reports'" :class="{ active: tab === 'reports' }" @click="tab = 'reports'">已完成报告</button>
  </div>

  <Notice v-if="error" kind="error">{{ error }}</Notice>

  <section v-if="tab === 'invites'" class="panel">
    <div class="section-heading">
      <div><h2>发起测评</h2><p>生成共用链接，跟进每位参与者的答题状态。</p></div>
    </div>
    <form class="form-grid" @submit.prevent="createInvite">
      <label class="field"><span>测评用途 *</span><input v-model="purpose" required /></label>
      <label class="field"><span>有效天数 *</span><input v-model.number="days" type="number" min="1" max="30" required /></label>
      <div class="form-footer">
        <p>{{ list?.standard_assessment_available ? `标准测评 ${list.standard_assessment_version} 可用` : '标准测评暂不可用' }}</p>
        <button class="primary" :disabled="creating || !list?.standard_assessment_available">{{ creating ? '创建中…' : '创建测评邀请' }}</button>
      </div>
    </form>
    <Notice v-if="created" kind="success">
      测评链接已创建（有效期至 {{ date(created.expires_at) }}）：<span class="mono wrap">{{ created.url }}</span>
    </Notice>
  </section>

  <section class="panel">
    <div class="section-heading">
      <div>
        <h2>{{ tab === 'reports' ? '已完成报告' : '参与者进度' }}</h2>
        <p>{{ tab === 'reports' ? '按人员查看已完成报告，支持保存图片与 PDF。' : '生成共用链接，跟进每位参与者的答题状态。' }}</p>
      </div>
    </div>
    <RetryBox v-if="error" :text="error" @retry="load" />
    <LoadingState v-else-if="!rows" text="正在读取测评数据…" />
    <EmptyBox v-else-if="!rows.items.length">{{ tab === 'reports' ? '还没有已完成的测评报告。' : '创建第一条测评邀请后，这里跟进参与进度。' }}</EmptyBox>
    <div v-else class="table-scroll">
      <table>
        <thead>
          <tr v-if="tab === 'reports'"><th>姓名</th><th>测评用途</th><th>完成时间</th><th>档案关联</th></tr>
          <tr v-else><th>姓名</th><th>测评用途</th><th>所属项目</th><th>答题状态</th><th>访问截止</th><th>操作</th></tr>
        </thead>
        <tbody>
          <template v-if="tab === 'reports'">
            <tr v-for="r in rows.items" :key="r.id">
              <td><strong>{{ r.name }}</strong></td>
              <td>{{ r.purpose }}</td>
              <td>{{ date(r.submitted_at) }}</td>
              <td><span :class="['assessment-binding-state', r.candidate_id ? 'linked' : '']">{{ r.candidate_id ? '已关联档案' : '待关联档案' }}</span></td>
            </tr>
          </template>
          <template v-else>
            <tr v-for="r in rows.items" :key="r.id">
              <td><strong>{{ r.name }}</strong></td>
              <td>{{ r.purpose }}</td>
              <td>{{ r.project_group_id ? r.project_group_id.slice(0, 8) : '未分组' }}</td>
              <td><span :class="['status-pill', r.submitted_at ? 'done' : (r.revoked_at || new Date(r.expires_at) < new Date()) ? 'closed' : '']">{{ inviteState(r) }}</span></td>
              <td>{{ date(r.expires_at) }}</td>
              <td><button class="text-button" @click="tab = 'reports'">查看报告 →</button></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
