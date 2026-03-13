import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

// Timeout for IndexedDB persistence sync (in milliseconds)
const PERSISTENCE_TIMEOUT = 5000;

/**
 * YjsRuntime - Manages the lifecycle of active Y.Doc instances.
 *
 * This class handles the low-level Yjs plumbing:
 * 1. Creating Y.Doc instances.
 * 2. Connecting them to IndexedDB for local persistence (offline-first).
 * 3. Connecting them to WebSocket for synchronization.
 * 4. Cleaning up resources when a document is unloaded.
 */
export class YjsRuntime {
    /**
     * @param {string} wsUrl - The WebSocket server URL.
     */
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        /** @type {Map<string, {ydoc: Y.Doc, provider: WebsocketProvider, persistence: IndexeddbPersistence}>} */
        this.activeDocs = new Map();
        /** @type {Map<string, Promise<import('yjs').Doc>>} In-progress document loads */
        this.loadingDocs = new Map();
    }

    /**
     * Loads a Y.Doc and connects its persistence and network providers.
     *
     * This method is deduplicated - if a load is already in progress for the same
     * docId, it will return the existing promise rather than creating duplicate
     * providers.
     *
     * @param {string} docId - The logical document ID.
     * @param {string} roomId - The physical room ID on the Yjs server.
     * @returns {Promise<import('yjs').Doc>}
     */
    async load(docId, roomId) {
        // Check if already loaded
        if (this.activeDocs.has(docId)) {
            const active = this.activeDocs.get(docId);
            // If roomId is the same, return existing. If different, we need to switch (shouldn't happen via loadDoc)
            if (active.provider.roomname === roomId) {
                console.log(`[YjsRuntime] Document ${docId} already loaded, reusing`);
                return active.ydoc;
            }
            console.log(`[YjsRuntime] Room ID changed for ${docId}, unloading old`);
            this.unload(docId);
        }

        // Check if load is already in progress - return existing promise to deduplicate
        if (this.loadingDocs.has(docId)) {
            console.log(`[YjsRuntime] Document ${docId} load already in progress, waiting...`);
            return this.loadingDocs.get(docId);
        }

        // Start a new load
        const loadPromise = this._doLoad(docId, roomId);
        this.loadingDocs.set(docId, loadPromise);

        try {
            return await loadPromise;
        } finally {
            this.loadingDocs.delete(docId);
        }
    }

    /**
     * Internal load implementation
     */
    async _doLoad(docId, roomId) {
        console.log(`[YjsRuntime] Loading document ${docId} (room: ${roomId})...`);
        const startTime = performance.now();

        const ydoc = new Y.Doc();

        // 1. Persistence first (Offline-first)
        console.log(`[YjsRuntime] Initializing IndexedDB persistence for ${roomId}...`);
        const persistence = new IndexeddbPersistence(roomId, ydoc);

        // Wait for persistence to load local data with timeout
        await new Promise((resolve) => {
            if (persistence.synced) {
                console.log(`[YjsRuntime] Persistence already synced for ${roomId}`);
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                console.warn(`[YjsRuntime] Persistence sync timeout for ${roomId}, proceeding anyway`);
                resolve();
            }, PERSISTENCE_TIMEOUT);

            persistence.once('synced', () => {
                clearTimeout(timeout);
                console.log(`[YjsRuntime] Persistence synced for ${roomId}`);
                resolve();
            });
        });

        // 2. WebSocket second
        console.log(`[YjsRuntime] Connecting WebSocket for ${roomId}...`);
        const provider = new WebsocketProvider(this.wsUrl, roomId, ydoc);

        this.activeDocs.set(docId, { ydoc, provider, persistence });

        console.log(`[YjsRuntime] Document ${docId} loaded in ${Math.round(performance.now() - startTime)}ms`);

        return ydoc;
    }

    /**
     * Retrieves an already loaded Y.Doc instance, if any.
     *
     * @param {string} docId
     * @returns {import('yjs').Doc|null}
     */
    get(docId) {
        return this.activeDocs.get(docId)?.ydoc || null;
    }

    /**
     * Unloads a document, destroying its providers and Y.Doc instance to free memory.
     *
     * @param {string} docId
     */
    unload(docId) {
        const active = this.activeDocs.get(docId);
        if (active) {
            active.provider.disconnect();
            active.provider.destroy();
            active.persistence.destroy();
            active.ydoc.destroy();
            this.activeDocs.delete(docId);
        }
    }

    shutdown() {
        for (const docId of this.activeDocs.keys()) {
            this.unload(docId);
        }
    }

    /**
     * @param {string} docId
     * @returns {boolean}
     */
    isConnected(docId) {
        return this.activeDocs.get(docId)?.provider.wsconnected || false;
    }

    /**
     * Explicitly initialize a Yjs document with the provided initializer function.
     * This should be called when creating a new document to ensure the initial
     * structure is set before other clients can load it.
     *
     * @param {string} docId - The logical document ID.
     * @param {string} roomId - The physical room ID on the Yjs server.
     * @param {function(Y.Doc): void} initializer - Function to initialize the document.
     * @returns {Promise<import('yjs').Doc>}
     */
    async initialize(docId, roomId, initializer) {
        console.log(`[YjsRuntime] Initializing document ${docId} (room: ${roomId})...`);

        // Load the document first
        const ydoc = await this.load(docId, roomId);

        // Run the initializer within a transaction
        ydoc.transact(() => {
            initializer(ydoc);
        });

        // Wait for persistence to sync the initial data
        const active = this.activeDocs.get(docId);
        if (active?.persistence) {
            await new Promise((resolve) => {
                // If already synced, resolve immediately
                if (active.persistence.synced) {
                    resolve();
                    return;
                }

                // Wait for sync with timeout
                const timeout = setTimeout(() => {
                    console.warn(`[YjsRuntime] Initialization sync timeout for ${roomId}`);
                    resolve();
                }, PERSISTENCE_TIMEOUT);

                active.persistence.once('synced', () => {
                    clearTimeout(timeout);
                    console.log(`[YjsRuntime] Initialization synced for ${roomId}`);
                    resolve();
                });
            });
        }

        console.log(`[YjsRuntime] Document ${docId} initialized`);
        return ydoc;
    }
}
