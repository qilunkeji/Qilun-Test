<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, date } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy public-entry.tsx link creator + history details.
type Entry = { id: string; title: string; purpose: string; project_group_id: string | null; expires_at: string; revoked_at: string | null; created_at: string; participants: number; completed: number };
const entries = ref<Entry[] | null>(null);
const showCreate = ref(false);
const creating = ref(false);
const error = ref('');
const message = ref('');
const form = ref({ title: '', purpose: '', project_group_id: null as string | null, days: 7 });

async function load() {
  error.value = '';
  try {
    entries.value = (await api<{ items: Entry[] }>('/assessment/public-entries')).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

async function create() {
  creating.value = true;
  error.value = '';
  try {
    const result = await api<{ url: string }>('/assessment/public-entries', form.value);
    message.value = `链接已创建：${result.url}`;
    navigator.clipboard.writeText(result.url).catch(() => {});
    showCreate.value = false;
    form.value = { title: '', purpose: '', project_group_id: null, days: 7 };
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creating.value = false;
  }
}

async function revoke(id: string) {
  if (!window.confirm('停止此链接的新登记？已有答卷仍保留，本人可在有效期内继续。')) return;
  try {
    await api(`/assessment/public-entries/${id}/revoke`, {});
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>公共测评入口</h1>
      <p>可发给一个人或多人。每人填写本人资料，独立保存答案和报告。</p>
    </div>
    <button class="primary" @click="showCreate = !showCreate">{{ showCreate ? '收起创建' : '创建测评链接' }}</button>
  </div>
  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <Notice v-if="message" kind="success"><span class="mono wrap">{{ message }}</span></Notice>

  <section v-if="showCreate" class="panel assessment-link-creator">
    <h2>创建测评链接</h2>
    <form class="form-grid" @submit.prevent="create">
      <label class="field"><span>链接名称 *</span><input v-model="form.title" required maxlength="80" /></label>
      <label class="field"><span>用途 *</span><input v-model="form.purpose" required maxlength="200" /></label>
      <label class="field"><span>登记截止（天）*</span><input v-model.number="form.days" type="number" min="1" max="30" required /></label>
      <div class="form-footer">
        <p>停止登记后，已建答卷仍可继续作答。</p>
        <button class="primary" :disabled="creating || !form.title || !form.purpose">{{ creating ? '创建中…' : '创建链接' }}</button>
      </div>
    </form>
  </section>

  <details class="panel assessment-link-history" open>
    <summary><span>已创建的链接<small>{{ error ? '读取失败，展开后可重试' : '需要查看或停止登记时展开' }}</small></span></summary>
    <div class="assessment-history-content">
      <div class="section-heading">
        <p class="muted">查看各链接的参与人数、完成情况和登记截止时间。</p>
        <button :disabled="creating || !entries" @click="load">刷新链接</button>
      </div>
      <RetryBox v-if="error" :text="error" @retry="load" />
      <LoadingState v-else-if="!entries" text="正在读取链接…" />
      <EmptyBox v-else-if="!entries.length">还没有创建测评链接。</EmptyBox>
      <div v-else class="table-scroll">
        <table>
          <thead><tr><th>链接名称</th><th>参与 / 完成</th><th>登记截止</th><th>状态 / 操作</th></tr></thead>
          <tbody>
            <tr v-for="x in entries" :key="x.id">
              <td><strong>{{ x.title }}</strong></td>
              <td>{{ x.participants }} / {{ x.completed }}</td>
              <td>{{ date(x.expires_at) }}</td>
              <td>
                <span v-if="x.revoked_at" class="status-pill closed">已停止登记</span>
                <span v-else-if="new Date(x.expires_at) < new Date()" class="status-pill closed">已到期</span>
                <button v-else :disabled="creating" @click="revoke(x.id)">停止新登记</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </details>
</template>
