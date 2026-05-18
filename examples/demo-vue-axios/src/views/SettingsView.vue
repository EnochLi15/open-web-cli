<script setup lang="ts">
import LoginView from '@/views/LoginView.vue';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
</script>

<template>
  <section class="page-layout single-page settings-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Environment</p>
        <h1>Settings</h1>
      </div>
    </header>

    <div class="settings-grid">
      <el-card shadow="never">
        <LoginView />
      </el-card>
      <el-card shadow="never">
        <template #header>Adapter Inputs</template>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="API base">{{ apiBaseUrl }}</el-descriptions-item>
          <el-descriptions-item label="Mock API">enabled by default</el-descriptions-item>
          <el-descriptions-item label="Open Web config">open-web.config.ts</el-descriptions-item>
        </el-descriptions>
      </el-card>
    </div>
  </section>
</template>
