<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, date, statusLabels, type Page, type Talent } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import PagerBar from '../components/PagerBar.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy talents list (talents.tsx).
const router = useRouter();
const page = ref(1);
const query = ref('');
const search = ref('');
const rows = ref<Page<Talent> | null>(null);
const error = ref('');
const refresh = ref(0);

async function load() {
  rows.value = null;
  error.value = '';
  try {
    rows.value = await api<Page<Talent>>(`/talents?page=${page.value}&q=${encodeURIComponent(search.value)}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
watch([page, search, refresh], load);
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>人才档案</h1>
      <p>一人一份主档，每个岗位保留独立申请与材料版本。</p>
    </div>
    <button class="primary" @click="router.push('/talents/new')">＋ 授权导入</button>
  </div>

  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <section class="panel">
    <form class="toolbar" @submit.prevent="search = query; page = 1">
      <input v-model="query" aria-label="搜索人才" placeholder="按姓名搜索" />
      <button>搜索</button>
      <button v-if="query || search" type="button" @click="page = 1; query = ''; search = ''">清空条件</button>
    </form>
    <RetryBox v-if="error" :text="error" @retry="refresh++" />
    <LoadingState v-else-if="!rows" text="正在读取人才档案…" />
    <EmptyBox v-else-if="!rows.items.length">导入第一份已授权材料后，这里建立人才主档。</EmptyBox>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>姓名</th><th>处理用途</th><th>保留至</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="t in rows.items" :key="t.id">
            <td><strong>{{ t.name }}</strong></td>
            <td>{{ statusLabels[t.purpose] ?? t.purpose }}</td>
            <td>{{ date(t.retention_until) }}</td>
            <td>{{ date(t.created_at) }}</td>
            <td><button class="text-button" @click="router.push(`/talents/${t.id}`)">查看档案 →</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <PagerBar v-if="rows" :page="page" :total="rows.total" @go="page = $event" />
  </section>
</template>
