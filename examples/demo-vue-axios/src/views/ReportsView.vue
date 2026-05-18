<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { listKanbanCards } from '@/api/kanban';
import type { KanbanStatus, KanbanTask } from '@/types';

const tasks = ref<KanbanTask[]>([]);
const loading = ref(false);
const statuses: KanbanStatus[] = ['backlog', 'ready', 'progress', 'review', 'done'];

const completionRate = computed(() => {
  if (tasks.value.length === 0) {
    return 0;
  }
  return Math.round((tasks.value.filter((task) => task.status === 'done').length / tasks.value.length) * 100);
});

const statusRows = computed(() =>
  statuses.map((status) => ({
    status,
    cards: tasks.value.filter((task) => task.status === status).length,
    points: tasks.value.filter((task) => task.status === status).reduce((sum, task) => sum + task.points, 0),
  })),
);

onMounted(async () => {
  loading.value = true;
  try {
    tasks.value = (await listKanbanCards({})).data;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="page-layout single-page" v-loading="loading">
    <header class="page-header">
      <div>
        <p class="eyebrow">Delivery overview</p>
        <h1>Reports</h1>
      </div>
    </header>

    <div class="report-grid">
      <el-card shadow="never" class="report-card">
        <strong>Completion</strong>
        <el-progress type="dashboard" :percentage="completionRate" />
      </el-card>
      <el-card shadow="never" class="report-card">
        <strong>Total cards</strong>
        <span>{{ tasks.length }}</span>
      </el-card>
      <el-card shadow="never" class="report-card">
        <strong>Total points</strong>
        <span>{{ tasks.reduce((sum, task) => sum + task.points, 0) }}</span>
      </el-card>
    </div>

    <el-table :data="statusRows" border>
      <el-table-column prop="status" label="Status" />
      <el-table-column prop="cards" label="Cards" />
      <el-table-column prop="points" label="Points" />
    </el-table>
  </section>
</template>
