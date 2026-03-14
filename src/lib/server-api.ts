// Server API Client for Instrumenta Registry Storage System
// Aligns with storage.php and blob-storage.php backend endpoints

import type {
    FileDescriptor,
    Folder,
    FullSyncResult,
    ConnectionConfig,
    BlobInfo,
    CreateFileOptions,
    Permission,
    AdminStats,
    AdminFileUpdate,
    AdminFolderUpdate,
    User,
} from '@/types/storage';

export class ServerApi {
    private config: ConnectionConfig;

    constructor(config: ConnectionConfig) {
        this.config = config;
    }

    private buildStorageUrl(action: string, params: Record<string, string> = {}): string {
        // storage.php is at the root, uses ?action= endpoint style
        const url = new URL(`${this.config.baseUrl}/storage.php`);
        url.searchParams.set('action', action);

        // Add API key if provided
        if (this.config.apiKey) {
            url.searchParams.set('apikey', this.config.apiKey);
        }

        // Add other parameters
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });

        return url.toString();
    }

    private buildBlobUrl(id: string, action: string = 'download'): string {
        // blob-storage.php uses ?id=xxx&action=xxx style
        const url = new URL(`${this.config.blobStorageUrl}/blob-storage.php`);
        url.searchParams.set('id', id);
        url.searchParams.set('action', action);

        if (this.config.apiKey) {
            url.searchParams.set('apikey', this.config.apiKey);
        }

        return url.toString();
    }

    private async request<T>(
        url: string,
        method: string = 'GET',
        body?: Record<string, string | Blob>,
    ): Promise<T> {
        const options: RequestInit = {
            method,
            credentials: 'include', // Include cookies for session auth
        };

        if (method === 'POST' && body) {
            const formData = new FormData();
            Object.entries(body).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    formData.append(key, value as string | Blob);
                }
            });
            options.body = formData;
        }

        const response = await fetch(url, options);

        // Handle non-JSON responses (like blob downloads)
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response as T;
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data as T;
    }

    private async post<T>(url: string, body: Record<string, string | Blob | undefined>): Promise<T> {
        return this.request<T>(url, 'POST', body as Record<string, string | Blob>);
    }

    // Normalize server response to FileDescriptor
    // Server uses camelCase (via normalizeFile in storage.php)
    private normalizeFile(raw: Record<string, unknown>): FileDescriptor {
        return {
            id: raw.id as string,
            title: (raw.title as string) ?? 'Untitled',
            app: (raw.app as string | null) ?? null,
            owner: raw.owner as string,
            type: (raw.type as 'yjs' | 'blob') ?? 'yjs',
            scope: (raw.scope as 'app' | 'drive') ?? 'drive',
            folderId: (raw.folderId as string | null) ?? null,
            parentId: (raw.parentId as string | null) ?? null,
            roomId: (raw.roomId as string | null) ?? null,
            blobKey: (raw.blobKey as string | null) ?? null,
            mimeType: (raw.mimeType as string | null) ?? null,
            size: raw.size != null ? (raw.size as number) : null,
            filename: (raw.filename as string | null) ?? null,
            publicRead: raw.publicRead === true || raw.publicRead === 1,
            publicWrite: raw.publicWrite === true || raw.publicWrite === 1,
            deleted: raw.deleted === true || raw.deleted === 1,
            createdAt: (raw.createdAt as string | null) ?? null,
            updatedAt: (raw.updatedAt as string | null) ?? null,
            sharedWith: this.normalizeShares(raw.sharedWith),
        };
    }

    // Normalize server response to Folder
    private normalizeFolder(raw: Record<string, unknown>): Folder {
        return {
            id: raw.id as string,
            name: (raw.name as string) ?? 'Untitled Folder',
            parentId: (raw.parentId as string | null) ?? null,
            owner: raw.owner as string,
            publicRead: raw.publicRead === true || raw.publicRead === 1,
            publicWrite: raw.publicWrite === true || raw.publicWrite === 1,
            createdAt: (raw.createdAt as string | null) ?? null,
            updatedAt: (raw.updatedAt as string | null) ?? null,
            sharedWith: this.normalizeShares(raw.sharedWith),
        };
    }

    private normalizeShares(shares: unknown): Array<{ username: string; permissions: Permission[] }> {
        if (!Array.isArray(shares)) return [];
        return shares.map(s => ({
            username: s.username as string,
            permissions: Array.isArray(s.permissions) ? (s.permissions as Permission[]) : [],
        }));
    }

    // ========================================
    // Sync Operations
    // ========================================

    /**
     * Full sync - get all accessible files and folders.
     * Admin users automatically get all files. Pass impersonateUser in config to see
     * what a specific user would see. Pass includeDeleted to include soft-deleted files.
     */
    async fullSync(opts: { includeDeleted?: boolean } = {}): Promise<FullSyncResult> {
        const params: Record<string, string> = {};

        if (this.config.impersonateUser) {
            params.impersonate = this.config.impersonateUser;
        }
        if (opts.includeDeleted) {
            params.include_deleted = '1';
        }

        const response = await this.request<{
            files: Record<string, unknown>[];
            folders: Record<string, unknown>[];
            viewAs?: string;
            adminAll?: boolean;
        }>(this.buildStorageUrl('full_sync', params));

        return {
            documents: response.files.map(f => this.normalizeFile(f)),
            folders: response.folders.map(f => this.normalizeFolder(f)),
            viewAs: response.viewAs,
            adminAll: response.adminAll,
        };
    }

    // ========================================
    // File Operations
    // ========================================

    /**
     * Create a new file (yjs or blob)
     */
    async createFile(options: CreateFileOptions): Promise<FileDescriptor> {
        const body: Record<string, string | Blob | undefined> = {
            action: 'create',
            title: options.title,
            type: options.type,
            scope: options.app ? 'app' : 'drive',
        };

        if (options.folderId) body.folder_id = options.folderId;
        if (options.app) body.app = options.app;
        if (options.publicRead) body.public_read = '1';
        if (options.publicWrite) body.public_write = '1';

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('create'),
            body
        );
        return this.normalizeFile(response);
    }

    /**
     * Rename a file
     */
    async renameFile(id: string, title: string): Promise<FileDescriptor> {
        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('rename'),
            { action: 'rename', id, title }
        );
        return this.normalizeFile(response);
    }

    /**
     * Soft delete a file
     */
    async deleteFile(id: string): Promise<void> {
        await this.post(this.buildStorageUrl('delete'), { action: 'delete', id });
    }

    /**
     * Restore a deleted file
     */
    async restoreFile(id: string): Promise<FileDescriptor> {
        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('restore'),
            { action: 'restore', id }
        );
        return this.normalizeFile(response);
    }

    /**
     * Permanently delete a file (also removes blob from disk)
     */
    async permanentDeleteFile(id: string): Promise<void> {
        await this.post(this.buildStorageUrl('permanent_delete'), { action: 'permanent_delete', id });
    }

    /**
     * Move a file to a different folder
     */
    async moveFile(id: string, targetFolderId: string | null): Promise<FileDescriptor> {
        const body: Record<string, string | Blob | undefined> = {
            action: 'move_file',
            id
        };
        if (targetFolderId) body.target_folder_id = targetFolderId;

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('move_file'),
            body
        );
        return this.normalizeFile(response);
    }

    /**
     * Set parent file (for attachments)
     */
    async setParent(id: string, parentId: string | null): Promise<FileDescriptor> {
        const body: Record<string, string | Blob | undefined> = {
            action: 'set_parent',
            id
        };
        if (parentId) body.parent_id = parentId;

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('set_parent'),
            body
        );
        return this.normalizeFile(response);
    }

    // ========================================
    // File Sharing Operations
    // ========================================

    /**
     * Share a file with a user
     */
    async shareFile(
        id: string,
        username: string,
        permissions: Permission[],
    ): Promise<FileDescriptor> {
        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('share'),
            {
                action: 'share',
                id,
                username,
                permissions: permissions.join(',')
            }
        );
        return this.normalizeFile(response);
    }

    /**
     * Revoke file access from a user
     */
    async revokeFile(id: string, username: string): Promise<FileDescriptor> {
        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('revoke'),
            { action: 'revoke', id, username }
        );
        return this.normalizeFile(response);
    }

    /**
     * Set public access flags on a file
     */
    async setFilePublic(
        id: string,
        publicRead: boolean,
        publicWrite: boolean,
    ): Promise<FileDescriptor> {
        const body: Record<string, string | Blob | undefined> = {
            action: 'set_public',
            id
        };
        if (publicRead) body.public_read = '1';
        if (publicWrite) body.public_write = '1';

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('set_public'),
            body
        );
        return this.normalizeFile(response);
    }

    // ========================================
    // Folder Operations
    // ========================================

    /**
     * Create a new folder
     */
    async createFolder(name: string, parentId: string | null): Promise<Folder> {
        const body: Record<string, string | Blob | undefined> = {
            action: 'create_folder',
            name
        };
        if (parentId) body.parent_id = parentId;

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('create_folder'),
            body
        );
        return this.normalizeFolder(response);
    }

    /**
     * Rename a folder
     */
    async renameFolder(id: string, name: string): Promise<Folder> {
        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('rename_folder'),
            { action: 'rename_folder', folder_id: id, name }
        );
        return this.normalizeFolder(response);
    }

    /**
     * Delete a folder (soft-deletes all contents)
     */
    async deleteFolder(id: string): Promise<void> {
        await this.post(this.buildStorageUrl('delete_folder'), {
            action: 'delete_folder',
            folder_id: id
        });
    }

    /**
     * Move a folder to a different parent
     */
    async moveFolder(id: string, targetParentId: string | null): Promise<Folder> {
        const body: Record<string, string | Blob | undefined> = {
            action: 'move_folder',
            folder_id: id
        };
        if (targetParentId) body.target_parent_id = targetParentId;

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('move_folder'),
            body
        );
        return this.normalizeFolder(response);
    }

    // ========================================
    // Folder Sharing Operations
    // ========================================

    /**
     * Share a folder with a user
     */
    async shareFolder(
        id: string,
        username: string,
        permissions: Permission[],
    ): Promise<Folder> {
        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('share_folder'),
            {
                action: 'share_folder',
                folder_id: id,
                username,
                permissions: permissions.join(',')
            }
        );
        return this.normalizeFolder(response);
    }

    /**
     * Revoke folder access from a user
     */
    async revokeFolder(id: string, username: string): Promise<Folder> {
        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('revoke_folder_share'),
            { action: 'revoke_folder_share', folder_id: id, username }
        );
        return this.normalizeFolder(response);
    }

    /**
     * Set public access flags on a folder
     */
    async setFolderPublic(
        id: string,
        publicRead: boolean,
        publicWrite: boolean,
    ): Promise<Folder> {
        const body: Record<string, string | Blob | undefined> = {
            action: 'set_folder_public',
            folder_id: id
        };
        if (publicRead) body.public_read = '1';
        if (publicWrite) body.public_write = '1';

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('set_folder_public'),
            body
        );
        return this.normalizeFolder(response);
    }

    // ========================================
    // Blob Operations
    // ========================================

    /**
     * Get blob info
     */
    async getBlobInfo(id: string): Promise<BlobInfo> {
        const response = await this.request<Record<string, unknown>>(
            this.buildBlobUrl(id, 'info')
        );

        return {
            id: response.id as string,
            filename: (response.filename as string | null) ?? null,
            mimeType: (response.mime_type as string | null) ?? null,
            size: response.size != null ? (response.size as number) : null,
            blobExists: response.blob_exists === true || response.blob_exists === 1,
            createdAt: response.created_at != null ? (response.created_at as number) : null,
            updatedAt: response.updated_at != null ? (response.updated_at as number) : null,
        };
    }

    /**
     * Get blob download URL
     */
    getBlobUrl(id: string): string {
        return this.buildBlobUrl(id, 'download');
    }

    /**
     * Upload blob content
     */
    async uploadBlob(id: string, file: File): Promise<void> {
        const url = this.buildBlobUrl(id, 'upload');

        const response = await fetch(url, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
            },
            credentials: 'include',
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(data.error || `Upload failed: ${response.status}`);
        }
    }

    /**
     * Download blob content
     */
    async downloadBlob(id: string): Promise<Blob> {
        const response = await fetch(this.getBlobUrl(id), {
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        return response.blob();
    }

    // ========================================
    // User Operations
    // ========================================

    /**
     * Get list of all users (for sharing UI)
     */
    async getUsers(): Promise<User[]> {
        const response = await this.request<Array<{ username: string; displayName?: string; isAdmin?: boolean }>>(
            this.buildStorageUrl('users')
        );

        return response.map(u => ({
            username: u.username,
            is_admin: u.isAdmin,
        }));
    }

    // ========================================
    // WebSocket / Room Operations
    // ========================================

    /**
     * Get WebSocket URL for Yjs sync
     */
    getWebSocketUrl(): string {
        return this.config.wsUrl;
    }

    /**
     * Get room ID for a Yjs document
     * The room ID is stored in the file's roomId field
     */
    getRoomId(file: FileDescriptor): string | null {
        return file.roomId;
    }

    // ========================================
    // Legacy / Compatibility Methods
    // ========================================

    /**
     * Generate a unique ID
     */
    generateId(): string {
        return crypto.randomUUID ? crypto.randomUUID() :
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
    }

    /**
     * Check access to a document (legacy support)
     */
    async checkAccess(
        id: string,
        version?: string,
    ): Promise<{ room: string; user: string; permissions: Permission[] }> {
        void version; // Parameter kept for backward compatibility
        // For the new API, we get room from the file descriptor directly
        // This method is kept for backward compatibility
        const files = (await this.fullSync()).documents;
        const file = files.find(f => f.id === id);

        if (!file) {
            throw new Error('File not found');
        }

        return {
            room: file.roomId ?? id,
            user: file.owner,
            permissions: file.publicWrite ? ['read', 'write'] : ['read'],
        };
    }

    /**
     * Get children/attachments of a file
     */
    async getChildren(parentId: string): Promise<FileDescriptor[]> {
        const result = await this.fullSync();
        return result.documents.filter(f => f.parentId === parentId && !f.deleted);
    }

    /**
     * Get admin statistics from the backend admin_stats endpoint.
     */
    async getAdminStats(): Promise<AdminStats> {
        return this.request<AdminStats>(this.buildStorageUrl('admin_stats'));
    }

    // ========================================
    // Admin Operations
    // ========================================

    /**
     * Admin-only: update any field on a file.
     */
    async adminUpdateFile(id: string, fields: AdminFileUpdate): Promise<FileDescriptor> {
        const body: Record<string, string | Blob | undefined> = { id };
        if (fields.title !== undefined)       body.title        = fields.title;
        if (fields.owner !== undefined)       body.owner        = fields.owner;
        if (fields.type !== undefined)        body.type         = fields.type;
        if (fields.scope !== undefined)       body.scope        = fields.scope;
        if (fields.app !== undefined)         body.app          = fields.app ?? '';
        if (fields.folder_id !== undefined)   body.folder_id    = fields.folder_id ?? '';
        if (fields.parent_id !== undefined)   body.parent_id    = fields.parent_id ?? '';
        if (fields.room_id !== undefined)     body.room_id      = fields.room_id ?? '';
        if (fields.blob_key !== undefined)    body.blob_key     = fields.blob_key ?? '';
        if (fields.public_read !== undefined) body.public_read  = fields.public_read  ? '1' : '0';
        if (fields.public_write !== undefined) body.public_write = fields.public_write ? '1' : '0';

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('admin_update'), body
        );
        return this.normalizeFile(response);
    }

    /**
     * Admin-only: update any field on a folder.
     */
    async adminUpdateFolder(folderId: string, fields: AdminFolderUpdate): Promise<Folder> {
        const body: Record<string, string | Blob | undefined> = { folder_id: folderId };
        if (fields.name !== undefined)        body.name         = fields.name;
        if (fields.owner !== undefined)       body.owner        = fields.owner;
        if (fields.public_read !== undefined) body.public_read  = fields.public_read  ? '1' : '0';
        if (fields.public_write !== undefined) body.public_write = fields.public_write ? '1' : '0';

        const response = await this.post<Record<string, unknown>>(
            this.buildStorageUrl('admin_update_folder'), body
        );
        return this.normalizeFolder(response);
    }
}

// Factory function
export const createServerApi = (config: ConnectionConfig): ServerApi => {
    return new ServerApi(config);
};