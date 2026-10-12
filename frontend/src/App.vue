<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const isH5 = computed(() => route.path.startsWith('/h5'));
const nav = [
  { to: '/', label: '首页' },
  { to: '/jobs', label: '岗位管理' },
  { to: '/talents', label: '人才档案' },
  { to: '/assessments', label: '测评中心' },
  { to: '/interviews', label: '面试评估' },
  { to: '/resume-library', label: '简历库' },
  { to: '/resume-screens', label: '智能筛选' },
  { to: '/extension-grants', label: '扩展授权' },
  { to: '/optimize', label: '招聘优化' },
  { to: '/assistant', label: 'AI 中心' },
  { to: '/project-groups', label: '项目组' },
  { to: '/public-entries', label: '公共入口' },
  { to: '/assessment/rules', label: '规则' },
  { to: '/assessment/replica', label: '复刻面板' },
  { to: '/assessment/studio', label: '报告工作室' },
  { to: '/assessment/binding', label: '测评绑定' },
  { to: '/assessment/evidence', label: '证据字典' },
  { to: '/assessment/experiment', label: '规则实验' },
  { to: '/settings', label: '设置' },
];
</script>

<template>
  <el-container v-if="!isH5" style="min-height: 100vh">
    <el-aside width="200px" style="border-right: 1px solid #e4e7ed">
      <div style="padding: 20px 16px; font-weight: 700; color: #1f1b1a">齐论 AI · 人才管理</div>
      <el-menu :default-active="route.path" router>
        <el-menu-item v-for="item in nav" :key="item.to" :index="item.to">{{ item.label }}</el-menu-item>
      </el-menu>
    </el-aside>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
  <router-view v-else />
</template>
