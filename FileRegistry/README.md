# FileRegistry

Offline-first file storage and real-time collaboration for Instrumenta apps.

---

## Overview

Two storage scopes, one consistent API:

| Scope | Description |
|-------|-------------|
| **app** | App-specific flat storage. Files must have an `app` field. No folders. Ideal for settings, caches, per-user app data. |
| **drive** | User's file system. Full folder hierarchy, sharing, browsable. Visible across apps. |

Two file types:

| Type | Description |
|------|-------------|
| **yjs** | Real-time collaborative Yjs document. Has a `roomId` for WebSocket sync. |
| **blob** | Binary file (image, PDF, etc.). Uploaded to blob storage, cacheable offline. |

---

## Quick Start

```js
import { FileRegistry } from '$lib/FileRegistry';

const registry = new FileRegistry({
  appName:     'plainTab',
  baseUrl:     '/api/storage.php',
  blobUrl:     '/api/blob-storage.php',
  wsUrl:       'wss://yjs.example.com',
  getApiKey:   () => localStorage.getItem('apiKey'),
  getUsername: () => localStorage.getItem('username'),
});

await registry.init();
// IndexedDB cache is loaded instantly.
// A background sync begins immediately.
```

### With Svelte stores

```js
import { createSvelteRegistry } from '$lib/FileRegistry/svelte';

const registry = createSvelteRegistry({ ...options });
await registry.init();

// In components:
$: appFiles   = $registry.app.files;
$: driveFiles = $registry.drive.files;
$: { files: rootFiles, folders } = $registry.drive.root;
$: { files: shared, folders: sharedFolders } = $registry.drive.shared;
```

---

## App Scope (`registry.app`)

### Reading (synchronous, from cache)

```js
registry.app.list()                    // FileDescriptor[] — all files for this app
registry.app.get(id)                   // FileDescriptor | null
registry.app.getAttachments(parentId)  // FileDescriptor[] — child files
```

### Creating

```js
// Yjs document
const file = await registry.app.createFile({ title: 'My Settings' });

// Binary blob
const blob = await registry.app.createBlob({ title: 'Avatar', file: fileObj });

// Attachment (child of another file)
const att = await registry.app.createAttachment({ parentId: file.id, title: 'Thumb', type: 'blob', file: thumb });
```

### Loading Yjs documents

```js
const ydoc = await registry.app.loadDoc(file.id);
// ydoc is a Y.Doc with IndexedDB persistence and WebSocket sync active.

registry.app.getDoc(file.id);  // Synchronous; returns null if not yet loaded
```

### Blobs

```js
const url    = registry.app.getBlobUrl(id);            // Authenticated download URL
const blob   = await registry.app.fetchBlob(id);       // Downloads and caches; returns cached if fresh
const cached = await registry.app.getCachedBlob(id);   // null if not cached
await registry.app.prefetchBlobs([id1, id2]);           // Preemptive background cache
```

### Modifying

```js
await registry.app.renameFile(id, 'New Title');
await registry.app.delete(id);                          // Soft delete
await registry.app.share(id, 'alice', ['read', 'write']);
await registry.app.revoke(id, 'alice');
await registry.app.setPublic(id, publicRead, publicWrite);
await registry.app.setParent(id, parentId);             // Move to attachment of another file
```

---

## Drive Scope (`registry.drive`)

### Tree navigation

```js
// Contents of a folder (or root when null)
const { folders, files } = registry.drive.getContents(null);
const { folders, files } = registry.drive.getContents(folderId);

// Lookups
registry.drive.getFolder(id)                 // Folder | null
registry.drive.getFile(id)                   // FileDescriptor | null
registry.drive.findFile('title', folderId?)  // First match by title
registry.drive.getAttachments(parentId)      // FileDescriptor[]

// Special views
registry.drive.sharedWithMe()           // { files, folders } shared with you
registry.drive.recentlyOpened(10)       // FileDescriptor[] — most recently opened by this app
registry.drive.listFiles()              // All drive files (flat)
registry.drive.listFolders()            // All folders
```

### File operations

```js
const file   = await registry.drive.createFile({ title, folderId, publicRead, publicWrite });
const blob   = await registry.drive.createBlob({ file: fileObj, title, folderId });
const att    = await registry.drive.createAttachment({ parentId, title, type, file });
const ydoc   = await registry.drive.loadDoc(id);
registry.drive.getDoc(id);

await registry.drive.renameFile(id, title);
await registry.drive.moveFile(id, targetFolderId);
await registry.drive.deleteFile(id);                    // Soft delete
await registry.drive.restoreFile(id);
await registry.drive.permanentDeleteFile(id);
await registry.drive.shareFile(id, username, perms);
await registry.drive.revokeFile(id, username);
await registry.drive.setFilePublic(id, read, write);
await registry.drive.setParent(id, parentId);           // Attachments
```

### Blob operations (same as app scope)

```js
const url  = registry.drive.getBlobUrl(id);
const blob = await registry.drive.fetchBlob(id);
await registry.drive.prefetchBlobs([id1, id2]);
```

### Folder operations

```js
const folder = await registry.drive.createFolder({ name, parentId, publicRead, publicWrite });
await registry.drive.renameFolder(id, name);
await registry.drive.moveFolder(id, targetParentId);
await registry.drive.deleteFolder(id);                  // Soft-deletes all contents
await registry.drive.shareFolder(id, username, perms);
await registry.drive.revokeFolderShare(id, username);
await registry.drive.setFolderPublic(id, read, write);
```

---

## Users (`registry.users`)

For populating share UIs:

```js
const users = await registry.users.list();
// [{ username, displayName, isAdmin }, ...]
```

---

## Events

```js
registry.on('change',     () => { /* files or folders updated — re-read from registry */ });
registry.on('sync',       () => { /* background sync completed */ });
registry.on('auth-error', () => { /* server returned 401; re-authenticate */ });

registry.off('change', handler);
```

---

## Sync

```js
await registry.sync();        // Force an immediate full sync
registry.getSyncState();      // { isSyncing, lastSync, error }
```

---

## Lifecycle

```js
await registry.init();        // Open IndexedDB, load cache, start background sync
await registry.shutdown();    // Close DB, disconnect Yjs, clear intervals
```

---

## Data shapes

### FileDescriptor

```ts
{
  id:          string
  owner:       string
  app:         string | null        // app-scoped files only
  title:       string
  type:        'yjs' | 'blob'
  scope:       'drive' | 'app'
  folderId:    string | null
  parentId:    string | null        // attachment parent
  roomId:      string | null        // Yjs room (type='yjs')
  blobKey:     string | null        // blob storage key (type='blob', equals id)
  mimeType:    string | null
  size:        number | null
  filename:    string | null
  publicRead:  boolean
  publicWrite: boolean
  deleted:     boolean
  createdAt:   string | null        // ISO datetime
  updatedAt:   string | null        // ISO datetime
  sharedWith:  { username: string, permissions: string[] }[]
}
```

### Folder

```ts
{
  id:          string
  owner:       string
  name:        string
  parentId:    string | null
  publicRead:  boolean
  publicWrite: boolean
  createdAt:   string | null
  updatedAt:   string | null
  sharedWith:  { username: string, permissions: string[] }[]
}
```

---

## Backend

| File | Description |
|------|-------------|
| `storage.php` | Metadata API (files, folders, sharing, users) |
| `blob-storage.php` | Binary file upload / download / streaming |

### storage.php actions

| Action | Method | Description |
|--------|--------|-------------|
| `full_sync` | GET | All accessible files and folders |
| `create` | POST | Create yjs or blob file |
| `rename` | POST | Rename file |
| `delete` | POST | Soft delete |
| `restore` | POST | Restore from trash |
| `permanent_delete` | POST | Hard delete (removes blob from disk) |
| `move_file` | POST | Move to different folder |
| `set_parent` | POST | Set attachment parent |
| `share` | POST | Share file with user |
| `revoke` | POST | Revoke user file access |
| `set_public` | POST | Set publicRead/publicWrite on file |
| `create_folder` | POST | Create folder |
| `rename_folder` | POST | Rename folder |
| `delete_folder` | POST | Delete folder and soft-delete all contents |
| `move_folder` | POST | Move folder |
| `share_folder` | POST | Share folder with user |
| `revoke_folder_share` | POST | Revoke user folder access |
| `set_folder_public` | POST | Set publicRead/publicWrite on folder |
| `users` | GET | List all platform users |

### blob-storage.php actions

| Action | Method | Description |
|--------|--------|-------------|
| `upload` | PUT/POST | Upload binary content |
| `download` | GET | Download with optional range request (HTTP 206) |
| `info` | GET | Blob metadata |

---

## Architecture

```
FileRegistry
├── AppView           — flat list of app-scoped files
├── DriveView         — folder tree + file ops
├── UsersView         — user directory for sharing
├── StorageAPI        — HTTP adapter (storage.php + blob-storage.php)
├── LocalStore        — IndexedDB cache (files + folders)
├── YjsRuntime        — Y.Doc lifecycle (IndexedDB persist + WebSocket sync)
└── BlobCache         — Cache API wrapper for offline blobs
```

**Offline first:** On startup, IndexedDB is loaded synchronously. The UI can render immediately. A background full sync then updates the cache and emits `'change'`.

**Blob caching:** Uses the browser Cache Storage API. Staleness is detected via `updatedAt` header. `prefetchBlobs()` warms the cache preemptively.

**Recently opened:** Tracked per-app in localStorage (last 50 file IDs). Filtered to currently accessible files on read.
