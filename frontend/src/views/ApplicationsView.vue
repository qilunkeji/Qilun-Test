<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, date, statusLabels, type Application, type Page } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import BadgePill from '../components/BadgePill.vue';
import PagerBar from '../components/PagerBar.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy Applications (main.tsx): search toolbar + table + pager.
const page = ref(1);
const q = ref('');
const search = ref('');
const rows = ref<Page<Application> | null>(null);
const error = ref('');
const refresh = ref(0);

function setPage(next: number) { page.value = next; }
function doSearch() { search.value = q.value; page.value = 1; }function clearFilters() { page.value = 1; q.value = ''; search.value = ''; }

onMounted(load);
async function load() {
  rows.value = null;
  error.value = '';
  try {
    rows.value = await api<Page<Application>>(`/applications?page=${page.value}&q=${encodeURIComponent(search.value)}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
defineExpose({ load });
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>招聘申请</h1>
      <p>每条申请独立关联人员、岗位和材料版本；在人才详情中建立申请。</p>
    </div>
  </div>
  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <section class="panel">
    <form class="toolbar" @submit.prevent="doSearch">
      <input v-model="q" aria-label="搜索岗位或人员" placeholder="搜索岗位或人员" />
      <button>搜索</button>
      <button v-if="q || search" type="button" @click="clearFilters">清空条件</button>
    </form>
    <RetryBox v-if="error" @retry="load" />
    <LoadingState v-else-if="!rows" text="正在读取申请…" />
    <div v-else-if="!rows.items.length" class="empty">
      <template v-if="search">
        <h3>没有符合条件的申请</h3><p>清空条件可返回完整列表。</p>
      </template>
      <EmptyBox v-else>先建立人才档案，再选择招聘岗位与简历版本。</EmptyBox>
    </div>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>候选人</th><th>岗位 / 版本</th><th>简历版本</th><th>申请批次</th><th>状态</th><th>建立时间</th></tr></thead>
        <tbody>
          <tr v-for="a in rows.items" :key="a.id">
            <td><strong>{{ a.name }}</strong></td>
            <td>{{ a.title }}<small>岗位 V{{ a.job_version }}</small></td>
            <td>V{{ a.resume_version }}</td>
            <td>{{ a.batch }}</td>
            <td><BadgePill>{{ statusLabels[a.status] ?? a.status }}</BadgePill></td>
            <td>{{ date(a.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <PagerBar v-if="rows" :page="page" :total="rows.total" @go="page = $event; load()" />
  </section>
</template>
