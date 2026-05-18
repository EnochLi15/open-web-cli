<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { login } from '@/api/auth';

const email = ref('agent@example.test');
const password = ref('demo-password');
const authenticated = ref(Boolean(localStorage.getItem('accessToken')));

async function submitLogin() {
  await login(email.value, password.value);
  authenticated.value = true;
  ElMessage.success('Demo auth token saved.');
}
</script>

<template>
  <el-form class="login-card" label-position="top" @submit.prevent="submitLogin">
    <div class="login-status">
      <strong>Demo Login</strong>
      <el-tag :type="authenticated ? 'success' : 'warning'" round>
        {{ authenticated ? 'Authenticated' : 'Guest' }}
      </el-tag>
    </div>
    <el-form-item label="Email">
      <el-input v-model="email" type="email" autocomplete="username" />
    </el-form-item>
    <el-form-item label="Password">
      <el-input v-model="password" type="password" autocomplete="current-password" show-password />
    </el-form-item>
    <el-button native-type="submit" type="primary">Sign in</el-button>
  </el-form>
</template>
