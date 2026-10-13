<script setup lang="ts">
// Shared-entry registration: /h5#<entry-token> — mirrors legacy public-entry.tsx.
// Registers with a locally generated participant_key, then routes into the quiz.
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

type EntryInfo = { title: string; purpose: string; expires_at: string; consent_version: string };
const router = useRouter();
const entryToken = ref('');
const info = ref<EntryInfo | null>(null);
const name = ref('');
const phone = ref('');
const birthDate = ref('');
const agreed = ref(false);
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
    localStorage.setItem(`qilun-profile:${payload.data.token}`, JSON.stringify({ name: name.value }));
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
  if (!entryToken.value) { error.value = '链接不完整，请重新打开邀请人发送的链接。'; return; }
  const res = await fetch('/api/v1/public/assessment/entry/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ token: entryToken.value }) });
  const payload = await res.json();
  if (!res.ok) { error.value = payload.error?.message ?? '链接无效'; return; }
  info.value = payload.data;
});
</script>

<template>
  <main class="h5-shell h5-reference">
    <div class="h5-brand">
      <img src="/brand/qilun-logo-light.png" alt="齐论AI" />
      <span>性格与发展测评</span>
    </div>
    <section class="h5-card h5-welcome">
      <h1>{{ info?.title ?? '欢迎参加齐论测评' }}</h1>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="!info && !error">正在打开测评…</p>
      <form v-if="info" @submit.prevent="enroll">
        <p>了解你的性格特点、工作偏好与优势，为成长和职业发展提供参考。</p>
        <p>请先填写你的个人信息，建议预留约30分钟，在安静的环境中按真实感受认真作答。答案没有对错，不必迎合他人的期待。</p>
        <label class="field"><span>本人姓名</span><input v-model="name" required autocomplete="name" maxlength="80" /></label>
        <label class="field"><span>手机号码</span><input v-model="phone" required type="tel" autocomplete="tel" pattern="\+?[0-9]{7,15}" /></label>
        <label class="field"><span>出生日期</span><input v-model="birthDate" required type="date" autocomplete="bday" min="1900-01-01" max="2026-12-31" /></label>
        <details>
          <summary>参与须知与数据说明</summary>
          <p>邀请用途：{{ info.purpose }}。资料、答案和报告由齐论系统保存，供本人及获授权工作人员查看；个人记录保留365天，访问截止随邀请有效期。结果用于自我理解与发展沟通，不是心理诊断，不作自动录用依据。需要删除可联系邀请人。同一浏览器保存本人续答信息；换设备或清除浏览器数据后，不能仅凭姓名找回答卷，请联系邀请人。共用设备请选择另一位参与者。</p>
        </details>
        <label class="check-label"><input v-model="agreed" type="checkbox" required />我自愿参与，已阅读并同意按邀请用途保存本人资料、答卷及报告。</label>
        <button class="primary" :disabled="busy || !agreed || !name || !phone || !birthDate">{{ busy ? '正在登记…' : '开始我的测评' }}</button>
      </form>
    </section>
  </main>
</template>
