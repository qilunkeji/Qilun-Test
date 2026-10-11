<script setup lang="ts">
// Shared-entry registration: /h5#<entry-token> — mirrors legacy public-entry.tsx.
// Registers with a locally generated participant_key, then routes into the quiz.
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../logic/api';

type EntryInfo = { title: string; purpose: string; expires_at: string; consent_version: string };
const router = useRouter();
const entryToken = ref('');
const info = ref<EntryInfo | null>(null);
const name = ref('');
const phone = ref('');
const birthDate = ref('');
const accepted = ref(false);
const busy = ref(false);
const error = ref('');

function participantKeyStorageKey() { return `qilun-participant:${entryToken.value}`; }

async function enroll() {
  busy.value = true;
  error.value = '';
  try {
    const key = localStorage.getItem(participantKeyStorageKey()) ?? randomKey();
    const res = await fetch('/api/v1/public/assessment/entry/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ token: entryToken.value, participant_key: key, accepted: true, consent_version: info.value!.consent_version, profile: { name: name.value, phone: phone.value, birth_date: birthDate.value } }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error?.message ?? '登记失败');
    localStorage.setItem(participantKeyStorageKey(), key);
    localStorage.setItem(`qilun-invite:${key}`, JSON.stringify({ token: payload.data.token }));
    router.push({ name: 'h5-quiz', hash: '#' + payload.data.token });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function randomKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

onMounted(async () => {
  entryToken.value = location.hash.slice(1);
  if (!entryToken.value) { error.value = '链接无效'; return; }
  const res = await fetch('/api/v1/public/assessment/entry/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ token: entryToken.value }) });
  const payload = await res.json();
  if (!res.ok) { error.value = payload.error?.message ?? '链接无效'; return; }
  info.value = payload.data;
});
</script>

<template>
  <div style="max-width: 480px; margin: 0 auto; padding: 24px 16px">
    <h3>{{ info?.title ?? '齐论测评' }}</h3>
    <p style="color: #666">{{ info?.purpose }}</p>
    <el-alert v-if="error" :title="error" type="error" show-icon style="margin-bottom: 16px" />
    <el-form v-if="info" label-position="top">
      <el-form-item label="本人姓名" required><el-input v-model="name" placeholder="本人填写" /></el-form-item>
      <el-form-item label="手机号码" required><el-input v-model="phone" /></el-form-item>
      <el-form-item label="出生日期" required><el-input v-model="birthDate" placeholder="1990-06-15" /></el-form-item>
      <el-checkbox v-model="accepted">我已阅读说明并同意参加本次发展参考测评</el-checkbox>
      <el-button type="primary" style="width: 100%; margin-top: 16px" :disabled="!accepted || !name || !phone || !birthDate" :loading="busy" @click="enroll">开始测评</el-button>
    </el-form>
  </div>
</template>
