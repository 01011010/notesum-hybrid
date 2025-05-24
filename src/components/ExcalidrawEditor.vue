// ExcalidrawEditor.vue
<template>
  <div class="drawing-container">
    <!-- Status bar -->
    <div class="toolbar">
      <div class="drawing-info">
        <input 
          v-model="drawingName" 
          @blur="updateDrawingName"
          class="drawing-name-input"
          placeholder="Untitled Drawing"
        />
      </div>
      
      <div class="save-status">
        <div class="status-indicator">
          <div class="status-dot" :class="saveStatusClass"></div>
          <span>{{ saveStatusText }}</span>
          <small v-if="lastSaved" class="last-saved">
            {{ lastSavedText }}
          </small>
        </div>
        
        <div class="version-controls" v-if="versions.length > 0">
          <button 
            @click="showVersionHistory = !showVersionHistory"
            class="version-btn"
          >
            History ({{ versions.length }})
          </button>
        </div>
      </div>
    </div>

    <!-- Drawing area -->
    <div class="drawing-area">
      <excalidraw-element 
        @excalidraw-change="handleDrawingChange"
        :initial-data="JSON.stringify(initialDrawingData)"
        style="height: 100%; width: 100%;">
      </excalidraw-element>
    </div>

    <!-- Version history panel -->
    <div v-if="showVersionHistory" class="version-panel">
      <div class="version-header">
        <h3>Version History</h3>
        <button @click="showVersionHistory = false">×</button>
      </div>
      <div class="version-list">
        <div 
          v-for="version in versions" 
          :key="version.id" 
          class="version-item"
          @click="loadVersion(version)"
        >
          <div class="version-info">
            <strong>{{ version.description }}</strong>
            <small>{{ formatDate(version.createdAt) }}</small>
          </div>
          <div class="version-preview">
            {{ version.elements?.length || 0 }} elements
          </div>
        </div>
      </div>
    </div>

    <!-- Toast notifications -->
    <div v-if="toast.show" :class="['toast', toast.type]">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { debounce } from 'lodash'
import { drawingService } from '../utils/drawingStore'
import '../excalidraw-wrapper.js'

// Props
const props = defineProps({
  drawingId: {
    type: [String, Number],
    default: null
  }
})

// Router
const route = useRoute()
const router = useRouter()

// Reactive data
// const currentDrawingId = ref(props.drawingId || route.params.id || null)
const currentDrawingId = ref(props.drawingId || null)

const drawingName = ref('Untitled Drawing')
const currentElements = ref([])
const currentAppState = ref({})
const saveStatus = ref('saved') // 'saving', 'saved', 'error', 'unsaved'
const lastSaved = ref(null)
const versions = ref([])
const showVersionHistory = ref(false)
const isInitialLoad = ref(true)

// Toast notification system
const toast = reactive({
  show: false,
  message: '',
  type: 'success'
})

// Initial drawing data for Excalidraw
const initialDrawingData = ref({
  elements: [],
  appState: {
    gridSize: null,
    viewBackgroundColor: "#ffffff"
  }
})

// Computed properties
const saveStatusClass = computed(() => ({
  'status-saved': saveStatus.value === 'saved',
  'status-saving': saveStatus.value === 'saving',
  'status-error': saveStatus.value === 'error',
  'status-unsaved': saveStatus.value === 'unsaved'
}))

const saveStatusText = computed(() => {
  const texts = {
    saved: 'Saved',
    saving: 'Saving...',
    error: 'Save failed',
    unsaved: 'Unsaved changes'
  }
  return texts[saveStatus.value]
})

const lastSavedText = computed(() => {
  if (!lastSaved.value) return ''
  const diff = Date.now() - lastSaved.value.getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
})

// Debounced auto-save function
const autoSave = debounce(async () => {
  await saveDrawing('Auto-save')
}, 2000)

// Snapshot creation (less frequent)
const createSnapshotDebounced = debounce(async () => {
  if (currentDrawingId.value && currentElements.value.length > 0) {
    await createSnapshot('Periodic snapshot')
  }
}, 300000) // Every 5 minutes

// Methods
async function loadDrawing(id) {
  try {
    const drawing = await drawingService.getDrawing(id)
    if (drawing) {
      drawingName.value = drawing.name || 'Untitled Drawing'
      currentElements.value = drawing.elements || []
      currentAppState.value = drawing.appState || {}
      
      // Update initial data for Excalidraw
      initialDrawingData.value = {
        elements: drawing.elements || [],
        appState: drawing.appState || {}
      }
      
      // Load version history
      versions.value = await drawingService.getVersionHistory(id)
      
      saveStatus.value = 'saved'
      lastSaved.value = drawing.updatedAt
    }
  } catch (error) {
    console.error('Failed to load drawing:', error)
    showToast('Failed to load drawing', 'error')
  }
}

async function saveDrawing(reason = 'Manual save') {
  if (isInitialLoad.value && currentElements.value.length === 0) {
    return // Don't save empty initial state
  }
  
  try {
    saveStatus.value = 'saving'
    
    const drawingData = {
      id: currentDrawingId.value,
      name: drawingName.value,
      elements: currentElements.value,
      appState: currentAppState.value
    }
    
    const result = await drawingService.saveDrawing(drawingData)
    
    // If this was a new drawing, update the ID and URL
    if (!currentDrawingId.value && result) {
      currentDrawingId.value = result
      // Update URL without navigation
      window.history.replaceState(null, '', `/drawing/${result}`)
    }
    
    saveStatus.value = 'saved'
    lastSaved.value = new Date()
    
    console.log(`Drawing saved: ${reason}`)
    
  } catch (error) {
    console.error('Failed to save drawing:', error)
    saveStatus.value = 'error'
    showToast('Failed to save drawing', 'error')
  }
}

async function createSnapshot(description) {
  if (!currentDrawingId.value) return
  
  try {
    await drawingService.createSnapshot(
      currentDrawingId.value,
      currentElements.value,
      currentAppState.value,
      description
    )
    
    // Refresh version history
    versions.value = await drawingService.getVersionHistory(currentDrawingId.value)
    
    // Clean up old versions
    await drawingService.cleanupVersions(currentDrawingId.value)
    
  } catch (error) {
    console.error('Failed to create snapshot:', error)
  }
}

async function loadVersion(version) {
  try {
    currentElements.value = version.elements || []
    currentAppState.value = version.appState || {}
    
    // Update Excalidraw with new data
    initialDrawingData.value = {
      elements: version.elements || [],
      appState: version.appState || {}
    }
    
    saveStatus.value = 'unsaved'
    showVersionHistory.value = false
    showToast('Version loaded - save to keep changes', 'info')
    
  } catch (error) {
    console.error('Failed to load version:', error)
    showToast('Failed to load version', 'error')
  }
}

function handleDrawingChange(event) {
  const { elements, appState } = event.detail
  
  currentElements.value = elements || []
  currentAppState.value = appState || {}
  
  // Skip saving during initial load
  if (isInitialLoad.value) {
    isInitialLoad.value = false
    return
  }
  
  // Mark as unsaved and trigger auto-save
  saveStatus.value = 'unsaved'
  autoSave()
  
  // Create periodic snapshots
  createSnapshotDebounced()
}

function updateDrawingName() {
  if (currentDrawingId.value) {
    autoSave()
  }
}

function handleKeyDown(event) {
  // Ctrl+S or Cmd+S
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    saveDrawing('Keyboard shortcut')
    showToast('Drawing saved!', 'success')
  }
}

function showToast(message, type = 'success') {
  toast.message = message
  toast.type = type
  toast.show = true
  
  setTimeout(() => {
    toast.show = false
  }, 3000)
}

function formatDate(date) {
  return new Date(date).toLocaleString()
}

// Save on page unload
function handleBeforeUnload() {
  if (saveStatus.value === 'unsaved') {
    saveDrawing('Page unload')
  }
}

// Lifecycle hooks
onMounted(async () => {
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('beforeunload', handleBeforeUnload)
  
  // Load existing drawing if ID provided
  if (currentDrawingId.value) {
    await loadDrawing(currentDrawingId.value)
  }
  
  // Set initial load flag to false after a short delay
  setTimeout(() => {
    isInitialLoad.value = false
  }, 1000)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  
  // Final save on unmount
  if (saveStatus.value === 'unsaved') {
    saveDrawing('Component unmount')
  }
})

// Watch for route changes
/*
watch(() => route.params.id, async (newId) => {
  if (newId !== currentDrawingId.value) {
    currentDrawingId.value = newId
    if (newId) {
      await loadDrawing(newId)
    }
  }
})
  */
</script>

<style scoped>
.drawing-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  min-height: 60px;
}

.drawing-name-input {
  border: none;
  background: transparent;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.drawing-name-input:hover,
.drawing-name-input:focus {
  background: white;
  outline: 2px solid #3b82f6;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background-color 0.3s ease;
}

.status-saved { background: #22c55e; }
.status-saving { 
  background: #f59e0b; 
  animation: pulse 1s infinite;
}
.status-error { background: #ef4444; }
.status-unsaved { background: #6b7280; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.last-saved {
  color: #6b7280;
  margin-left: 8px;
}

.version-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s;
}

.version-btn:hover {
  background: #2563eb;
}

.drawing-area {
  flex: 1;
  position: relative;
}

.version-panel {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 300px;
  max-height: 400px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.version-header h3 {
  margin: 0;
  font-size: 16px;
}

.version-header button {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
}

.version-list {
  max-height: 300px;
  overflow-y: auto;
}

.version-item {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background-color 0.2s;
}

.version-item:hover {
  background: #f8fafc;
}

.version-item:last-child {
  border-bottom: none;
}

.version-info strong {
  display: block;
  font-size: 14px;
  color: #1f2937;
}

.version-info small {
  color: #6b7280;
  font-size: 12px;
}

.version-preview {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.toast {
  position: fixed;
  top: 90px;
  right: 20px;
  padding: 12px 16px;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  z-index: 1001;
  animation: slideIn 0.3s ease;
}

.toast.success { background: #22c55e; }
.toast.error { background: #ef4444; }
.toast.info { background: #3b82f6; }

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>