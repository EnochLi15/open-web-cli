<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { listKanbanCards, listKanbanMembers } from '@/api/kanban';
import type { KanbanMember, KanbanTask } from '@/types';

const members = ref<KanbanMember[]>([]);
const tasks = ref<KanbanTask[]>([]);
const loading = ref(false);

const workload = computed(() =>
  members.value.map((member) => {
    const assigned = tasks.value.filter((task) => task.assigneeId === member.id);
    return {
      ...member,
      cards: assigned.length,
      points: assigned.reduce((sum, task) => sum + task.points, 0),
    };
  }),
);

onMounted(async () => {
  loading.value = true;
  try {
    const [memberResponse, taskResponse] = await Promise.all([listKanbanMembers(), listKanbanCards({})]);
    members.value = memberResponse.data;
    tasks.value = taskResponse.data;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="page-layout single-page" v-loading="loading">
    <header class="page-header">
      <div>
        <p class="eyebrow">Team workspace</p>
        <h1>Members</h1>
      </div>
    </header>

    <div class="member-grid">
      <el-card v-for="member in workload" :key="member.id" shadow="hover" class="member-card">
        <div class="member-card-head">
          <el-avatar :size="44">{{ member.avatar }}</el-avatar>
          <div>
            <h2>{{ member.name }}</h2>
            <span>{{ member.role }}</span>
          </div>
        </div>
        <div class="compact-stats">
          <div>
            <span>{{ member.cards }}</span>
            Cards
          </div>
          <div>
            <span>{{ member.points }}</span>
            Points
          </div>
        </div>
      </el-card>
    </div>
  </section>
</template>
