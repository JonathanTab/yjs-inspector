// Permission types
export type Permission = 'read' | 'write';

// File types
export type FileType = 'yjs' | 'blob';
export type StorageScope = 'app' | 'drive';

// Browser mode for scope toggle
export type BrowserMode = 'tree' | 'list';

// Raw file descriptor from server (matches storage.php response)
export interface FileDescriptor {
    id: string;
    title: string;
    app: string | null;
    owner: string;
    type: FileType;
    scope: StorageScope;
    folderId: string | null;
    parentId: string | null;
    roomId: string | null;           // Yjs room ID for type='yjs'
    blobKey: string | null;          // Blob storage key for type='blob' (equals id)
    mimeType: string | null;
    size: number | null;
    filename: string | null;
    publicRead: boolean;
    publicWrite: boolean;
    deleted: boolean;
    createdAt: string | null;        // ISO datetime string
    updatedAt: string | null;        // ISO datetime string
    sharedWith: Array<{
        username: string;
        permissions: Permission[];
    }>;
    // Legacy fields for backwards compatibility
    permissions?: Permission[];
    versions?: Record<string, string>;
}

// Classified file with computed flags for UI
export interface ClassifiedFile extends FileDescriptor {
    owned: boolean;
    shared: boolean;
    writable: boolean;
}

// Folder type (matches storage.php response)
export interface Folder {
    id: string;
    name: string;
    parentId: string | null;
    owner: string;
    publicRead: boolean;
    publicWrite: boolean;
    createdAt: string | null;        // ISO datetime string
    updatedAt: string | null;        // ISO datetime string
    sharedWith: Array<{
        username: string;
        permissions: Permission[];
    }>;
    // Legacy field for backwards compatibility
    permissions?: Permission[];
}

// Classified folder with computed flags
export interface ClassifiedFolder extends Folder {
    owned: boolean;
    shared: boolean;
    writable: boolean;
}

// Full sync result
export interface FullSyncResult {
    documents: FileDescriptor[];
    folders: Folder[];
}

// Connection configuration
export interface ConnectionConfig {
    baseUrl: string;
    apiKey: string;
    wsUrl: string;
    blobStorageUrl: string;
    adminMode: boolean;
    impersonateUser: string | null;
}

// Sync state
export interface SyncState {
    isSyncing: boolean;
    lastSyncTime: Date | null;
    lastSyncError: Error | null;
}

// View modes for browser
export type ViewMode = 'drive' | 'app' | 'all' | 'deleted';

// Sort options
export type SortField = 'title' | 'owner' | 'updatedAt' | 'createdAt' | 'size';
export type SortDirection = 'asc' | 'desc';

export interface SortOptions {
    field: SortField;
    direction: SortDirection;
}

// Filter options
export interface FilterOptions {
    search: string;
    owner: string | null;
    app: string | null;
    type: FileType | null;
    scope: StorageScope | null;
    publicOnly: boolean;
    showDeleted: boolean;
}

// Blob info response
export interface BlobInfo {
    id: string;
    filename: string | null;
    mimeType: string | null;
    size: number | null;
    blobExists: boolean;
    createdAt: number | null;
    updatedAt: number | null;
}

// Create file options
export interface CreateFileOptions {
    title: string;
    type: FileType;
    folderId?: string | null;
    app?: string | null;
    publicRead?: boolean;
    publicWrite?: boolean;
}

// Folder tree node for UI
export interface FolderTreeNode {
    folder: ClassifiedFolder;
    children: FolderTreeNode[];
    expanded: boolean;
}

// Admin-specific types
export interface AdminStats {
    totalDocuments: number;
    totalFolders: number;
    totalBlobs: number;
    totalSize: number;
    documentsByType: { yjs: number; blob: number };
    documentsByScope: { app: number; drive: number };
    deletedDocuments: number;
}

export interface User {
    username: string;
    is_admin?: boolean;
}

// API response for user list
export interface UserListResponse {
    users: User[];
}

// API response types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
