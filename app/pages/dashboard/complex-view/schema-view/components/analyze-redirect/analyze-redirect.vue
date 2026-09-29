<template>
  <span class="analyze-redirect"></span>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const name = 'analyzeRedirect';

function show(rowData) {
  router.push({
    path: '/view/dashboard/resume-studio/report',
    query: {
      proj_key: route.query.proj_key,
      key: route.query.key,
      resumeId: rowData?.id,
    },
  });
}

defineExpose({
  name,
  show,
});
</script>
