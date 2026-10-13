<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, date, statusLabels, type TalentDetail } from '../logic/api';
import Notice from '../components/Notice.vue';
import BadgePill from '../components/BadgePill.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy talent detail (talents.tsx): metadata + contact access (audited) + versions/applications/assessments.
const route = useRoute();
const router = useRouter();
const detail = ref<TalentDetail | null>(null);
const error = ref('');
const contact = ref('');
const busy = ref(false);
const refresh = ref(0);

async function load() {
  error.value = '';
  detail.value = null;
  try {
    detail.value = await api<TalentDetail>(`/talents/${route.params.id}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

async function viewContact() {
  if (!detail.value || busy.value) return;
  busy.value = true;
  try {
    const result = await api<{ contact: string | null }>(`/talents/${detail.value.id}/contact-access`, {});
    contact.value = result.contact ?? '未提供';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <RetryBox v-if="error && !detail" :text="error" @retry="refresh++; load()" />
  <LoadingState v-else-if="!detail" text="正在读取授权档案…" />
  <section v-else class="panel">
    <div class="section-heading">
      <div>
        <button class="text-button" @click="router.push('/talents')">← 返回人才列表</button>
        <h2>{{ detail.name }} <BadgePill>{{ statusLabels[detail.purpose] ?? detail.purpose }}</BadgePill></h2>
      </div>
      <div class="actions">
        <button :disabled="busy" @click="viewContact">{{ contact ? '再次查看联系方式（留审计）' : '查看联系方式（留审计）' }}</button>
        <button class="primary" @click="router.push(`/interviews/new/${detail.applications[0]?.id ?? ''}`)">发起面试</button>
      </div>
    </div>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <div v-if="contact" class="metadata"><span>联系方式：<strong class="mono wrap">{{ contact }}</strong></span></div>
    <div class="metadata">
      <span>保留至：{{ date(detail.retention_until) }}</span>
      <span>建档：{{ date(detail.created_at) }}</span>
      <span>处理依据：{{ detail.processing_basis }}</span>
    </div>

    <h2>简历版本与证据</h2>
    <div v-if="!detail.resumes.length" class="empty"><h3>还没有简历版本</h3><p>导入材料后生成版本记录。</p></div>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>版本</th><th>文件</th><th>完整度</th><th>导入时间</th><th>内容摘要</th></tr></thead>
        <tbody>
          <tr v-for="r in detail.resumes" :key="r.id">
            <td>V{{ r.version }}</td>
            <td>{{ r.filename }}</td>
            <td>{{ statusLabels[r.completeness] ?? r.completeness }}</td>
            <td>{{ date(r.created_at) }}</td>
            <td><span class="mono wrap">{{ r.content_hash.slice(0, 16) }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>岗位申请 · {{ detail.applications.length }}</h2>
    <div v-if="!detail.applications.length" class="empty"><h3>还没有岗位申请</h3><p>在档案内选择岗位与简历版本建立申请。</p></div>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>岗位</th><th>岗位版本</th><th>申请批次</th><th>状态</th><th>固定简历版本引用</th><th>建立时间</th></tr></thead>
        <tbody>
          <tr v-for="a in detail.applications" :key="a.id">
            <td><strong>{{ a.title }}</strong></td>
            <td>V{{ a.job_version }}</td>
            <td>{{ a.batch }}</td>
            <td><BadgePill>{{ statusLabels[a.status] ?? a.status }}</BadgePill></td>
            <td><span class="mono">V{{ a.resume_version }}</span></td>
            <td>{{ date(a.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>测评记录 · {{ detail.assessments?.length ?? 0 }}</h2>
    <div v-if="!detail.assessments?.length" class="empty"><h3>还没有测评记录</h3><p>在测评中心发起邀请后，这里关联结果。</p></div>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>测评</th><th>创建时间</th><th>提交时间</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="a in detail.assessments" :key="a.id">
            <td><span class="mono wrap">{{ a.id.slice(0, 8) }}</span></td>
            <td>{{ date(a.created_at) }}</td>
            <td>{{ a.submitted_at ? date(a.submitted_at) : '未提交' }}</td>
            <td><span :class="['status-pill', a.submitted_at ? 'done' : a.revoked_at ? 'closed' : '']">{{ a.revoked_at ? '已撤销' : a.submitted_at ? '已完成' : '进行中' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
