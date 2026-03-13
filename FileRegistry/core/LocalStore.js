/**
 * LocalStore - IndexedDB cache for file and folder descriptors.
 *
 * Stores the full sync payload locally so the registry can serve
 * data immediately on startup (before the network sync completes).
 *
 * Database name: storage_{appName}_{username}
 * Object stores: 'files', 'folders'
 */
export class LocalStore {
    /**
     * @param {string} appName
     * @param {string} username
     */
    constructor(appName, username) {
        this.dbName = `storage_${appName}_${username}`;
        /** @type {IDBDatabase|null} */
        this._db = null;
    }

    async open() {
        if (this._db) return;
        this._db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('folders')) {
                    db.createObjectStore('folders', { keyPath: 'id' });
                }
            };
        });
    }

    // -------------------------------------------------------
    // Files
    // -------------------------------------------------------

    async getAllFiles() {
        return this._getAll('files');
    }

    async putFile(file) {
        return this._put('files', file);
    }

    async removeFile(id) {
        return this._delete('files', id);
    }

    // -------------------------------------------------------
    // Folders
    // -------------------------------------------------------

    async getAllFolders() {
        return this._getAll('folders');
    }

    async putFolder(folder) {
        return this._put('folders', folder);
    }

    async removeFolder(id) {
        return this._delete('folders', id);
    }

    // -------------------------------------------------------
    // Atomic bulk replace (used on full sync)
    // -------------------------------------------------------

    /**
     * Atomically replaces the entire local cache in a single transaction.
     * @param {object[]} files
     * @param {object[]} folders
     */
    async replaceAll(files, folders) {
        const db = this._db;
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['files', 'folders'], 'readwrite');
            tx.objectStore('files').clear();
            tx.objectStore('folders').clear();
            for (const f of files)   tx.objectStore('files').put(f);
            for (const f of folders) tx.objectStore('folders').put(f);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        });
    }

    // -------------------------------------------------------
    // Internal
    // -------------------------------------------------------

    async _getAll(storeName) {
        const db = this._db;
        return new Promise((resolve, reject) => {
            const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    async _put(storeName, value) {
        const db = this._db;
        return new Promise((resolve, reject) => {
            const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }

    async _delete(storeName, key) {
        const db = this._db;
        return new Promise((resolve, reject) => {
            const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }

    close() {
        this._db?.close();
        this._db = null;
    }
}
