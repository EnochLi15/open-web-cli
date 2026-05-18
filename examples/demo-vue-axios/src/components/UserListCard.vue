<script setup lang="ts">
defineProps<{
  users: Array<{
    id: string;
    name: string;
  }>;
}>();
</script>

<template>
  <section>
    <h2>Users</h2>
    <ul>
      <li v-for="user in users" :key="user.id">{{ user.name }}</li>
    </ul>
  </section>
</template>
