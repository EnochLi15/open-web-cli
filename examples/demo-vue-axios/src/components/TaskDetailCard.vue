<script setup lang="ts">
import type { KanbanTask } from '@/types';

defineProps<{
  task: KanbanTask;
  assignee: string;
}>();

function priorityType(priority: KanbanTask['priority']) {
  return priority === 'urgent' ? 'danger' : priority === 'high' ? 'warning' : priority === 'medium' ? 'primary' : 'info';
}
</script>

<template>
  <el-card class="detail-card" shadow="never">
    <div class="detail-heading">
      <el-tag :type="priorityType(task.priority)">{{ task.priority }}</el-tag>
      <span>{{ task.points }} pts</span>
    </div>
    <h2>{{ task.title }}</h2>
    <p>{{ task.summary }}</p>

    <dl>
      <div>
        <dt>Status</dt>
        <dd>{{ task.status }}</dd>
      </div>
      <div>
        <dt>Assignee</dt>
        <dd>{{ assignee }}</dd>
      </div>
      <div>
        <dt>Due</dt>
        <dd>{{ task.dueDate }}</dd>
      </div>
    </dl>

    <div class="tag-row">
      <el-tag v-for="tag in task.tags" :key="tag" effect="plain">{{ tag }}</el-tag>
    </div>
  </el-card>
</template>
