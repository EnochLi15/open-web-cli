<script setup lang="ts">
import { ArrowRight, MoreFilled } from '@element-plus/icons-vue';
import type { KanbanMember, KanbanStatus, KanbanTask } from '@/types';

type Lane = {
  status: KanbanStatus;
  title: string;
  tone: string;
};

const props = defineProps<{
  lanes: Lane[];
  tasks: KanbanTask[];
  members: KanbanMember[];
}>();

const emit = defineEmits<{
  selectTask: [taskId: string];
  moveTask: [task: KanbanTask, status: KanbanStatus];
}>();

function tasksFor(status: KanbanStatus) {
  return props.tasks.filter((task) => task.status === status);
}

function memberName(id: string) {
  return props.members.find((member) => member.id === id)?.name ?? 'Unassigned';
}

function nextStatus(task: KanbanTask): KanbanStatus | undefined {
  const index = props.lanes.findIndex((lane) => lane.status === task.status);
  return props.lanes[index + 1]?.status;
}

function priorityType(priority: KanbanTask['priority']) {
  return priority === 'urgent' ? 'danger' : priority === 'high' ? 'warning' : priority === 'medium' ? 'primary' : 'info';
}
</script>

<template>
  <div class="kanban-grid">
    <section v-for="lane in lanes" :key="lane.status" class="lane-column" :data-tone="lane.tone">
      <header class="lane-header">
        <div>
          <span class="lane-dot" />
          <strong>{{ lane.title }}</strong>
        </div>
        <el-tag round size="small">{{ tasksFor(lane.status).length }}</el-tag>
      </header>

      <div class="lane-stack">
        <el-card
          v-for="task in tasksFor(lane.status)"
          :key="task.id"
          class="task-card"
          shadow="hover"
          @click="emit('selectTask', task.id)"
        >
          <div class="task-card-header">
            <el-tag :type="priorityType(task.priority)" size="small">{{ task.priority }}</el-tag>
            <el-dropdown trigger="click" @click.stop>
              <el-button :icon="MoreFilled" text circle />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="target in lanes"
                    :key="target.status"
                    :disabled="target.status === task.status"
                    @click="emit('moveTask', task, target.status)"
                  >
                    Move to {{ target.title }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <h3>{{ task.title }}</h3>
          <p>{{ task.summary }}</p>
          <div class="tag-row">
            <el-tag v-for="tag in task.tags" :key="tag" effect="plain" size="small">{{ tag }}</el-tag>
          </div>
          <footer>
            <span>{{ memberName(task.assigneeId) }}</span>
            <el-button v-if="nextStatus(task)" :icon="ArrowRight" text @click.stop="emit('moveTask', task, nextStatus(task)!)">
              Move
            </el-button>
          </footer>
        </el-card>

        <el-empty v-if="tasksFor(lane.status).length === 0" description="No cards" :image-size="72" />
      </div>
    </section>
  </div>
</template>
