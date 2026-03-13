/**
 * FileRegistry - Central client for the file storage system.
 *
 * Provides two storage views:
 *   registry.app   - app-scoped flat list (files owned by or shared with the user, for this app)
 *   registry.drive - user's drive (hierarchical folders, browsable tree)
 *   registry.users - user directory (for sharing UI)
 *
 * Lifecycle:
 *   1. `new FileRegistry(options)` - create instance
 *   2. `await registry.init()`    - loads IndexedDB cache instantly, syncs in background
 *   3. Use `registry.app.*` and `registry.drive.*` immediately
 *   4. `await registry.shutdown()` when done
 *
 * Events (via registry.on / registry.off):
 *   'change'      - data changed (files or folders updated); re-read from registry
 *   'sync'        - background sync completed successfully
 *   'auth-error'  - server returned 401; re-authenticate
 */

import { StorageAPI } from './api/StorageAPI.js';
import { LocalStore } from './core/LocalStore.js';
import { YjsRuntime } from './core/YjsRuntime.js';
import { BlobCache } from './core/BlobCache.js';

// ============================================================
// Internal EventEmitter
// ============================================================

class EventEmitter {
    constructor() { this._handlers = new Map(); }

    on(event, fn) {
        if (!this._handlers.has(event)) this._handlers.set(event, []);
        this._handlers.get(event).push(fn);
    }

    off(event, fn) {
        const list = this._handlers.get(event);
        if (!list) return;
        const i = list.indexOf(fn);
        if (i !== -1) list.splice(i, 1);
    }

    emit(event, data) {
        this._handlers.get(event)?.forEach(fn => fn(data));
    }
}

// ============================================================
// AppView
// ============================================================

/**
 * View into app-scoped files for a specific app.
 * App files are a flat list (no folder hierarchy).
 * Every file must have `app === appName`.
 */
class AppView {
    /** @param {FileRegistry} registry @param {string} appName */
    constructor(registry, appName) {
        this._r = registry;
        this._appName = appName;
    }

    // -------------------------------------------------------
    // Query
    // -------------------------------------------------------

    /**
     * All app-scoped files for this app (owned + shared with you).
     * Available immediately after init(), before sync completes.
     * @returns {FileDescriptor[]}
     */
    list() {
        return [...this._r._files.values()].filter(f => f.scope === 'app' && f.app === this._appName && !f.deleted);
    }

    /** @param {string} id @returns {FileDescriptor|null} */
    get(id) {
        const f = this._r._files.get(id);
        return f && !f.deleted ? f : null;
    }

    /**
     * All attachments of a parent file.
     * @param {string} parentId
     * @returns {FileDescriptor[]}
     */
    getAttachments(parentId) {
        return [...this._r._files.values()].filter(f => f.parentId === parentId && !f.deleted);
    }

    // -------------------------------------------------------
    // Create
    // -------------------------------------------------------

    /**
     * Create a new Yjs file.
     * @param {{ title?: string, parentId?: string|null, publicRead?: boolean, publicWrite?: boolean }} [opts]
     * @returns {Promise<FileDescriptor>}
     */
    async createFile(opts = {}) {
        const file = await this._r._api.createFile({
            title: opts.title ?? 'Untitled',
            type: 'yjs',
            scope: 'app',
            app: this._appName,
            parentId: opts.parentId ?? null,
            publicRead: opts.publicRead ?? false,
            publicWrite: opts.publicWrite ?? false,
        });
        this._r._upsertFile(file);
        return file;
    }

    /**
     * Create a new blob file and upload its content.
     * @param {{ title?: string, file: File|Blob, filename?: string, parentId?: string|null, publicRead?: boolean, publicWrite?: boolean }} opts
     * @returns {Promise<FileDescriptor>}
     */
    async createBlob(opts) {
        return this._r._createBlobFile({ ...opts, scope: 'app', app: this._appName });
    }

    /**
     * Create an attachment (yjs or blob) under a parent file.
     * @param {{ parentId: string, title?: string, type?: 'yjs'|'blob', file?: File|Blob, publicRead?: boolean, publicWrite?: boolean }} opts
     * @returns {Promise<FileDescriptor>}
     */
    async createAttachment(opts) {
        if (opts.type === 'blob' && opts.file) {
            return this._r._createBlobFile({ ...opts, scope: 'app', app: this._appName });
        }
        const file = await this._r._api.createFile({
            title: opts.title ?? 'Untitled',
            type: opts.type ?? 'yjs',
            scope: 'app',
            app: this._appName,
            parentId: opts.parentId,
            publicRead: opts.publicRead ?? false,
            publicWrite: opts.publicWrite ?? false,
        });
        this._r._upsertFile(file);
        return file;
    }

    // -------------------------------------------------------
    // Load (Yjs)
    // -------------------------------------------------------

    /**
     * Load a Yjs document. Records this file as recently opened.
     * @param {string} id
     * @returns {Promise<import('yjs').Doc>}
     */
    async loadDoc(id) {
        const file = this.get(id);
        if (!file) throw new Error(`File not found: ${id}`);
        if (file.type !== 'yjs') throw new Error(`Not a Yjs file: ${id}`);
        this._r._recordOpen(id);
        return this._r._runtime.load(id, file.roomId);
    }

    /**
     * Get an already-loaded Yjs doc synchronously.
     * @param {string} id
     * @returns {import('yjs').Doc|null}
     */
    getDoc(id) { return this._r._runtime.get(id); }

    // -------------------------------------------------------
    // Blob
    // -------------------------------------------------------

    /**
     * Returns the authenticated URL for downloading a blob.
     * @param {string} id
     * @returns {string}
     */
    getBlobUrl(id) { return this._r._api.getBlobUrl(id); }

    /**
     * Fetch and cache a blob. Returns cached copy if still fresh.
     * @param {string} id
     * @returns {Promise<Blob>}
     */
    async fetchBlob(id) {
        const file = this.get(id);
        if (!file) throw new Error(`File not found: ${id}`);
        return this._r._blobCache.fetch(file, this._r._api.getBlobUrl(id));
    }

    /**
     * Return the blob from cache without network access. Null if not cached.
     * @param {string} id
     * @returns {Promise<Blob|null>}
     */
    getCachedBlob(id) {
        const file = this.get(id);
        if (!file) return Promise.resolve(null);
        return this._r._blobCache.getCached(file);
    }

    /**
     * Preemptively cache a list of blob files.
     * @param {string[]} ids
     */
    prefetchBlobs(ids) {
        const files = ids.map(id => this.get(id)).filter(Boolean);
        return this._r._blobCache.prefetch(files, id => this._r._api.getBlobUrl(id));
    }

    // -------------------------------------------------------
    // Modify
    // -------------------------------------------------------

    /** @returns {Promise<FileDescriptor>} */
    async renameFile(id, title) {
        const file = await this._r._api.renameFile(id, title);
        this._r._upsertFile(file);
        return file;
    }

    /** @returns {Promise<void>} */
    async delete(id) {
        await this._r._api.deleteFile(id);
        this._r._markDeleted(id);
    }

    /** @returns {Promise<FileDescriptor>} */
    async share(id, username, permissions = ['read', 'write']) {
        const file = await this._r._api.shareFile(id, username, permissions);
        this._r._upsertFile(file);
        return file;
    }

    /** @returns {Promise<FileDescriptor>} */
    async revoke(id, username) {
        const file = await this._r._api.revokeFile(id, username);
        this._r._upsertFile(file);
        return file;
    }

    /** @returns {Promise<FileDescriptor>} */
    async setPublic(id, publicRead, publicWrite) {
        const file = await this._r._api.setFilePublic(id, publicRead, publicWrite);
        this._r._upsertFile(file);
        return file;
    }

    /** @returns {Promise<FileDescriptor>} */
    async setParent(id, parentId) {
        const file = await this._r._api.setParent(id, parentId);
        this._r._upsertFile(file);
        return file;
    }
}

// ============================================================
// DriveView
// ============================================================

/**
 * View into the user's drive (hierarchical folder tree).
 * Folders are only present in drive scope.
 */
class DriveView {
    /** @param {FileRegistry} registry */
    constructor(registry) {
        this._r = registry;
    }

    // -------------------------------------------------------
    // Tree navigation
    // -------------------------------------------------------

    /**
     * Contents of a folder (or the root if folderId is null).
     * @param {string|null} folderId
     * @returns {{ folders: Folder[], files: FileDescriptor[] }}
     */
    getContents(folderId = null) {
        return {
            folders: [...this._r._folders.values()].filter(f => f.parentId === folderId),
            files: [...this._r._files.values()].filter(f =>
                f.scope === 'drive' && f.folderId === folderId && !f.deleted
            ),
        };
    }

    /**
     * Get a folder descriptor by ID.
     * @param {string} id
     * @returns {Folder|null}
     */
    getFolder(id) { return this._r._folders.get(id) ?? null; }

    /**
     * Get a file descriptor by ID.
     * @param {string} id
     * @returns {FileDescriptor|null}
     */
    getFile(id) {
        const f = this._r._files.get(id);
        return f && f.scope === 'drive' && !f.deleted ? f : null;
    }

    /**
     * Find the first drive file with a matching title, optionally within a folder.
     * @param {string} title
     * @param {string|null} [folderId]
     * @returns {FileDescriptor|null}
     */
    findFile(title, folderId = undefined) {
        for (const f of this._r._files.values()) {
            if (f.scope !== 'drive' || f.deleted) continue;
            if (f.title !== title) continue;
            if (folderId !== undefined && f.folderId !== folderId) continue;
            return f;
        }
        return null;
    }

    /**
     * All drive files and folders shared with the current user (not owned).
     * @returns {{ files: FileDescriptor[], folders: Folder[] }}
     */
    sharedWithMe() {
        const username = this._r._username;
        return {
            files: [...this._r._files.values()].filter(f =>
                f.scope === 'drive' && !f.deleted && f.owner !== username &&
                f.sharedWith.some(s => s.username === username)
            ),
            folders: [...this._r._folders.values()].filter(f =>
                f.owner !== username && f.sharedWith.some(s => s.username === username)
            ),
        };
    }

    /**
     * Recently opened drive files for this app (tracked locally in localStorage).
     * Returns files that still exist in the current index, most recent first.
     * @param {number} [limit=10]
     * @returns {FileDescriptor[]}
     */
    recentlyOpened(limit = 10) {
        return this._r._getRecentlyOpened(limit);
    }

    /**
     * All attachments of a drive file.
     * @param {string} parentId
     * @returns {FileDescriptor[]}
     */
    getAttachments(parentId) {
        return [...this._r._files.values()].filter(f => f.parentId === parentId && !f.deleted);
    }

    /**
     * All drive files (flat list, for search/bulk ops).
     * @returns {FileDescriptor[]}
     */
    listFiles() {
        return [...this._r._files.values()].filter(f => f.scope === 'drive' && !f.deleted);
    }

    /**
     * All folders.
     * @returns {Folder[]}
     */
    listFolders() {
        return [...this._r._folders.values()];
    }

    // -------------------------------------------------------
    // File operations
    // -------------------------------------------------------

    /** @returns {Promise<FileDescriptor>} */
    async createFile(opts = {}) {
        const file = await this._r._api.createFile({
            title: opts.title ?? 'Untitled',
            type: 'yjs',
            scope: 'drive',
            folderId: opts.folderId ?? null,
            parentId: opts.parentId ?? null,
            publicRead: opts.publicRead ?? false,
            publicWrite: opts.publicWrite ?? false,
        });
        this._r._upsertFile(file);
        return file;
    }

    /**
     * Create a new Yjs file and initialize it with the provided initializer function.
     * This ensures the document structure is set before other clients can load it,
     * preventing race conditions with offline clients.
     *
     * @param {{ title?: string, folderId?: string|null, parentId?: string|null, publicRead?: boolean, publicWrite?: boolean, initializer: function(import('yjs').Doc): void }} opts
     * @returns {Promise<FileDescriptor>}
     */
    async createAndInitializeFile(opts) {
        const { initializer, ...fileOpts } = opts;

        // Create the file metadata first
        const file = await this._r._api.createFile({
            title: fileOpts.title ?? 'Untitled',
            type: 'yjs',
            scope: 'drive',
            folderId: fileOpts.folderId ?? null,
            parentId: fileOpts.parentId ?? null,
            publicRead: fileOpts.publicRead ?? false,
            publicWrite: fileOpts.publicWrite ?? false,
        });

        // Initialize the Yjs document before adding to index
        if (initializer && file.roomId) {
            await this._r._runtime.initialize(file.id, file.roomId, initializer);
        }

        this._r._upsertFile(file);
        return file;
    }

    /** @returns {Promise<FileDescriptor>} */
    async createBlob(opts) {
        return this._r._createBlobFile({ ...opts, scope: 'drive' });
    }

    /** @returns {Promise<FileDescriptor>} */
    async createAttachment(opts) {
        if (opts.type === 'blob' && opts.file) {
            return this._r._createBlobFile({ ...opts, scope: 'drive' });
        }
        const file = await this._r._api.createFile({
            title: opts.title ?? 'Untitled',
            type: opts.type ?? 'yjs',
            scope: 'drive',
            parentId: opts.parentId,
            publicRead: opts.publicRead ?? false,
            publicWrite: opts.publicWrite ?? false,
        });
        this._r._upsertFile(file);
        return file;
    }

    // -------------------------------------------------------
    // Load (Yjs)
    // -------------------------------------------------------

    /**
     * Load a Yjs document. Records this file as recently opened.
     * @param {string} id
     * @returns {Promise<import('yjs').Doc>}
     */
    async loadDoc(id) {
        const file = this.getFile(id);
        if (!file) throw new Error(`File not found: ${id}`);
        if (file.type !== 'yjs') throw new Error(`Not a Yjs file: ${id}`);
        this._r._recordOpen(id);
        return this._r._runtime.load(id, file.roomId);
    }

    /** @param {string} id @returns {import('yjs').Doc|null} */
    getDoc(id) { return this._r._runtime.get(id); }

    // -------------------------------------------------------
    // Blob
    // -------------------------------------------------------

    getBlobUrl(id) { return this._r._api.getBlobUrl(id); }

    async fetchBlob(id) {
        const file = this.getFile(id);
        if (!file) throw new Error(`File not found: ${id}`);
        return this._r._blobCache.fetch(file, this._r._api.getBlobUrl(id));
    }

    getCachedBlob(id) {
        const file = this.getFile(id);
        if (!file) return Promise.resolve(null);
        return this._r._blobCache.getCached(file);
    }

    prefetchBlobs(ids) {
        const files = ids.map(id => this.getFile(id)).filter(Boolean);
        return this._r._blobCache.prefetch(files, id => this._r._api.getBlobUrl(id));
    }

    // -------------------------------------------------------
    // Modify files
    // -------------------------------------------------------

    async renameFile(id, title) {
        const file = await this._r._api.renameFile(id, title);
        this._r._upsertFile(file);
        return file;
    }

    async moveFile(id, targetFolderId) {
        const file = await this._r._api.moveFile(id, targetFolderId);
        this._r._upsertFile(file);
        return file;
    }

    async deleteFile(id) {
        await this._r._api.deleteFile(id);
        this._r._markDeleted(id);
    }

    async restoreFile(id) {
        const file = await this._r._api.restoreFile(id);
        this._r._upsertFile(file);
        return file;
    }

    async permanentDeleteFile(id) {
        await this._r._api.permanentDeleteFile(id);
        this._r._files.delete(id);
        this._r._localStore.removeFile(id);
        this._r.emit('change');
    }

    async shareFile(id, username, permissions = ['read', 'write']) {
        const file = await this._r._api.shareFile(id, username, permissions);
        this._r._upsertFile(file);
        return file;
    }

    async revokeFile(id, username) {
        const file = await this._r._api.revokeFile(id, username);
        this._r._upsertFile(file);
        return file;
    }

    async setFilePublic(id, publicRead, publicWrite) {
        const file = await this._r._api.setFilePublic(id, publicRead, publicWrite);
        this._r._upsertFile(file);
        return file;
    }

    async setParent(id, parentId) {
        const file = await this._r._api.setParent(id, parentId);
        this._r._upsertFile(file);
        return file;
    }

    // -------------------------------------------------------
    // Folder operations
    // -------------------------------------------------------

    async createFolder(opts) {
        const folder = await this._r._api.createFolder(opts);
        this._r._upsertFolder(folder);
        return folder;
    }

    async renameFolder(id, name) {
        const folder = await this._r._api.renameFolder(id, name);
        this._r._upsertFolder(folder);
        return folder;
    }

    async moveFolder(id, targetParentId) {
        const folder = await this._r._api.moveFolder(id, targetParentId);
        this._r._upsertFolder(folder);
        return folder;
    }

    async deleteFolder(id) {
        await this._r._api.deleteFolder(id);
        // Soft-deletes all contained files on server; resync to pick up changes
        await this._r.sync();
    }

    async shareFolder(id, username, permissions = ['read', 'write']) {
        const folder = await this._r._api.shareFolder(id, username, permissions);
        this._r._upsertFolder(folder);
        return folder;
    }

    async revokeFolderShare(id, username) {
        const folder = await this._r._api.revokeFolderShare(id, username);
        this._r._upsertFolder(folder);
        return folder;
    }

    async setFolderPublic(id, publicRead, publicWrite) {
        const folder = await this._r._api.setFolderPublic(id, publicRead, publicWrite);
        this._r._upsertFolder(folder);
        return folder;
    }
}

// ============================================================
// UsersView
// ============================================================

class UsersView {
    constructor(registry) { this._r = registry; }

    /**
     * List all platform users (useful for share UIs).
     * @returns {Promise<{username: string, displayName: string, isAdmin: boolean}[]>}
     */
    list() { return this._r._api.listUsers(); }
}

// ============================================================
// FileRegistry
// ============================================================

export class FileRegistry extends EventEmitter {
    /**
     * @param {object} options
     * @param {string}              options.appName      - Application name (namespaces app scope and IndexedDB)
     * @param {string}              options.baseUrl      - URL to storage.php
     * @param {string}              options.blobUrl      - URL to blob-storage.php
     * @param {string}              options.wsUrl        - Yjs WebSocket server URL
     * @param {() => string|null}   options.getApiKey    - Returns current API key (called on each request)
     * @param {() => string}        options.getUsername  - Returns current username
     * @param {number}             [options.syncInterval=300000] - Background sync interval (ms)
     */
    constructor(options) {
        super();
        this._options = options;
        this._appName = options.appName;
        this._username = 'anonymous';

        this._api = new StorageAPI(options.baseUrl, options.blobUrl, options.getApiKey);
        this._localStore = null;
        this._runtime = new YjsRuntime(options.wsUrl);
        this._blobCache = new BlobCache();

        /** @type {Map<string, object>} */
        this._files = new Map();
        /** @type {Map<string, object>} */
        this._folders = new Map();

        this._syncState = { isSyncing: false, lastSync: null, error: null };
        this._syncPromise = null;
        this._syncInterval = null;
        this._initPromise = null;

        this.app = new AppView(this, options.appName);
        this.drive = new DriveView(this);
        this.users = new UsersView(this);
    }

    // -------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------

    /**
     * Initialize: open IndexedDB, load cached data (synchronous path),
     * then kick off a background sync. Safe to call multiple times.
     */
    async init() {
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._doInit();
        return this._initPromise;
    }

    async _doInit() {
        this._username = this._options.getUsername?.() ?? 'anonymous';
        this._localStore = new LocalStore(this._appName, this._username);
        await this._localStore.open();

        // Load cached data immediately
        const [files, folders] = await Promise.all([
            this._localStore.getAllFiles(),
            this._localStore.getAllFolders(),
        ]);
        for (const f of files) this._files.set(f.id, f);
        for (const f of folders) this._folders.set(f.id, f);
        this.emit('change');

        // Background sync
        this._setupNetworkListeners();
        this._startSyncInterval();
        if (navigator.onLine) this.sync().catch(() => { });
    }

    /**
     * Trigger a full sync with the server immediately.
     * Safe to call multiple times concurrently (deduped).
     * @returns {Promise<void>}
     */
    async sync() {
        if (this._syncPromise) return this._syncPromise;
        if (!navigator.onLine) return;
        this._syncPromise = this._doSync().finally(() => { this._syncPromise = null; });
        return this._syncPromise;
    }

    async _doSync() {
        this._syncState.isSyncing = true;
        try {
            const { files, folders } = await this._api.fullSync();

            // Atomic local store update
            await this._localStore.replaceAll(files, folders);

            // Update in-memory maps
            this._files.clear();
            this._folders.clear();
            for (const f of files) this._files.set(f.id, f);
            for (const f of folders) this._folders.set(f.id, f);

            this._syncState.lastSync = new Date();
            this._syncState.error = null;
            this.emit('change');
            this.emit('sync');
        } catch (err) {
            this._syncState.error = err;
            if (err.message === 'AUTH_EXPIRED') this.emit('auth-error', err);
            throw err;
        } finally {
            this._syncState.isSyncing = false;
        }
    }

    /** @returns {{ isSyncing: boolean, lastSync: Date|null, error: Error|null }} */
    getSyncState() { return { ...this._syncState }; }

    async shutdown() {
        this._stopSyncInterval();
        this._removeNetworkListeners();
        this._runtime.shutdown();
        this._localStore?.close();
        this._files.clear();
        this._folders.clear();
        this._initPromise = null;
    }

    // -------------------------------------------------------
    // Internal mutations (shared by AppView + DriveView)
    // -------------------------------------------------------

    _upsertFile(file) {
        this._files.set(file.id, file);
        this._localStore?.putFile(file);
        this.emit('change');
    }

    _upsertFolder(folder) {
        this._folders.set(folder.id, folder);
        this._localStore?.putFolder(folder);
        this.emit('change');
    }

    _markDeleted(id) {
        const f = this._files.get(id);
        if (f) {
            const updated = { ...f, deleted: true };
            this._files.set(id, updated);
            this._localStore?.putFile(updated);
        }
        this.emit('change');
    }

    /**
     * Create a blob file: register metadata, upload content, then index.
     * Cleans up orphaned server metadata if upload fails.
     * @private
     */
    async _createBlobFile(opts) {
        const { file, title, scope, app, folderId, parentId, publicRead, publicWrite } = opts;

        let descriptor;
        try {
            descriptor = await this._api.createFile({
                title: title ?? file.name ?? 'Untitled',
                type: 'blob',
                scope,
                app: app ?? null,
                folderId: folderId ?? null,
                parentId: parentId ?? null,
                mimeType: file.type || null,
                size: file.size ?? null,
                filename: file.name ?? null,
                publicRead: publicRead ?? false,
                publicWrite: publicWrite ?? false,
            });
        } catch (err) {
            throw err;
        }

        try {
            await this._api.uploadBlob(descriptor.id, file);
        } catch (err) {
            // Best-effort cleanup of orphaned metadata
            this._api.deleteFile(descriptor.id).catch(() => { });
            throw err;
        }

        // Invalidate any stale blob cache entry
        await this._blobCache.invalidate(descriptor.id);
        this._upsertFile(descriptor);
        return descriptor;
    }

    // -------------------------------------------------------
    // Recently opened (localStorage, per-app, per-user)
    // -------------------------------------------------------

    _recentKey() {
        return `storage_recent_${this._appName}_${this._username}`;
    }

    _recordOpen(fileId) {
        try {
            const key = this._recentKey();
            const entries = JSON.parse(localStorage.getItem(key) ?? '[]');
            const updated = [{ id: fileId, ts: Date.now() }, ...entries.filter(e => e.id !== fileId)].slice(0, 50);
            localStorage.setItem(key, JSON.stringify(updated));
        } catch { /* localStorage may be unavailable */ }
    }

    _getRecentlyOpened(limit) {
        try {
            const entries = JSON.parse(localStorage.getItem(this._recentKey()) ?? '[]');
            const results = [];
            for (const { id } of entries) {
                if (results.length >= limit) break;
                const f = this._files.get(id);
                if (f && !f.deleted) results.push(f);
            }
            return results;
        } catch {
            return [];
        }
    }

    // -------------------------------------------------------
    // Network / sync interval
    // -------------------------------------------------------

    _setupNetworkListeners() {
        if (typeof window === 'undefined') return;
        this._onOnline = () => this.sync().catch(() => { });
        this._onVisible = () => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                this.sync().catch(() => { });
            }
        };
        window.addEventListener('online', this._onOnline);
        document.addEventListener('visibilitychange', this._onVisible);
    }

    _removeNetworkListeners() {
        if (typeof window === 'undefined') return;
        if (this._onOnline) window.removeEventListener('online', this._onOnline);
        if (this._onVisible) document.removeEventListener('visibilitychange', this._onVisible);
    }

    _startSyncInterval() {
        const ms = this._options.syncInterval ?? 300_000;
        this._syncInterval = setInterval(() => {
            if (navigator.onLine && !this._syncState.isSyncing) this.sync().catch(() => { });
        }, ms);
    }

    _stopSyncInterval() {
        if (this._syncInterval) {
            clearInterval(this._syncInterval);
            this._syncInterval = null;
        }
    }
}

/**
 * @typedef {object} FileDescriptor
 * @property {string}  id
 * @property {string}  owner
 * @property {string|null} app
 * @property {string}  title
 * @property {'yjs'|'blob'} type
 * @property {'drive'|'app'} scope
 * @property {string|null} folderId
 * @property {string|null} parentId
 * @property {string|null} roomId
 * @property {string|null} blobKey
 * @property {string|null} mimeType
 * @property {number|null} size
 * @property {string|null} filename
 * @property {boolean} publicRead
 * @property {boolean} publicWrite
 * @property {boolean} deleted
 * @property {string|null} createdAt
 * @property {string|null} updatedAt
 * @property {{username: string, permissions: string[]}[]} sharedWith
 */

/**
 * @typedef {object} Folder
 * @property {string}  id
 * @property {string}  owner
 * @property {string}  name
 * @property {string|null} parentId
 * @property {boolean} publicRead
 * @property {boolean} publicWrite
 * @property {string|null} createdAt
 * @property {string|null} updatedAt
 * @property {{username: string, permissions: string[]}[]} sharedWith
 */
