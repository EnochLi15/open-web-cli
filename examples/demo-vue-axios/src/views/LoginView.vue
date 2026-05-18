<script setup lang="ts">
import { ref } from 'vue';
import { login } from '@/api/auth';

const email = ref('agent@example.test');
const password = ref('demo-password');

async function submitLogin() {
  await login(email.value, password.value);
}
</script>

<template>
  <form @submit.prevent="submitLogin">
    <input v-model="email" type="email" autocomplete="username" />
    <input v-model="password" type="password" autocomplete="current-password" />
    <button type="submit">Sign in</button>
  </form>
</template>
