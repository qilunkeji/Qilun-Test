<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, date } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Browser-extension grants: one-time tokens (resume-extension.ts API).
type Grant = { id: string; extension_id: string; expires_at: string; revoked_at: string | null; created_at: string };
const grants = ref<Grant[] | null>(null);
const newToken = ref('');
const showToken = ref(false);
const extensionId = ref('');
const creating = ref(false);
const error = ref('');
const refresh = ref(0);

async function load() {
  error.value = '';
  try {
    grants.value = (await api<{ items: Grant[] }>('/resume-extension/grants')).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

async function createGrant() {
  creating.value = true;
  error.value = '';
  try {
    const result = await api<{ token: string; expires_in_seconds: number }>('/resume-extension/grants', { extension_id: extensionId.value });
    newToken.value = result.token;
    showToken.value = true;
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creating.value = false;
  }
}

async function revoke(id: string) {
  try {
    await api(`/resume-extension/grants/${id}/revoke`, {});
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(newToken.value);
  } catch {
    error.value = '复制未获浏览器许可，请手动选择令牌复制。';
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>浏览器扩展授权</h1>
      <p>令牌只显示一次，有效期 1 小时；请立即复制到扩展中。</p>
    </div>
  </div>
  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <section class="panel">
    <form class="toolbar" @submit.prevent="createGrant">
      <input v-model="extensionId" aria-label="扩展ID" placeholder="32位扩展标识 (a-p)" maxlength="32" />
      <button class="primary" :disabled="creating || extensionId.length !== 32">{{ creating ? '生成中…' : '生成授权' }}</button>
    </form>
    <RetryBox v-if="error" :text="error" @retry="refresh++; load()" />
    <LoadingState v-else-if="!grants" text="正在读取授权记录…" />
    <EmptyBox v-else-if="!grants.length">还没有签发过扩展授权。</EmptyBox>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>扩展ID</th><th>创建时间</th><th>过期时间</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="g in grants" :key="g.id">
            <td><span class="mono">{{ g.extension_id }}</span></td>
            <td>{{ date(g.created_at) }}</td>
            <td>{{ date(g.expires_at) }}</td>
            <td><span :class="['status-pill', g.revoked_at ? 'closed' : 'done']">{{ g.revoked_at ? '已撤销' : '有效' }}</span></td>
            <td><button v-if="!g.revoked_at" @click="revoke(g.id)">撤销</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section v-if="showToken" class="panel">
    <div class="section-heading">
      <div><h2>授权令牌（仅显示一次）</h2><p>令牌只显示这一次，请立即复制到扩展中。有效期 1 小时。</p></div>
      <button @click="showToken = false">关闭</button>
    </div>
    <div class="inset"><p class="mono wrap">{{ newToken }}</p></div>
    <div class="actions"><button class="primary" @click="copyToken">复制令牌</button></div>
  </section>
</template>
