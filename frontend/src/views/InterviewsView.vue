<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, date } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy interviews list (interviews.tsx).
type InterviewRow = { id: string; created_at: string; revision: number; name: string; title: string };
const router = useRouter();
const rows = ref<InterviewRow[] | null>(null);
const error = ref('');
const refresh = ref(0);

async function load() {
  rows.value = null;
  error.value = '';
  try {
    rows.value = (await api<{ items: InterviewRow[] }>('/interviews')).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">INTERVIEW / EVIDENCE</span>
      <h1>面试评估</h1>
      <p>岗位与人员关联 → 面试提问 → 回传文稿 → 能力证据评估</p>
    </div>
    <div class="actions"><button class="primary" @click="router.push('/interviews/new')">建立面试评估</button></div>
  </div>

  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <section class="panel">
    <RetryBox v-if="error" :text="error" @retry="refresh++; load()" />
    <LoadingState v-else-if="!rows" text="正在读取面试记录…" />
    <EmptyBox v-else-if="!rows.length">从人才档案的岗位申请发起第一次面试评估。</EmptyBox>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>候选人</th><th>岗位</th><th>文稿版本</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td><strong>{{ r.name }}</strong></td>
            <td>{{ r.title }}</td>
            <td>V{{ r.revision }}</td>
            <td>{{ date(r.created_at) }}</td>
            <td><button class="text-button" @click="router.push(`/interviews/${r.id}`)">查看面试 →</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
