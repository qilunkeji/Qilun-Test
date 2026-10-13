<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, date } from '../logic/api';
import { sessionState } from '../logic/session';
import Notice from '../components/Notice.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy AISettings → ModelSettings (ai-center.tsx): config table + editor + connection test.
type Config = { feature: string; provider: string; model: string; prompt: string; budget: number; input_price: number; output_price: number; has_key: boolean; updated_at?: string };
const names: Record<string, string> = { job_optimize: '招聘优化', resume_review: '简历材料分析', interview_outline: '面试提纲', transcript_analysis: '面试文稿分析', comprehensive_review: '综合证据评估', report_interpretation: '员工发展沟通' };

const canEdit = computed(() => sessionState.session?.role === 'talent_lead');
const configs = ref<Config[] | null>(null);
const error = ref('');
const message = ref('');
const busy = ref(false);
const feature = ref('default');
const form = ref({ provider: 'deepseek', model: '', key: '', prompt: '结合岗位任务和材料证据提出可核验的建议，保留未知项。', budget: '5', input_price: '', output_price: '' });
const check = ref<{ ok: boolean; at: string } | null>(null);

function select(id: string, list?: Config[]) {
  feature.value = id;
  form.value.key = '';
  message.value = '';
  check.value = null;
  const c = (list ?? configs.value ?? []).find(x => x.feature === id);
  form.value.provider = c?.provider ?? 'deepseek';
  form.value.model = c?.model ?? '';
  form.value.prompt = c?.prompt ?? '结合岗位任务和材料证据提出可核验的建议，保留未知项。';
  form.value.budget = String(c?.budget ?? 5);
  form.value.input_price = c ? String(c.input_price) : '';
  form.value.output_price = c ? String(c.output_price) : '';
}

async function load() {
  const r = await api<{ configs: Config[] }>('/ai/settings');
  configs.value = r.configs;
  return r.configs;
}
async function read() {
  error.value = '';
  configs.value = null;
  try {
    select('default', await load());
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(read);

async function save() {
  if (busy.value || !canEdit.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  check.value = null;
  try {
    await api('/ai/settings', {
      feature: feature.value, provider: form.value.provider, model: form.value.model,
      ...(form.value.key ? { key: form.value.key } : {}), prompt: form.value.prompt,
      budget: Number(form.value.budget), input_price: Number(form.value.input_price), output_price: Number(form.value.output_price),
    });
    form.value.key = '';
    await load();
    message.value = '配置已保存，凭据加密保存在服务端，不返回浏览器。连接状态仍为未检测。';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function inherit(id: string) {
  if (busy.value || !canEdit.value) return;
  try {
    await api('/ai/settings/inherit', { feature: id });
    select(id, await load());
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function testConnection() {
  if (!window.confirm('将向已保存配置的供应商发送合成测试材料，产生少量调用费用并写入调用记录。确认开始？')) return;
  busy.value = true;
  error.value = '';
  try {
    await api('/ai/run', {
      feature: feature.value === 'default' ? 'job_optimize' : feature.value,
      material: '连接测试专用合成材料：测试岗位的任务是整理文档目录，交付物为目录清单。请核对任务是否明确，不涉及真实人员。',
      authorized_to_send: true,
    });
    check.value = { ok: true, at: new Date().toISOString() };
    message.value = '本次调用成功且引用校验通过。用量与费用已记入调用记录。';
  } catch (e) {
    check.value = { ok: false, at: new Date().toISOString() };
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const featureRows = computed(() => Object.entries({ default: '默认模型', ...names }));
</script>

<template>
  <h2>模型与接入</h2>
  <p>配置、材料许可和连接结果分开记录。只有人才负责人可修改配置；未检测不代表连接正常。</p>
  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <Notice v-if="message">{{ message }}</Notice>
  <RetryBox v-if="error && !configs" :text="error" @retry="read" />
  <LoadingState v-else-if="!configs" text="正在读取已保存的模型配置…" />
  <div v-else class="ai-config-layout">
    <div class="table-scroll">
      <table>
        <thead><tr><th>功能</th><th>配置与连接状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="[id, name] in featureRows" :key="id">
            <td>{{ name }}</td>
            <td>
              <template v-if="configs.find(c => c.feature === id) ?? (id === 'default' ? undefined : configs.find(c => c.feature === 'default'))">
                {{ (configs.find(c => c.feature === id) ?? configs.find(c => c.feature === 'default'))!.has_key ? '已配置' : '缺少凭据' }} ·
                {{ (configs.find(c => c.feature === id) ?? configs.find(c => c.feature === 'default'))!.provider }} /
                {{ (configs.find(c => c.feature === id) ?? configs.find(c => c.feature === 'default'))!.model }}{{ !configs.find(c => c.feature === id) && id !== 'default' ? '（继承默认）' : '' }}
              </template>
              <template v-else>未配置</template>
              <small>{{ id === feature && check ? `本页检查：${check.ok ? '调用成功' : '调用失败'} · ${date(check.at)}` : '连接：未检测 · 无最近检测时间' }}</small>
              <small v-if="configs.find(c => c.feature === id) ?? (id === 'default' ? undefined : configs.find(c => c.feature === 'default'))">配置更新时间：{{ date((configs.find(c => c.feature === id) ?? configs.find(c => c.feature === 'default'))!.updated_at) }}</small>
              <small>材料外传许可：每次生成单独确认</small>
            </td>
            <td>
              <button @click="select(id)">{{ canEdit ? '配置' : '查看配置' }}</button>
              <button v-if="id !== 'default' && configs.find(c => c.feature === id)" :disabled="busy || !canEdit" @click="inherit(id)">恢复继承</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div>
      <h3>配置：{{ feature === 'default' ? '默认模型' : names[feature] }}</h3>
      <Notice v-if="check" :kind="check.ok ? 'success' : 'error'">本页主动检查：{{ check.ok ? '调用成功并通过引用校验' : '调用失败' }} · {{ date(check.at) }}。仅代表该次检查，不保证后续调用。</Notice>
      <form @submit.prevent="save">
        <fieldset class="form-grid recruit-fields" :disabled="busy || !canEdit">
          <label class="field"><span>供应商</span>
            <select v-model="form.provider"><option value="deepseek">DeepSeek 官方接口</option><option value="openai">OpenAI 官方接口</option></select>
          </label>
          <label class="field"><span>模型 ID</span><input v-model="form.model" required placeholder="填写供应商控制台可用的模型 ID" /></label>
          <label class="field wide"><span>API Key {{ configs.some(c => c.feature === feature && c.has_key) ? '（已保存；留空保持，换供应商需重填）' : '（首次配置必填）' }}</span><input v-model="form.key" type="password" autocomplete="new-password" /></label>
          <label class="field wide"><span>该功能提示词</span><textarea v-model="form.prompt" required minlength="5" maxlength="3000" /></label>
          <label class="field"><span>累计预算（美元）</span><input v-model="form.budget" required type="number" step="any" min="0.001" /></label>
          <label class="field"><span>输入价格（美元 / 百万 token）</span><input v-model="form.input_price" required type="number" step="any" min="0.001" /></label>
          <label class="field"><span>输出价格（美元 / 百万 token）</span><input v-model="form.output_price" required type="number" step="any" min="0.001" /></label>
          <div class="form-footer">
            <p>按供应商当前价格填写；费用为本地估算，账单以供应商为准。</p>
            <button class="primary" :disabled="busy || !canEdit">{{ busy ? '保存中…' : '保存配置' }}</button>
          </div>
        </fieldset>
      </form>
      <button :disabled="busy" @click="testConnection">主动连接测试（有调用费用）</button>
      <p class="muted">页面不会自动连接供应商。测试使用已保存配置，不使用未保存的输入；不配置模型也可独立使用测评与固定计分。模型需支持 Chat Completions JSON 输出。</p>
    </div>
  </div>
</template>
