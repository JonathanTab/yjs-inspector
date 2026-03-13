import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type {
    FileDescriptor,
    ClassifiedFile,
    Folder,
    ClassifiedFolder,
    SyncState,
    ViewMode,
    SortOptions,
    FilterOptions,
    FolderTreeNode,
    ConnectionConfig,
    AdminStats,
    BrowserMode,
} from '@/types/storage';
import { configAtom } from './config';

// Connection config atom derived from main config
export const connectionConfigAtom = atom<ConnectionConfig>((get) => {
    const config = get(configAtom);
    return {
        baseUrl: config.documentManager.baseUrl,
        apiKey: config.documentManager.apiKey,
        wsUrl: config.documentManager.wsUrl,
        blobStorageUrl: config.documentManager.blobStorageUrl,
        adminMode: config.documentManager.adminMode,
        impersonateUser: config.documentManager.impersonateUser,
    };
});

// Files state
export const filesAtom = atom<FileDescriptor[]>([]);

// Folders state
export const foldersAtom = atom<Folder[]>([]);

// Selected file
export const selectedFileAtom = atom<FileDescriptor | null>(null);

// Selected folder
export const selectedFolderAtom = atom<Folder | null>(null);

// Sync state
export const syncStateAtom = atom<SyncState>({
    isSyncing: false,
    lastSyncTime: null,
    lastSyncError: null,
});

// View mode
export const viewModeAtom = atomWithStorage<ViewMode>('yjs-view-mode', 'drive');

// Sort options
export const sortOptionsAtom = atomWithStorage<SortOptions>('yjs-sort-options', {
    field: 'updatedAt',
    direction: 'desc',
});

// Filter options
export const filterOptionsAtom = atomWithStorage<FilterOptions>('yjs-filter-options', {
    search: '',
    owner: null,
    app: null,
    type: null,
    scope: null,
    publicOnly: false,
    showDeleted: false,
});

// Current user atom (set after connection)
export const currentUserAtom = atom<string | null>(null);

// Browser mode (tree/list for scope toggle)
export const browserModeAtom = atomWithStorage<BrowserMode>('yjs-browser-mode', 'tree');

// Admin stats atom
export const adminStatsAtom = atom<AdminStats | null>(null);

// Helper functions for extracting unique values
export function getUniqueOwners(files: FileDescriptor[]): string[] {
    const owners = new Set<string>();
    files.forEach((f) => owners.add(f.owner));
    return Array.from(owners).sort();
}

export function getUniqueApps(files: FileDescriptor[]): string[] {
    const apps = new Set<string>();
    files.forEach((f) => {
        if (f.app) apps.add(f.app);
    });
    return Array.from(apps).sort();
}

// Helper functions
export function classifyFile(file: FileDescriptor, username: string | null): ClassifiedFile {
    const owned = username ? file.owner === username : false;
    const shared = file.sharedWith.length > 0;
    const hasWritePerm = file.permissions?.includes('write') ?? false;
    const writable = hasWritePerm || file.publicWrite;

    return {
        ...file,
        owned,
        shared,
        writable,
    };
}

export function classifyFolder(folder: Folder, username: string | null): ClassifiedFolder {
    const owned = username ? folder.owner === username : false;
    const shared = folder.sharedWith.length > 0;
    const hasWritePerm = folder.permissions?.includes('write') ?? false;
    const writable = hasWritePerm || folder.publicWrite;

    return {
        ...folder,
        owned,
        shared,
        writable,
    };
}

// Build folder tree structure
export function buildFolderTree(folders: Folder[], username: string | null): FolderTreeNode[] {
    const classifiedFolders = folders.map((f) => classifyFolder(f, username));
    const folderMap = new Map<string, FolderTreeNode>();

    // Create nodes for all folders
    classifiedFolders.forEach((folder) => {
        folderMap.set(folder.id, {
            folder,
            children: [],
            expanded: false,
        });
    });

    // Build tree structure
    const rootNodes: FolderTreeNode[] = [];
    folderMap.forEach((node) => {
        if (node.folder.parentId) {
            const parent = folderMap.get(node.folder.parentId);
            if (parent) {
                parent.children.push(node);
            } else {
                // Parent not found, add to root
                rootNodes.push(node);
            }
        } else {
            rootNodes.push(node);
        }
    });

    return rootNodes;
}

// Filter files based on filter options
export function filterFiles(
    files: FileDescriptor[],
    filters: FilterOptions,
): FileDescriptor[] {
    return files.filter((file) => {
        // Filter by deleted status
        if (!filters.showDeleted && file.deleted) {
            return false;
        }

        // Filter by search
        if (filters.search) {
            const search = filters.search.toLowerCase();
            if (!file.title.toLowerCase().includes(search)) {
                return false;
            }
        }

        // Filter by owner
        if (filters.owner && file.owner !== filters.owner) {
            return false;
        }

        // Filter by app
        if (filters.app && file.app !== filters.app) {
            return false;
        }

        // Filter by type
        if (filters.type && file.type !== filters.type) {
            return false;
        }

        // Filter by scope
        if (filters.scope && file.scope !== filters.scope) {
            return false;
        }

        // Filter by public only
        if (filters.publicOnly && !file.publicRead) {
            return false;
        }

        return true;
    });
}

// Helper to parse date strings or numbers into timestamps
function parseDate(date: string | number | null): number {
    if (date === null) return 0;
    if (typeof date === 'number') return date;
    return new Date(date).getTime() || 0;
}

// Sort files based on sort options
export function sortFiles(files: FileDescriptor[], options: SortOptions): FileDescriptor[] {
    const sorted = [...files].sort((a, b) => {
        let comparison = 0;

        switch (options.field) {
            case 'title':
                comparison = a.title.localeCompare(b.title);
                break;
            case 'owner':
                comparison = a.owner.localeCompare(b.owner);
                break;
            case 'updatedAt':
                comparison = parseDate(a.updatedAt) - parseDate(b.updatedAt);
                break;
            case 'createdAt':
                comparison = parseDate(a.createdAt) - parseDate(b.createdAt);
                break;
            case 'size':
                comparison = (a.size ?? 0) - (b.size ?? 0);
                break;
        }

        return options.direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
}

// Get files in a specific folder
export function getFilesInFolder(files: FileDescriptor[], folderId: string | null): FileDescriptor[] {
    return files.filter((file) => file.folderId === folderId);
}

// Get subfolders of a folder
export function getSubfolders(folders: Folder[], parentId: string | null): Folder[] {
    return folders.filter((folder) => folder.parentId === parentId);
}

// Hooks for convenience
export const useFiles = () => useAtom(filesAtom);
export const useFolders = () => useAtom(foldersAtom);
export const useSelectedFile = () => useAtom(selectedFileAtom);
export const useSelectedFolder = () => useAtom(selectedFolderAtom);
export const useSyncState = () => useAtom(syncStateAtom);
export const useViewMode = () => useAtom(viewModeAtom);
export const useFilterOptions = () => useAtom(filterOptionsAtom);
export const useSortOptions = () => useAtom(sortOptionsAtom);
export const useCurrentUser = () => useAtom(currentUserAtom);
export const useConnectionConfig = () => useAtom(connectionConfigAtom);
export const useBrowserMode = () => useAtom(browserModeAtom);
export const useAdminStats = () => useAtom(adminStatsAtom);
