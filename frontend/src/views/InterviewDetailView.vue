<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, date } from '../logic/api';
import Notice from '../components/Notice.vue';
import BadgePill from '../components/BadgePill.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy interview detail (interviews.tsx): 面试档案 + 回传转写 + AI 处理记录.
type Run = { id: string; status: string; feature: string; result: unknown; error_code: string | null; created_at: string };
type InterviewDetail = {
  id: string; application_id: string; assessment_id: string | null;
  rubric: { name: string; requirement: string; weight: number }[];
  question_count: number; revision: number;
  transcript: string; runs: Run[];
  candidate_id: string; name: string; title: string; tasks: string; criteria: string; text_content: string;
};

const route = useRoute();
const router = useRouter();
const detail = ref<InterviewDetail | null>(null);
const error = ref('');
const transcriptText = ref('');
const expectedRevision = ref(0);
const saving = ref(false);
const message = ref('');
const refresh = ref(0);

async function load() {
  error.value = '';
  detail.value = null;
  try {
    detail.value = await api<InterviewDetail>(`/interviews/${route.params.id}`);
    transcriptText.value = detail.value.transcript || '';
    expectedRevision.value = detail.value.revision;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

async function saveTranscript() {
  saving.value = true;
  error.value = '';
  try {
    const result = await api<{ revision: number }>(`/interviews/${route.params.id}/transcript`, {
      text: transcriptText.value, expected_revision: expectedRevision.value, processing_confirmed: true,
    });
    expectedRevision.value = result.revision;
    message.value = `文稿已保存（版本 ${result.revision}）`;
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <RetryBox v-if="error && !detail" :text="error" @retry="refresh++; load()" />
  <LoadingState v-else-if="!detail" text="正在读取面试档案…" />
  <template v-else>
    <div class="page-heading">
      <div>
        <button class="text-button" @click="router.push('/interviews')">← 返回面试列表</button>
        <h1>{{ detail.name }} · {{ detail.title }}</h1>
        <p>题数 {{ detail.question_count }} · 文稿 V{{ detail.revision }}</p>
      </div>
    </div>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <Notice v-if="message" kind="success">{{ message }}</Notice>

    <section class="panel">
      <h2>面试档案</h2>
      <div class="metadata">
        <span>候选人：{{ detail.name }}</span><span>岗位：{{ detail.title }}</span>
        <span>关联测评：{{ detail.assessment_id ? detail.assessment_id.slice(0, 8) : '未关联' }}</span>
      </div>
      <h3>岗位核心任务</h3><p class="preserve">{{ detail.tasks }}</p>
      <h3>岗位证据标准</h3><p class="preserve">{{ detail.criteria }}</p>
      <h3>评价标准</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>能力项</th><th>要求</th><th>权重</th></tr></thead>
          <tbody>
            <tr v-for="r in detail.rubric" :key="r.name + r.requirement"><td>{{ r.name }}</td><td>{{ r.requirement }}</td><td>{{ r.weight }}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>面试后 · 回传录音转写文本</h2>
      <p class="muted">转写文本仅用于生成问题与能力评估证据；提交即确认已获候选人知情同意。</p>
      <form class="form-grid" @submit.prevent="saveTranscript">
        <label class="field wide"><span>转写文本（10–16000 字）</span><textarea v-model="transcriptText" rows="12" /></label>
        <div class="form-footer sticky-actions">
          <p>保存生成新文稿版本；expected_revision 防止并发覆盖。</p>
          <div class="actions">
            <button class="primary" :disabled="saving || transcriptText.trim().length < 10">{{ saving ? '保存中…' : '保存文稿' }}</button>
          </div>
        </div>
      </form>
    </section>

    <section class="panel">
      <h2>AI 处理记录 · {{ detail.runs.length }}</h2>
      <div v-if="!detail.runs.length" class="empty"><h3>还没有处理记录</h3><p>保存文稿后可运行问题生成与综合评估。</p></div>
      <div v-else class="table-scroll">
        <table>
          <thead><tr><th>功能</th><th>状态</th><th>错误</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="r in detail.runs" :key="r.id">
              <td>{{ r.feature }}</td>
              <td><BadgePill>{{ r.status }}</BadgePill></td>
              <td><span class="mono wrap">{{ r.error_code ?? '—' }}</span></td>
              <td>{{ date(r.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>候选人简历（固定版本）</h2>
      <div class="document">
        <div v-for="(line, i) in detail.text_content.split('\n')" :key="i">
          <span>{{ i + 1 }}</span><pre>{{ line }}</pre>
        </div>
      </div>
    </section>
  </template>
</template>
