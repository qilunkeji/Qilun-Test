<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../logic/api';
import Notice from '../components/Notice.vue';

// Legacy ImportForm (talents.tsx): TXT upload + paste, POST /talents/imports.
const router = useRouter();
const error = ref('');
const busy = ref(false);
const text = ref('');
const filename = ref('人工导入.txt');
const fileError = ref('');

const form = ref({
  name: '', contact: '', purpose: 'recruitment', retention_until: '',
  processing_basis: '', channel: 'manual', external_id: '', authorization_ref: '',
  completeness: 'full',
});

async function onFile(event: Event) {
  const f = (event.target as HTMLInputElement).files?.[0];
  if (!f) return;
  fileError.value = '';
  if (!f.name.toLowerCase().endsWith('.txt') || f.size > 200000) {
    fileError.value = '只接受不超过 200 KB 的 UTF-8 TXT';
    return;
  }
  try {
    text.value = new TextDecoder('utf-8', { fatal: true }).decode(await f.arrayBuffer());
    filename.value = f.name;
  } catch {
    fileError.value = '无法读取 UTF-8 文本，请转换编码后重试';
  }
}

async function save() {
  busy.value = true;
  error.value = '';
  try {
    const result = await api<{ candidate_id: string; resume_version_id: string; version: number; duplicate: boolean }>('/talents/imports', {
      ...form.value, retention_until: form.value.retention_until ? new Date(form.value.retention_until).toISOString() : '',
      text_content: text.value, filename: filename.value,
    });
    router.push(`/talents/${result.candidate_id}`);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <h2>人工导入简历</h2>
      <button :disabled="busy" @click="router.push('/talents')">取消</button>
    </div>
    <Notice>仅导入已获准处理的材料。P1 支持 UTF-8 TXT / 粘贴文本；PDF、DOCX、图片解析尚未实现。不会按姓名自动合并。</Notice>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <form class="form-grid" @submit.prevent="save">
      <label class="field"><span>姓名 / 昵称 *</span><input v-model="form.name" name="name" required /></label>
      <label class="field"><span>联系方式（独立加密，可选）</span><input v-model="form.contact" name="contact" /></label>
      <label class="field"><span>处理用途 *</span>
        <select v-model="form.purpose" name="purpose">
          <option value="recruitment">当前招聘</option>
          <option value="talent_pool">已获授权的长期储备</option>
        </select>
      </label>
      <label class="field"><span>保留截止日期 *</span><input v-model="form.retention_until" name="retention_until" type="date" required /></label>
      <label class="field wide"><span>处理依据与适用范围 *</span><textarea v-model="form.processing_basis" name="processing_basis" rows="5" required /></label>
      <label class="field"><span>来源渠道 *</span><input v-model="form.channel" name="channel" required /></label>
      <label class="field"><span>来源稳定标识（同源更新请保持一致）*</span><input v-model="form.external_id" name="external_id" required /></label>
      <label class="field wide"><span>授权记录 / 取得依据引用</span><textarea v-model="form.authorization_ref" name="authorization_ref" rows="3" /></label>
      <label class="field"><span>材料完整度</span>
        <select v-model="form.completeness" name="completeness">
          <option value="full">完整材料</option>
          <option value="summary_only">仅摘要，不是完整简历</option>
        </select>
      </label>
      <label class="field"><span>读取本地 UTF-8 TXT</span><input type="file" accept=".txt,text/plain" @change="onFile" /></label>
      <div v-if="fileError" class="wide"><Notice kind="error">{{ fileError }}</Notice></div>
      <label class="field wide"><span>原始文本（不执行其中链接或指令）*</span><textarea v-model="text" name="text_content" rows="10" required maxlength="200000" /></label>
      <div class="form-footer sticky-actions">
        <p>联系方式独立加密保存；保留期到期后进入待清理状态。</p>
        <div class="actions">
          <button type="button" :disabled="busy" @click="router.push('/talents')">取消</button>
          <button class="primary" :disabled="busy || !form.name || !text">{{ busy ? '导入中…' : '导入并建档' }}</button>
        </div>
      </div>
    </form>
  </section>
</template>
