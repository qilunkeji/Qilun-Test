<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, date, statusLabels, type Page } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import PagerBar from '../components/PagerBar.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy ResumeLibrary (resume-library.tsx): 简历库 / 岗位筛选 / 授权导入 / 插件授权 tabs.
type ResumeRow = { id: string; candidate_id: string; version: number; filename: string; completeness: string; created_at: string; name: string; channel: string };

const route = useRoute();
const router = useRouter();
const tabs = [
  { id: 'library', label: '简历库' },
  { id: 'screen', label: '岗位筛选' },
  { id: 'import', label: '授权导入' },
  { id: 'extension', label: '插件授权' },
];
const tab = ref(route.query.tab === 'screen' || route.query.tab === 'extension' ? String(route.query.tab) : 'library');
const page = ref(1);
const query = ref('');
const search = ref('');
const rows = ref<Page<ResumeRow> | null>(null);
const error = ref('');
const refresh = ref(0);

async function load() {
  rows.value = null;
  error.value = '';
  try {
    rows.value = await api<Page<ResumeRow>>(`/resume-library?page=${page.value}&q=${encodeURIComponent(search.value)}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
watch([page, search, refresh], load);

function switchTab(id: string) {
  tab.value = id;
  error.value = '';
}
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>简历库与岗位审阅</h1>
      <p>材料长期积累，每次岗位分析独立留档，由你确认。</p>
    </div>
  </div>
  <div class="tabbar" aria-label="简历库栏目">
    <button v-for="t in tabs" :key="t.id" :aria-pressed="tab === t.id" :class="{ active: tab === t.id }" @click="switchTab(t.id)">{{ t.label }}</button>
  </div>
  <Notice v-if="error" kind="error">{{ error }}</Notice>

  <template v-if="tab === 'library'">
    <section class="panel">
      <form class="toolbar" @submit.prevent="search = query; page = 1">
        <input v-model="query" aria-label="搜索简历库" placeholder="按人员姓名搜索" />
        <button>搜索</button>
        <button v-if="query || search" type="button" @click="page = 1; query = ''; search = ''">清空条件</button>
      </form>
      <RetryBox v-if="error" :text="error" @retry="refresh++" />
      <LoadingState v-else-if="!rows" text="正在读取简历库…" />
      <EmptyBox v-else-if="!rows.items.length">授权导入第一份简历后，这里形成可审阅的材料库。</EmptyBox>
      <div v-else class="table-scroll">
        <table>
          <thead><tr><th>人员 / 版本</th><th>来源</th><th>完整度</th><th>导入时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="r in rows.items" :key="r.id">
              <td><strong>{{ r.name }}</strong><small>V{{ r.version }} · {{ r.filename }}</small></td>
              <td>{{ r.channel }}</td>
              <td>{{ statusLabels[r.completeness] ?? r.completeness }}</td>
              <td>{{ date(r.created_at) }}</td>
              <td><button class="text-button" @click="router.push(`/talents/${r.candidate_id}`)">查看档案 →</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <PagerBar v-if="rows" :page="page" :total="rows.total" @go="page = $event" />
    </section>
  </template>

  <template v-else-if="tab === 'screen'">
    <section class="panel">
      <div class="section-heading">
        <div><h2>岗位筛选</h2><p>每轮分析独立留档，智能体建议不替代人工判断。</p></div>
        <button class="primary" @click="router.push('/resume-screens')">进入岗位筛选</button>
      </div>
    </section>
  </template>

  <template v-else-if="tab === 'import'">
    <section class="panel">
      <div class="section-heading">
        <div><h2>授权导入</h2><p>仅导入已获准处理的材料，导入后在人才档案中形成版本。</p></div>
        <button class="primary" @click="router.push('/talents/new')">去授权导入</button>
      </div>
    </section>
  </template>

  <template v-else>
    <section class="panel">
      <div class="section-heading">
        <div><h2>插件授权</h2><p>为浏览器扩展签发一次性授权令牌，用于在招聘网站保存简历。</p></div>
        <button class="primary" @click="router.push('/extension-grants')">管理插件授权</button>
      </div>
    </section>
  </template>
</template>
