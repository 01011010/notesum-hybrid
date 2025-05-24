<template>
  <Splitpanes class="default-theme h-full">
    <pane :size="50" min-size="20">
      <EditorComponent
        :currentPage="currentPage"
        :isDarkMode="isDark"
        :vaultKey="vaultKey"
        :is-read-only="!vaultKey"
      />
    </pane>
    <pane :size="50" min-size="20">
      <DrawingComponent
        :currentPage="currentPage"
        :isDarkMode="isDark"
      />
    </pane>
  </Splitpanes>
</template>

<script setup>
import EditorComponent from './CodeEditorEPages4.vue';
import DrawingComponent from './DrawingCanvas.vue';
import { Splitpanes, Pane } from 'splitpanes';


defineProps({
  currentPage: String,
  isDarkMode: Boolean,
  vaultKey: String,
});

// ✅ Explicitly register components
defineExpose({
  Splitpanes,
  Pane,
  EditorComponent,
  DrawingComponent,
});
</script>

<style scoped>
.default-theme {
  --splitpanes-border: 1px solid rgba(100, 100, 100, 0.2);
}
</style>
