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
    viewAs?: string;
    adminAll?: boolean;
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
    // Extended fields from backend admin_stats endpoint
    uniqueOwners?: number;
    totalShares?: number;
    totalFolderShares?: number;
    totalUsers?: number;
    totalDeleted?: number;
}

// Fields that can be updated via admin_update
export interface AdminFileUpdate {
    title?: string;
    owner?: string;
    type?: 'yjs' | 'blob';
    scope?: 'drive' | 'app';
    app?: string | null;
    folder_id?: string | null;
    parent_id?: string | null;
    room_id?: string | null;
    blob_key?: string | null;
    public_read?: boolean;
    public_write?: boolean;
}

export interface AdminFolderUpdate {
    name?: string;
    owner?: string;
    public_read?: boolean;
    public_write?: boolean;
}

// ---------------------------------------------------------------------------
// Yjs server live stats (from the yjs-server HTTP API: /api/stats, /api/room/:id/stats)
// ---------------------------------------------------------------------------

// Per-room live metrics summary (one in-memory room on the yjs server)
export interface YjsRoomSummary {
    roomId: string;
    fileId: string | null;
    appType: string | null;
    connections: number;            // current open WS connections to this room
    users: string[];                // unique connected usernames
    userCount: number;
    awarenessStates: number;        // realtime presence entries
    stateSize: number;              // in-memory logical state size (bytes)
    wireBytesIn: number;            // bytes received over the wire for this room
    wireBytesOut: number;           // bytes sent over the wire for this room
    messagesIn: number;
    messagesOut: number;
    connectionsOpened: number;      // cumulative connections since the room loaded
    createdAt: number;              // ms epoch the room loaded into memory
    lastActivityAt: number;         // ms epoch of last inbound message
}

// Server-wide metrics block from GET /api/stats
export interface YjsServerMetrics {
    startedAt: number;
    uptimeMs: number;
    activeRooms: number;            // rooms currently loaded in memory
    totalConnections: number;       // sum of open connections across all rooms
    uniqueUsers: number;            // distinct connected usernames server-wide
    wireBytesIn: number;
    wireBytesOut: number;
    messagesIn: number;
    messagesOut: number;
    connectionsOpened: number;      // cumulative since boot
    connectionsClosed: number;      // cumulative since boot
    onDiskDocCount: number | null;  // documents persisted in LevelDB
    gcEnabled: boolean;
}

export interface YjsServerStats {
    server: YjsServerMetrics;
    rooms: YjsRoomSummary[];
}

// Optional scheduler debug info attached to a room-detail response
export interface YjsSchedulerStats {
    dirty: boolean;
    sessionChanges: number;
    userCount: number;
    idleTimeout: string;
    burstCap: string;
    sessionLength: string;
    timeSinceSnapshot: string;
}

// GET /api/room/:roomId/stats — per-document detail incl. persisted on-disk size
export interface YjsRoomStats {
    roomId: string;
    loaded: boolean;                // whether the room is currently in memory
    onDiskSize: number | null;      // persisted LevelDB size in bytes
    live: YjsRoomSummary | null;    // live metrics (null if not loaded)
    scheduler: YjsSchedulerStats | null;
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
