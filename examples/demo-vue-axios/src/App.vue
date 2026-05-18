<script setup lang="ts">
import LoginView from '@/views/LoginView.vue';
import UserListCard from '@/components/UserListCard.vue';
import OrderStatusCard from '@/components/OrderStatusCard.vue';
</script>

<template>
  <main>
    <LoginView />
    <UserListCard :users="[]" />
    <OrderStatusCard order-id="demo-order" status="pending" />
  </main>
</template>
