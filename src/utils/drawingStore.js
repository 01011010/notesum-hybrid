// db/drawingStore.js
import Dexie from 'dexie'

// Extend your existing database or create a new one
export class DrawingDatabase extends Dexie {
  constructor() {
    super('DrawingDatabase')
    
    this.version(1).stores({
      // Your existing stores...
      drawings: '++id, name, elements, appState, createdAt, updatedAt, version',
      drawingVersions: '++id, drawingId, elements, appState, createdAt, description, isSnapshot'
    })
  }
}

export const db = new DrawingDatabase()

// Drawing service functions
export const drawingService = {
  // Save or update a drawing
  async saveDrawing(drawingData) {
    const now = new Date()
    const { id, name, elements, appState } = drawingData
    
    // Sanitize elements and appState to ensure they are cloneable
    const cleanElements = JSON.parse(JSON.stringify(elements || [])); // Ensure elements is at least an empty array
    const cleanAppState = JSON.parse(JSON.stringify(appState || {})); // Ensure appState is at least an empty object

    if (id) {
      // Update existing
      // Consider applying the same sanitization here if updates might also fail
      return await db.drawings.update(id, {
        elements: cleanElements,
        appState: cleanAppState,
        updatedAt: now,
        version: (await db.drawings.get(id))?.version + 1 || 1
      })
    } else {
      // Create new
      return await db.drawings.add({
        name: name || `Drawing ${now.toLocaleDateString()}`,
        elements: cleanElements, // Use sanitized elements
        appState: cleanAppState, // Use sanitized appState
        createdAt: now,
        updatedAt: now,
        version: 1
      })
    }
  },

  // Get a drawing by ID
  async getDrawing(id) {
    return await db.drawings.get(id)
  },

  // Get all drawings
  async getAllDrawings() {
    return await db.drawings.orderBy('updatedAt').reverse().toArray()
  },

  // Create a version snapshot
  async createSnapshot(drawingId, elements, appState, description = 'Auto-save') {
    // Ensure elements and appState are serializable (already done in your original code)
    const cleanElementsSnapshot = JSON.parse(JSON.stringify(elements || []));
    const cleanAppStateSnapshot = JSON.parse(JSON.stringify(appState || {}));

    return await db.drawingVersions.add({
      drawingId,
      elements: cleanElementsSnapshot,
      appState: cleanAppStateSnapshot,
      createdAt: new Date(),
      description,
      isSnapshot: true
    })
  },

  // Get version history for a drawing
  async getVersionHistory(drawingId) {
    return await db.drawingVersions
      .where('drawingId')
      .equals(drawingId)
      .orderBy('createdAt')
      .reverse()
      .toArray()
  },

  // Clean up old versions (keep last 10)
  async cleanupVersions(drawingId) {
    const versions = await this.getVersionHistory(drawingId)
    if (versions.length > 10) {
      const toDelete = versions.slice(10).map(v => v.id)
      await db.drawingVersions.bulkDelete(toDelete)
    }
  },

  // Delete a drawing and its versions
  async deleteDrawing(id) {
    await db.transaction('rw', [db.drawings, db.drawingVersions], async () => {
      await db.drawings.delete(id)
      await db.drawingVersions.where('drawingId').equals(id).delete()
    })
  }
}