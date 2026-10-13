<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';

// Legacy project-groups.tsx: create + list panel.
type Group = { id: string; name: string };
const groups = ref<Group[] | null>(null);
const newName = ref('');
const creating = ref(false);
const error = ref('');
const message = ref('');

async function load() {
  error.value = '';
  try {
    groups.value = (await api<{ items: Group[] }>('/project-groups')).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

async function create() {
  creating.value = true;
  error.value = '';
  try {
    await api('/project-groups', { name: newName.value });
    message.value = '项目组已创建。';
    newName.value = '';
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>项目组</h1>
      <p>为人才、简历与测评建立归类，便于按项目查看。</p>
    </div>
  </div>
  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <Notice v-if="message" kind="success">{{ message }}</Notice>
  <section class="panel">
    <form class="toolbar" @submit.prevent="create">
      <input v-model="newName" aria-label="新项目组名称" placeholder="新项目组名称" maxlength="80" required />
      <button class="primary" :disabled="creating || !newName">{{ creating ? '创建中…' : '创建项目组' }}</button>
    </form>
    <LoadingState v-if="!groups" text="正在读取项目组…" />
    <EmptyBox v-else-if="!groups.length">还没有项目组；创建后可在各列表中归类。</EmptyBox>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>项目组</th><th>引用</th></tr></thead>
        <tbody>
          <tr v-for="g in groups" :key="g.id"><td><strong>{{ g.name }}</strong></td><td><span class="mono">{{ g.id.slice(0, 8) }}</span></td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
