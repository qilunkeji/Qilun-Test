<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { sessionState } from '../logic/session';
import Notice from '../components/Notice.vue';

// Legacy Settings (main.tsx Settings()): settings-workspace + role-filtered tabbar.
// canManageAssessment (packages/security): talent_lead only.
const route = useRoute();
const role = computed(() => sessionState.session?.role ?? '');
const canManageAssessment = computed(() => role.value === 'talent_lead');
const tabs = computed(() => [
  { id: '/settings/models', label: '模型与接入' },
  { id: '/settings/status', label: '系统状态' },
  ...(canManageAssessment.value ? [{ id: '/settings/assessment/studio', label: '测评后台' }] : []),
  ...(canManageAssessment.value || role.value === 'ops' ? [{ id: '/settings/audit', label: '操作审计' }] : []),
]);
const adminTabs = [
  { id: '/settings/assessment/studio', label: '原版报告 · 版式与留白' },
  { id: '/settings/assessment/replica', label: '齐论测评 · 规则核验' },
  { id: '/settings/assessment/rules', label: '规则与依据' },
  { id: '/settings/assessment/evidence', label: '证据字典' },
  { id: '/settings/assessment/experiment', label: '规则实验' },
  { id: '/settings/assessment/binding', label: '测评绑定' },
];
const inAdmin = computed(() => route.path.startsWith('/settings/assessment'));
</script>

<template>
  <div class="settings-workspace">
    <div class="page-heading">
      <div>
        <h1>设置</h1>
        <p>{{ canManageAssessment ? '管理模型接入、系统状态与测评后台' : '管理模型接入与系统状态' }}</p>
      </div>
    </div>
    <div class="tabbar" aria-label="设置栏目">
      <button v-for="t in tabs" :key="t.id" :aria-pressed="inAdmin ? t.label === '测评后台' : route.path === t.id"
        :class="{ active: inAdmin ? t.label === '测评后台' : route.path === t.id }"
        @click="$router.push(t.id)">{{ t.label }}</button>
    </div>
    <template v-if="inAdmin">
      <Notice v-if="!canManageAssessment" kind="error">当前账号没有测评后台权限。</Notice>
      <template v-else>
        <section class="panel no-print">
          <h2>测评后台</h2>
          <p>仅人才负责人可查看。模板、原理、题库核验与试算不在日常测评中心展示；这里的操作不替代已完成答卷的结果。</p>
        </section>
        <div class="tabbar no-print" aria-label="测评后台栏目">
          <button v-for="t in adminTabs" :key="t.id" :aria-pressed="route.path === t.id" :class="{ active: route.path === t.id }"
            @click="$router.push(t.id)">{{ t.label }}</button>
        </div>
        <router-view />
      </template>
    </template>
    <router-view v-else />
  </div>
</template>
