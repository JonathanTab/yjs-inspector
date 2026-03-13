/**
 * BlobCache - Offline blob caching via the Cache Storage API.
 *
 * Caches full blob content keyed by file ID. Staleness is detected by
 * comparing the file's `updatedAt` timestamp against the cached value.
 *
 * Usage:
 *   const cache = new BlobCache();
 *
 *   // Fetch (downloads if not cached or stale, returns cached otherwise)
 *   const blob = await cache.fetch(file, getBlobUrl(file.id));
 *
 *   // Get only if already cached (null if not)
 *   const blob = await cache.getCached(file);
 *
 *   // Preemptively cache a set of files in the background
 *   cache.prefetch(files, getBlobUrl);
 *
 *   // Invalidate a cached entry (e.g. after upload)
 *   await cache.invalidate(fileId);
 */

const CACHE_NAME = 'blobs-v1';

// Synthetic request key pattern so the cache key is independent of the URL
// (which contains auth tokens that can change)
const cacheKey = (fileId) => new Request(`/_blob_cache_/${fileId}`);

export class BlobCache {
    /**
     * Fetch a blob, returning a cached copy if still fresh.
     * Downloads and caches it if missing or stale.
     *
     * @param {import('../FileRegistry').FileDescriptor} file
     * @param {string} url - Authenticated download URL
     * @returns {Promise<Blob>}
     */
    async fetch(file, url) {
        const cache  = await caches.open(CACHE_NAME);
        const key    = cacheKey(file.id);
        const cached = await cache.match(key);

        if (cached) {
            const cachedUpdatedAt = cached.headers.get('x-updated-at');
            if (cachedUpdatedAt === file.updatedAt) {
                return cached.blob();
            }
            // Stale — evict and re-fetch
            await cache.delete(key);
        }

        const response = await globalThis.fetch(url);
        if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`);

        // Store with updatedAt metadata so we can detect staleness later
        const body    = await response.arrayBuffer();
        const headers = new Headers({
            'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
            'x-updated-at': file.updatedAt ?? '',
        });
        await cache.put(key, new Response(body, { headers }));
        return new Blob([body], { type: headers.get('Content-Type') });
    }

    /**
     * Return the cached blob without hitting the network.
     * Returns null if not in cache or stale.
     *
     * @param {import('../FileRegistry').FileDescriptor} file
     * @returns {Promise<Blob|null>}
     */
    async getCached(file) {
        const cache  = await caches.open(CACHE_NAME);
        const cached = await cache.match(cacheKey(file.id));
        if (!cached) return null;
        if (cached.headers.get('x-updated-at') !== file.updatedAt) return null;
        return cached.blob();
    }

    /**
     * Preemptively cache a list of files in the background.
     * Already-cached and fresh files are skipped.
     *
     * @param {import('../FileRegistry').FileDescriptor[]} files
     * @param {(fileId: string) => string} getUrl - Returns authenticated URL for a file ID
     * @returns {Promise<void>} Resolves when all fetches complete (errors are swallowed)
     */
    async prefetch(files, getUrl) {
        const cache = await caches.open(CACHE_NAME);
        const tasks = files.map(async (file) => {
            const cached = await cache.match(cacheKey(file.id));
            if (cached && cached.headers.get('x-updated-at') === file.updatedAt) return; // fresh
            try {
                await this.fetch(file, getUrl(file.id));
            } catch {
                // Best-effort; ignore errors during prefetch
            }
        });
        await Promise.allSettled(tasks);
    }

    /**
     * Remove a file from the cache (e.g. after a new version is uploaded).
     * @param {string} fileId
     */
    async invalidate(fileId) {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(cacheKey(fileId));
    }

    /**
     * Check whether a blob is currently cached and fresh.
     * @param {import('../FileRegistry').FileDescriptor} file
     * @returns {Promise<boolean>}
     */
    async isCached(file) {
        const cache  = await caches.open(CACHE_NAME);
        const cached = await cache.match(cacheKey(file.id));
        return !!(cached && cached.headers.get('x-updated-at') === file.updatedAt);
    }
}
