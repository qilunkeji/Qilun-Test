<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api, setCsrf, type Session } from '../logic/api';

const router = useRouter();
const username = ref('local-admin');
const password = ref('');
const loading = ref(false);

async function login() {
  loading.value = true;
  try {
    const session = await api<Session>('/auth/login', { username: username.value, password: password.value });
    setCsrf(session.csrf_token);
    ElMessage.success(`欢迎，${session.username}`);
    router.push('/');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f7f8fa">
    <el-card style="width: 380px">
      <h2 style="margin: 0 0 20px">齐论 AI · 人才管理</h2>
      <el-form @submit.prevent="login">
        <el-form-item label="账号">
          <el-input v-model="username" placeholder="local-admin" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="password" type="password" show-password />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">登录</el-button>
      </el-form>
    </el-card>
  </div>
</template>
