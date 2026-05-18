<script setup lang="ts">
defineProps<{
  orderId: string;
  status: string;
}>();
</script>

<template>
  <section>
    <h2>Order {{ orderId }}</h2>
    <p>{{ status }}</p>
  </section>
</template>
