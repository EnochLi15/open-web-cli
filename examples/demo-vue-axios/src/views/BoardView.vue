<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CirclePlus, Finished, Filter, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import KanbanBoardCard from '@/components/KanbanBoardCard.vue';
import TaskDetailCard from '@/components/TaskDetailCard.vue';
import { createKanbanCard, listKanbanCards, listKanbanMembers, moveKanbanCard } from '@/api/kanban';
import type { KanbanMember, KanbanPriority, KanbanStatus, KanbanTask, KanbanTaskInput } from '@/types';

type Lane = {
  status: KanbanStatus;
  title: string;
  tone: string;
};

const lanes: Lane[] = [
  { status: 'backlog', title: 'Backlog', tone: 'slate' },
  { status: 'ready', title: 'Ready', tone: 'blue' },
  { status: 'progress', title: 'In Progress', tone: 'amber' },
  { status: 'review', title: 'Review', tone: 'violet' },
  { status: 'done', title: 'Done', tone: 'green' },
];

const priorityOptions: KanbanPriority[] = ['low', 'medium', 'high', 'urgent'];
const tasks = ref<KanbanTask[]>([]);
const members = ref<KanbanMember[]>([]);
const loading = ref(false);
const query = ref('');
const assigneeId = ref('');
const selectedTaskId = ref('');
const createDialogOpen = ref(false);
const createForm = ref<KanbanTaskInput>({
  title: '',
  summary: '',
  priority: 'medium',
  assigneeId: '',
  dueDate: new Date().toISOString().slice(0, 10),
  tags: ['demo'],
  points: 3,
});

const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedTaskId.value) ?? tasks.value[0]);
const totalPoints = computed(() => tasks.value.reduce((sum, task) => sum + task.points, 0));
const doneCount = computed(() => tasks.value.filter((task) => task.status === 'done').length);

onMounted(async () => {
  await refreshBoard();
});

async function refreshBoard() {
  loading.value = true;
  try {
    const [memberResponse, taskResponse] = await Promise.all([
      listKanbanMembers(),
      listKanbanCards({ query: query.value, assigneeId: assigneeId.value || undefined }),
    ]);
    members.value = memberResponse.data;
    tasks.value = taskResponse.data;
    createForm.value.assigneeId ||= members.value[0]?.id ?? '';
    selectedTaskId.value ||= tasks.value[0]?.id ?? '';
  } finally {
    loading.value = false;
  }
}

async function submitTask() {
  if (!createForm.value.title.trim()) {
    ElMessage.warning('Add a task title first.');
    return;
  }

  const response = await createKanbanCard({
    ...createForm.value,
    tags: createForm.value.tags.filter(Boolean),
  });
  tasks.value = [response.data, ...tasks.value];
  selectedTaskId.value = response.data.id;
  createDialogOpen.value = false;
  createForm.value = {
    title: '',
    summary: '',
    priority: 'medium',
    assigneeId: members.value[0]?.id ?? '',
    dueDate: new Date().toISOString().slice(0, 10),
    tags: ['demo'],
    points: 3,
  };
  ElMessage.success('Card created.');
}

async function moveTask(task: KanbanTask, status: KanbanStatus) {
  const response = await moveKanbanCard(task.id, status);
  tasks.value = tasks.value.map((candidate) => (candidate.id === task.id ? response.data : candidate));
  selectedTaskId.value = task.id;
}

function memberName(id: string) {
  return members.value.find((member) => member.id === id)?.name ?? 'Unassigned';
}
</script>

<template>
  <div class="page-layout board-page">
    <section class="board-main">
      <header class="page-header">
        <div>
          <p class="eyebrow">Release workspace</p>
          <h1>Agent Adapter Kanban</h1>
        </div>
        <div class="header-actions">
          <el-button :icon="Finished" @click="refreshBoard">Refresh</el-button>
          <el-button type="primary" :icon="CirclePlus" @click="createDialogOpen = true">New Card</el-button>
        </div>
      </header>

      <div class="toolbar-row">
        <div class="section-title">
          <el-icon><Filter /></el-icon>
          Filters
        </div>
        <el-input v-model="query" :prefix-icon="Search" clearable placeholder="Search cards" @change="refreshBoard" />
        <el-select v-model="assigneeId" clearable placeholder="Assignee" @change="refreshBoard">
          <el-option v-for="member in members" :key="member.id" :label="member.name" :value="member.id" />
        </el-select>
      </div>

      <KanbanBoardCard
        v-loading="loading"
        :lanes="lanes"
        :tasks="tasks"
        :members="members"
        @select-task="selectedTaskId = $event"
        @move-task="moveTask"
      />
    </section>

    <aside class="context-panel">
      <div class="compact-stats">
        <div>
          <span>{{ tasks.length }}</span>
          Cards
        </div>
        <div>
          <span>{{ totalPoints }}</span>
          Points
        </div>
        <div>
          <span>{{ doneCount }}</span>
          Done
        </div>
      </div>

      <div class="panel-title">Selected Card</div>
      <TaskDetailCard v-if="selectedTask" :task="selectedTask" :assignee="memberName(selectedTask.assigneeId)" />
      <el-empty v-else description="No card selected" />
    </aside>

    <el-dialog v-model="createDialogOpen" title="Create Kanban Card" width="520">
      <el-form label-position="top">
        <el-form-item label="Title">
          <el-input v-model="createForm.title" placeholder="Card title" />
        </el-form-item>
        <el-form-item label="Summary">
          <el-input v-model="createForm.summary" type="textarea" :rows="3" placeholder="What needs to happen?" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="Assignee">
            <el-select v-model="createForm.assigneeId">
              <el-option v-for="member in members" :key="member.id" :label="member.name" :value="member.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Priority">
            <el-select v-model="createForm.priority">
              <el-option v-for="priority in priorityOptions" :key="priority" :label="priority" :value="priority" />
            </el-select>
          </el-form-item>
          <el-form-item label="Due date">
            <el-date-picker v-model="createForm.dueDate" type="date" value-format="YYYY-MM-DD" />
          </el-form-item>
          <el-form-item label="Points">
            <el-input-number v-model="createForm.points" :min="1" :max="13" />
          </el-form-item>
        </div>
        <el-form-item label="Tags">
          <el-select v-model="createForm.tags" multiple filterable allow-create default-first-option>
            <el-option label="demo" value="demo" />
            <el-option label="adapter" value="adapter" />
            <el-option label="ui" value="ui" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogOpen = false">Cancel</el-button>
        <el-button type="primary" @click="submitTask">Create</el-button>
      </template>
    </el-dialog>
  </div>
</template>
