<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, date } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy AICenter (ai-center.tsx): material analysis + results with citations + run history.
type Finding = { kind: string; text: string; citations: { id: string; quote: string }[] };
type Run = { id: string; feature: string; status: string; result: { findings: Finding[]; unknowns: string[] } | null; error_code: string | null; reserved_cost: number; cost: number | null; created_at: string };
const names: Record<string, string> = { job_optimize: '招聘优化', resume_review: '简历材料分析', interview_outline: '面试提纲', transcript_analysis: '面试文稿分析', comprehensive_review: '综合证据评估', report_interpretation: '员工发展沟通' };
const statusNames: Record<string, string> = { completed: '已完成', awaiting_agent: '已提交 · 处理中', running: '处理中', failed: '失败', cancelled: '已取消', interrupted: '进程中断' };

const meta = ref<{ mode: string; processing_label: string; consent_text: string; reply_hint: string } | null>(null);
const metaError = ref('');
const feature = ref('job_optimize');
const material = ref('');
const authorized = ref(false);
const busy = ref(false);
const error = ref('');
const runs = ref<Run[]>([]);
const result = ref<{ findings: Finding[]; unknowns: string[] } | null>(null);

async function loadRuns() {
  runs.value = (await api<{ items: Run[] }>('/ai/runs')).items;
}
async function read() {
  try {
    meta.value = await api<{ mode: string; processing_label: string; consent_text: string; reply_hint: string }>('/ai/meta');
  } catch (e) {
    metaError.value = (e as Error).message;
  }
  try {
    await loadRuns();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(read);

const external = ref(false);

async function run() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  result.value = null;
  try {
    const r = await api<{ id: string; status: string; result: { findings: Finding[]; unknowns: string[] } | null }>('/ai/run', { feature: feature.value, material: material.value, authorized_to_send: authorized.value });
    if (r.status !== 'awaiting_agent') result.value = r.result;
    await loadRuns();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>AI 助手</h1>
      <p>围绕工作材料生成建议，保留引用与待核验事项</p>
    </div>
    <button @click="$router.push('/settings/models')">{{ external ? 'AI 助手状态' : '模型接入与配置' }}</button>
  </div>

  <RetryBox v-if="metaError" :text="metaError" @retry="read" />
  <LoadingState v-else-if="!meta" text="正在读取 AI 配置…" />
  <template v-else>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <section class="panel">
      <form @submit.prevent="run">
        <fieldset class="recruit-fields" :disabled="busy">
          <div class="form-grid">
            <label class="field"><span>选择任务</span>
              <select v-model="feature" @change="result = null">
                <option v-for="(name, id) in names" :key="id" :value="id">{{ name }}</option>
              </select>
            </label>
            <label class="field wide"><span>工作材料</span><textarea v-model="material" rows="9" required minlength="10" maxlength="12000" placeholder="粘贴已获授权的工作材料；先删除不必要的联系方式及敏感内容。" @input="result = null" /></label>
            <label class="check-label wide">
              <input v-model="authorized" type="checkbox" />
              {{ external ? `我确认可以将这份材料${meta.consent_text}。` : '我确认可以将这份材料发送给已配置的模型供应商进行本次分析。' }}
            </label>
            <div class="form-footer">
              <p>建议需人工复核，不自动作出录用决定。</p>
              <button class="primary" :disabled="!authorized || busy">{{ busy ? (external ? '正在提交…' : '正在分析，最长约45秒…') : '开始分析' }}</button>
            </div>
          </div>
        </fieldset>
      </form>
    </section>

    <section v-if="result" class="panel">
      <h2>分析结果</h2>
      <div v-for="(f, i) in result.findings" :key="i" class="rule-item">
        <p>{{ f.kind === 'suggestion' ? '建议' : '材料观察' }}：{{ f.text }}</p>
        <blockquote v-for="(c, j) in f.citations" :key="j">[{{ c.id }}] {{ c.quote }}</blockquote>
      </div>
      <h3>待核验事项</h3>
      <ul><li v-for="(u, i) in result.unknowns" :key="i">{{ u }}</li></ul>
      <p class="muted">已核对引用原文存在；推论是否合理仍需人工确认。</p>
    </section>

    <section class="panel">
      <h2>{{ external ? '处理记录' : '调用与费用记录' }}</h2>
      <div v-if="!runs.length" class="empty"><EmptyBox>{{ external ? '尚无处理记录。' : '尚无调用记录。请先在设置中接入模型。' }}</EmptyBox></div>
      <div v-else class="table-scroll">
        <table>
          <thead><tr><th>时间</th><th>功能</th><th>状态</th><th>{{ external ? '费用' : '费用估算（美元）' }}</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="r in runs" :key="r.id">
              <td>{{ date(r.created_at) }}</td>
              <td>{{ names[r.feature] ?? r.feature }}</td>
              <td>{{ statusNames[r.status] ?? r.status }}</td>
              <td>{{ external ? '无模型费用' : Number(r.cost ?? r.reserved_cost).toFixed(6) }}</td>
              <td><button v-if="r.result" @click="result = r.result">查看结果</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted">{{ external ? '仅显示近30天最多50条；结果保留引用并需人工复核，可以先离开页面。' : '仅显示近30天最多50条；超时或中断不自动重试，避免重复计费。当前为单次任务执行，不是持久化后台队列。' }}</p>
    </section>
  </template>
</template>
