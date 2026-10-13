<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, statusLabels, type Job, type Page } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import BadgePill from '../components/BadgePill.vue';
import PagerBar from '../components/PagerBar.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy Jobs list (jobs.tsx): toolbar search + versioned table + pager.
const router = useRouter();
const page = ref(1);
const query = ref('');
const search = ref('');
const rows = ref<Page<Job> | null>(null);
const error = ref('');
const refresh = ref(0);

async function load() {
  rows.value = null;
  error.value = '';
  try {
    rows.value = await api<Page<Job>>(`/jobs?page=${page.value}&q=${encodeURIComponent(search.value)}`);
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
      <h1>岗位管理</h1>
      <p>确认工作任务与证据标准，让每次招聘有据可循。</p>
    </div>
    <button class="primary" @click="router.push('/jobs/new')">＋ 新建岗位</button>
  </div>

  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <section class="panel">
    <form class="toolbar" @submit.prevent="search = query; page = 1">
      <input v-model="query" aria-label="搜索岗位" placeholder="按岗位名称搜索" />
      <button>搜索</button>
      <button v-if="query || search" type="button" @click="page = 1; query = ''; search = ''">清空条件</button>
      <span class="muted">所有修改保留版本</span>
    </form>
    <RetryBox v-if="error" :text="error" @retry="refresh++" />
    <LoadingState v-else-if="!rows" text="正在读取岗位…" />
    <div v-else-if="!rows.items.length" class="empty">
      <template v-if="search"><h3>没有符合条件的岗位</h3><p>清空条件可回到完整列表。</p></template>
      <EmptyBox v-else>创建第一个岗位，填写负责人、任务和需要核验的技能。</EmptyBox>
    </div>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>岗位名称</th><th>部门 / 地点</th><th>负责人</th><th>状态</th><th>版本</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="j in rows.items" :key="j.id">
            <td><strong>{{ j.title }}</strong></td>
            <td>{{ j.department }}<small>{{ j.location }}</small></td>
            <td>{{ j.owner }}</td>
            <td><BadgePill>{{ statusLabels[j.status] ?? j.status }}</BadgePill></td>
            <td>V{{ j.revision }}</td>
            <td><button class="text-button" @click="router.push(`/jobs/${j.id}`)">查看与编辑 →</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <PagerBar v-if="rows" :page="page" :total="rows.total" @go="page = $event" />
  </section>
</template>
