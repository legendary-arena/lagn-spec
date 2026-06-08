<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import type { EChartsOption } from 'echarts';

const props = defineProps<{
  option: EChartsOption;
  height?: string;
  loading?: boolean;
}>();

const chartHeight = computed(() => props.height ?? '300px');
</script>

<template>
  <div :style="{ height: chartHeight, width: '100%' }">
    <VChart :option="props.option" :loading="props.loading ?? false" autoresize />
  </div>
</template>
