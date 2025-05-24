// src/utils/sync-manager.js
import { createSmartSyncManager } from './smartSync';

// Export a factory function to create the manager
export function createAppSyncManager(noteTextStorage, appMetadataStorage) {
  return createSmartSyncManager(noteTextStorage, appMetadataStorage);
}
