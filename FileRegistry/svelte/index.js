/**
 * Svelte store wrappers for FileRegistry.
 *
 * Wraps a FileRegistry instance in reactive Svelte stores so components
 * can use `$appFiles`, `$driveFiles`, `$driveFolders`, etc.
 *
 * Usage:
 *   import { createSvelteRegistry } from '$lib/yjs-manager/svelte';
 *
 *   const registry = createSvelteRegistry({
 *     appName:    'my-app',
 *     baseUrl:    '/api/storage.php',
 *     blobUrl:    '/api/blob-storage.php',
 *     wsUrl:      'wss://yjs.example.com',
 *     getApiKey:  () => localStorage.getItem('apiKey'),
 *     getUsername: () => localStorage.getItem('username'),
 *   });
 *
 *   await registry.init();
 *
 *   // In components:
 *   $: files = $registry.app.files;
 *   $: { folders, files: rootFiles } = $registry.drive.root;
 */

import { writable, derived, get } from 'svelte/store';
import { FileRegistry } from '../FileRegistry.js';

/**
 * Create a FileRegistry augmented with Svelte stores.
 *
 * All stores update automatically whenever the registry emits 'change'.
 * Stores are immediately populated from IndexedDB on `init()`.
 *
 * @param {ConstructorParameters<typeof FileRegistry>[0]} options
 * @returns {FileRegistry & SvelteStores}
 */
export function createSvelteRegistry(options) {
    const registry = new FileRegistry(options);

    // -------------------------------------------------------
    // App stores
    // -------------------------------------------------------

    const _appFiles = writable(/** @type {import('../FileRegistry').FileDescriptor[]} */ ([]));

    registry.app.files = { subscribe: _appFiles.subscribe };

    // -------------------------------------------------------
    // Drive stores
    // -------------------------------------------------------

    const _driveFiles   = writable(/** @type {import('../FileRegistry').FileDescriptor[]} */ ([]));
    const _driveFolders = writable(/** @type {import('../FileRegistry').Folder[]} */ ([]));

    registry.drive.files   = { subscribe: _driveFiles.subscribe };
    registry.drive.folders = { subscribe: _driveFolders.subscribe };

    // Derived store: contents of the drive root (folderId = null)
    registry.drive.root = derived(
        [_driveFiles, _driveFolders],
        ([$files, $folders]) => ({
            files:   $files.filter(f => f.folderId === null),
            folders: $folders.filter(f => f.parentId === null),
        })
    );

    // Derived store: items shared with the current user
    registry.drive.shared = derived(
        [_driveFiles, _driveFolders],
        ([$files, $folders]) => {
            const username = options.getUsername?.() ?? 'anonymous';
            return {
                files:   $files.filter(f => f.owner !== username && f.sharedWith.some(s => s.username === username)),
                folders: $folders.filter(f => f.owner !== username && f.sharedWith.some(s => s.username === username)),
            };
        }
    );

    // -------------------------------------------------------
    // Sync state store
    // -------------------------------------------------------

    const _syncState = writable(registry.getSyncState());
    registry.syncState = { subscribe: _syncState.subscribe };

    // -------------------------------------------------------
    // Wire up updates
    // -------------------------------------------------------

    function updateStores() {
        _appFiles.set(registry.app.list());
        _driveFiles.set(registry.drive.listFiles());
        _driveFolders.set(registry.drive.listFolders());
        _syncState.set(registry.getSyncState());
    }

    registry.on('change', updateStores);
    registry.on('sync',   () => _syncState.set(registry.getSyncState()));

    // Patch init() to populate stores after load
    const _origInit = registry.init.bind(registry);
    registry.init = async function () {
        await _origInit();
        updateStores();
    };

    return registry;
}
