<template><span /></template>

<script setup lang="ts">
const { onSuccess } = defineProps<{
  onSuccess: () => void
}>()

defineExpose({ onSuccess })
</script>
