<script setup lang="ts">
import {
  DataAnalysis,
  Grid,
  Setting,
  UserFilled,
} from '@element-plus/icons-vue';
</script>

<template>
  <el-config-provider>
    <main class="app-shell">
      <aside class="workspace-sidebar">
        <div class="brand-block">
          <div class="brand-mark">OW</div>
          <div>
            <strong>Open Web Board</strong>
            <span>Vue axios adapter demo</span>
          </div>
        </div>

        <el-menu :default-active="$route.path" router class="app-nav">
          <el-menu-item index="/board">
            <el-icon><Grid /></el-icon>
            <span>Board</span>
          </el-menu-item>
          <el-menu-item index="/members">
            <el-icon><UserFilled /></el-icon>
            <span>Members</span>
          </el-menu-item>
          <el-menu-item index="/reports">
            <el-icon><DataAnalysis /></el-icon>
            <span>Reports</span>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <span>Settings</span>
          </el-menu-item>
        </el-menu>
      </aside>

      <section class="app-content">
        <router-view />
      </section>
    </main>
  </el-config-provider>
</template>
