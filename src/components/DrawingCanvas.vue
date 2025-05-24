<template>
    <div class="h-full w-full relative bg-gray-50 dark:bg-gray-900">
      <!-- Toolbar -->
      <div class="absolute z-10 top-2 left-2 flex gap-2 bg-white dark:bg-gray-800 p-2 rounded shadow">
        <button
          v-for="tool in tools"
          :key="tool"
          @click="activeTool = tool"
          :class="[
            'px-3 py-1 rounded text-sm transition-colors',
            activeTool === tool
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
          ]"
        >
          {{ tool }}
        </button>
  
        <button
          v-if="selectedId"
          @click="deleteSelected"
          class="ml-4 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
        >
          Delete
        </button>
  
        <button
          @click="clearAll"
          class="ml-2 px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
        >
          Clear All
        </button>
      </div>
  
      <!-- Stage -->
      <v-stage
        :config="stageConfig"
        @mousedown="handleStageMouseDown"
        @touchstart="handleStageMouseDown"
        ref="stageRef"
      >
        <v-layer ref="layerRef">
          <!-- Text Nodes -->
          <v-text
            v-for="node in texts"
            :key="node.id"
            :config="{
              ...node,
              draggable: true
            }"
            @click="selectNode(node.id)"
            @tap="selectNode(node.id)"
            @dblclick="editText(node)"
            @dbltap="editText(node)"
            @dragend="updateNodePosition(node.id, $event)"
            @transformend="updateNodeTransform(node.id, $event)"
            :ref="el => setTextRef(node.id, el)"
          />
  
          <!-- Shapes -->
          <v-rect
            v-for="shape in shapes"
            :key="shape.id"
            :config="{
              ...shape,
              draggable: true
            }"
            @click="selectNode(shape.id)"
            @tap="selectNode(shape.id)"
            @dragend="updateShapePosition(shape.id, $event)"
            @transformend="updateShapeTransform(shape.id, $event)"
            :ref="el => setShapeRef(shape.id, el)"
          />
  
          <!-- Drawing Lines -->
          <v-line
            v-for="line in lines"
            :key="line.id"
            :config="line"
          />
  
          <!-- Transformer -->
          <v-transformer
            v-if="selectedId && (textRefs[selectedId] || shapeRefs[selectedId])"
            :config="transformerConfig"
            ref="transformerRef"
          />
        </v-layer>
      </v-stage>
  
      <!-- Hidden text input for inline editing -->
      <input
        v-if="isEditing"
        ref="editInput"
        v-model="editTextValue"
        @blur="finishEditing"
        @keydown="handleEditKeydown"
        class="absolute z-20 border-2 border-blue-500 px-2 py-1 rounded text-sm bg-white dark:bg-gray-800 dark:text-white"
        :style="inputStyle"
      />
    </div>
  </template>
  
  <script setup>
  import { ref, reactive, nextTick, onMounted, onUnmounted, watch } from 'vue';
  
  const tools = ['Text', 'Draw', 'Shape'];
  const activeTool = ref('Text');
  
  // Data arrays
  const texts = reactive([]);
  const shapes = reactive([]);
  const lines = reactive([]);
  
  // Selection and refs
  const selectedId = ref(null);
  const stageRef = ref(null);
  const layerRef = ref(null);
  const transformerRef = ref(null);
  const textRefs = reactive({});
  const shapeRefs = reactive({});
  
  // Stage configuration
  const stageConfig = reactive({ 
    width: window.innerWidth, 
    height: window.innerHeight 
  });
  
  // Transformer configuration
  const transformerConfig = {
    rotateEnabled: true,
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    boundBoxFunc: (oldBox, newBox) => {
      // Limit resize
      if (newBox.width < 5 || newBox.height < 5) {
        return oldBox;
      }
      return newBox;
    }
  };
  
  // Editing state
  const isEditing = ref(false);
  const editTextValue = ref('');
  const editInput = ref(null);
  const inputStyle = ref({});
  let editingNode = null;
  
  // Drawing state
  const isDrawing = ref(false);
  let currentLine = null;
  
  // Set refs functions
  const setTextRef = (id, el) => {
    if (el) {
      textRefs[id] = el;
    } else {
      delete textRefs[id];
    }
  };
  
  const setShapeRef = (id, el) => {
    if (el) {
      shapeRefs[id] = el;
    } else {
      delete shapeRefs[id];
    }
  };
  
  // Selection management
  const selectNode = (id) => {
    selectedId.value = id;
    updateTransformer();
  };
  
  const updateTransformer = () => {
    nextTick(() => {
      if (!transformerRef.value) return;
      
      const transformer = transformerRef.value.getNode();
      
      if (selectedId.value) {
        const selectedNode = textRefs[selectedId.value] || shapeRefs[selectedId.value];
        if (selectedNode) {
          transformer.nodes([selectedNode.getNode()]);
        }
      } else {
        transformer.nodes([]);
      }
      
      transformer.getLayer().batchDraw();
    });
  };
  
  // Stage interaction
  const handleStageMouseDown = (e) => {
    // If clicking on stage background
    if (e.target === e.target.getStage()) {
      selectedId.value = null;
      updateTransformer();
      
      const pointer = e.target.getStage().getPointerPosition();
      
      if (activeTool.value === 'Text') {
        addTextNode(pointer.x, pointer.y);
      } else if (activeTool.value === 'Shape') {
        addShapeNode(pointer.x, pointer.y);
      } else if (activeTool.value === 'Draw') {
        startDrawing(pointer);
      }
    }
  };
  
  // Text node operations
  const addTextNode = (x = 100, y = 100) => {
    const id = crypto.randomUUID();
    const newText = {
      id,
      text: 'Double-click to edit',
      x,
      y,
      fontSize: 20,
      fontFamily: 'Arial',
      fill: '#000000',
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    };
    
    texts.push(newText);
    selectedId.value = id;
    
    nextTick(() => {
      updateTransformer();
    });
  };
  
  // Shape node operations
  const addShapeNode = (x = 100, y = 100) => {
    const id = crypto.randomUUID();
    const newShape = {
      id,
      x,
      y,
      width: 100,
      height: 60,
      fill: '#4F46E5',
      stroke: '#312E81',
      strokeWidth: 2,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    };
    
    shapes.push(newShape);
    selectedId.value = id;
    
    nextTick(() => {
      updateTransformer();
    });
  };
  
  // Drawing operations
  const startDrawing = (pointer) => {
    isDrawing.value = true;
    const id = crypto.randomUUID();
    currentLine = {
      id,
      points: [pointer.x, pointer.y],
      stroke: '#000000',
      strokeWidth: 2,
      lineCap: 'round',
      lineJoin: 'round'
    };
    lines.push(currentLine);
  };
  
  // Position and transform updates
  const updateNodePosition = (id, e) => {
    const node = texts.find(n => n.id === id);
    if (node) {
      node.x = e.target.x();
      node.y = e.target.y();
    }
  };
  
  const updateShapePosition = (id, e) => {
    const shape = shapes.find(s => s.id === id);
    if (shape) {
      shape.x = e.target.x();
      shape.y = e.target.y();
    }
  };
  
  const updateNodeTransform = (id, e) => {
    const node = texts.find(n => n.id === id);
    const target = e.target;
    if (node) {
      node.x = target.x();
      node.y = target.y();
      node.rotation = target.rotation();
      
      // Apply scale to fontSize instead of using scaleX/scaleY
      const scaleX = target.scaleX();
      const scaleY = target.scaleY();
      node.fontSize = Math.max(node.fontSize * scaleX, 6);
      
      // Reset scale
      target.scaleX(1);
      target.scaleY(1);
    }
  };
  
  const updateShapeTransform = (id, e) => {
    const shape = shapes.find(s => s.id === id);
    const target = e.target;
    if (shape) {
      shape.x = target.x();
      shape.y = target.y();
      shape.rotation = target.rotation();
      shape.scaleX = target.scaleX();
      shape.scaleY = target.scaleY();
    }
  };
  
  // Text editing
  const editText = (node) => {
    if (isEditing.value) return;
    
    editingNode = node;
    editTextValue.value = node.text;
    isEditing.value = true;
  
    nextTick(() => {
      if (!textRefs[node.id] || !editInput.value) return;
      
      const textNode = textRefs[node.id].getNode();
      const stage = stageRef.value.getStage();
      const stageBox = stage.container().getBoundingClientRect();
      const textBox = textNode.getClientRect();
      
      inputStyle.value = {
        top: `${textBox.y + stageBox.top}px`,
        left: `${textBox.x + stageBox.left}px`,
        width: `${Math.max(textBox.width, 100)}px`,
        fontSize: `${textNode.fontSize()}px`,
        fontFamily: textNode.fontFamily(),
        color: textNode.fill()
      };
      
      editInput.value.focus();
      editInput.value.select();
    });
  };
  
  const finishEditing = () => {
    if (editingNode && editTextValue.value.trim()) {
      editingNode.text = editTextValue.value.trim();
    }
    
    editingNode = null;
    isEditing.value = false;
    editTextValue.value = '';
  };
  
  const handleEditKeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finishEditing();
    } else if (e.key === 'Escape') {
      isEditing.value = false;
      editingNode = null;
      editTextValue.value = '';
    }
  };
  
  // Deletion operations
  const deleteSelected = () => {
    if (!selectedId.value) return;
    
    // Try to delete from texts
    const textIdx = texts.findIndex(t => t.id === selectedId.value);
    if (textIdx !== -1) {
      texts.splice(textIdx, 1);
      delete textRefs[selectedId.value];
    }
    
    // Try to delete from shapes
    const shapeIdx = shapes.findIndex(s => s.id === selectedId.value);
    if (shapeIdx !== -1) {
      shapes.splice(shapeIdx, 1);
      delete shapeRefs[selectedId.value];
    }
    
    selectedId.value = null;
    updateTransformer();
  };
  
  const clearAll = () => {
    texts.splice(0);
    shapes.splice(0);
    lines.splice(0);
    Object.keys(textRefs).forEach(key => delete textRefs[key]);
    Object.keys(shapeRefs).forEach(key => delete shapeRefs[key]);
    selectedId.value = null;
    updateTransformer();
  };
  
  // Window resize handling
  const handleResize = () => {
    stageConfig.width = window.innerWidth;
    stageConfig.height = window.innerHeight;
  };
  
  // Keyboard shortcuts
  const handleKeydown = (e) => {
    if (isEditing.value) return;
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId.value) {
        deleteSelected();
      }
    } else if (e.key === 'Escape') {
      selectedId.value = null;
      updateTransformer();
    }
  };
  
  // Lifecycle
  onMounted(() => {
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeydown);
  });
  
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleKeydown);
  });
  
  // Watch for selectedId changes
  watch(selectedId, () => {
    updateTransformer();
  });
  </script>
  
  <style scoped>
  button {
    transition: all 0.2s ease;
  }
  
  button:hover {
    transform: translateY(-1px);
  }
  
  button:active {
    transform: translateY(0);
  }
  
  .v-stage {
    cursor: crosshair;
  }
  </style>