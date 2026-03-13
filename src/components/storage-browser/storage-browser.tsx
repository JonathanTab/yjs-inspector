import { useCallback, useEffect, useState } from 'react';
import { createServerApi } from '@/lib/server-api';
import {
    useConnectionConfig,
    useFiles,
    useFolders,
    useSyncState,
    useCurrentUser,
    useBrowserMode,
    sortFiles,
    getUniqueOwners,
} from '@/state/storage';
import type { FileDescriptor, Folder, ConnectionConfig, FileType, StorageScope } from '@/types/storage';
import { FolderTree } from './folder-tree';
import { FileList } from './file-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
    RefreshCw,
    Plus,
    FolderPlus,
    FileText,
    Grid,
    List,
    ChevronDown,
    Loader2,
    Filter,
} from 'lucide-react';
import { ScopeToggle, AppList } from '@/components/browser';
import { Badge } from '@/components/ui/badge';
import { useConfig } from '@/state';
import { CreateFileDialog } from '@/components/dialogs/create-file-dialog';
import { useToast } from '@/components/ui/use-toast';

interface StorageBrowserProps {
    onSelectFile: (file: FileDescriptor) => void;
    onSelectFolder?: (folder: Folder) => void;
    connectedFileId?: string | null;
    onRefresh?: () => void;
}

export function StorageBrowser({ onSelectFile, onSelectFolder, connectedFileId, onRefresh }: StorageBrowserProps) {
    const [connectionConfig] = useConnectionConfig();
    const [files, setFiles] = useFiles();
    const [folders, setFolders] = useFolders();
    const [syncState, setSyncState] = useSyncState();
    const [currentUser, setCurrentUser] = useCurrentUser();
    const [browserMode] = useBrowserMode();
    const [config] = useConfig();
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewType, setViewType] = useState<'grid' | 'list'>('list');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
    const { toast } = useToast();
    
    // Filter state
    const [filterType, setFilterType] = useState<FileType | null>(null);
    const [filterScope, setFilterScope] = useState<StorageScope | null>(null);
    const [filterOwner, setFilterOwner] = useState<string | null>(null);
    const [showDeleted, setShowDeleted] = useState(false);
    const [filterOwnership, setFilterOwnership] = useState<'all' | 'owned' | 'shared'>('all');

    // Get unique values for filters
    const uniqueOwners = getUniqueOwners(files);

    // Sync files and folders from server
    const sync = useCallback(async () => {
        if (!connectionConfig.apiKey) {
            return;
        }

        setSyncState((prev) => ({ ...prev, isSyncing: true, lastSyncError: null }));

        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            const result = await api.fullSync();
            setFiles(result.documents);
            setFolders(result.folders);
            setSyncState({
                isSyncing: false,
                lastSyncTime: new Date(),
                lastSyncError: null,
            });
        } catch (error) {
            setSyncState((prev) => ({
                ...prev,
                isSyncing: false,
                lastSyncError: error instanceof Error ? error : new Error('Sync failed'),
            }));
        }
    }, [connectionConfig, setFiles, setFolders, setSyncState]);

    // Initial sync when connected
    useEffect(() => {
        if (connectionConfig.apiKey && files.length === 0) {
            sync();
        }
    }, [connectionConfig.apiKey, files.length, sync]);

    // Set current user - use impersonateUser when impersonating
    useEffect(() => {
        if (connectionConfig.apiKey) {
            // When impersonating, use the impersonated user
            if (config.documentManager.impersonateUser && currentUser !== config.documentManager.impersonateUser) {
                setCurrentUser(config.documentManager.impersonateUser);
            } else if (!currentUser && !config.documentManager.impersonateUser && files.length > 0) {
                // Otherwise, try to get from files (simplified - would normally come from auth)
                setCurrentUser(files[0].owner);
            }
        }
    }, [connectionConfig.apiKey, currentUser, files, setCurrentUser, config.documentManager.impersonateUser]);

    // Filter and sort files based on current view
    const getFilteredFiles = useCallback(() => {
        let filteredFiles = files;

        // Filter by deleted status
        if (!showDeleted) {
            filteredFiles = filteredFiles.filter((f) => !f.deleted);
        }

        // Filter by folder if in drive/tree view
        // Empty string selectedFolderId means root folder (files with folderId: null)
        if (browserMode === 'tree' && selectedFolderId !== null && selectedFolderId !== '') {
            filteredFiles = filteredFiles.filter((f) => f.folderId === selectedFolderId);
        }
        // When selectedFolderId is '', show files in root (folderId: null)
        if (browserMode === 'tree' && selectedFolderId === '') {
            filteredFiles = filteredFiles.filter((f) => f.folderId === null);
        }

        // Filter by search query
        if (searchQuery) {
            filteredFiles = filteredFiles.filter((f) =>
                f.title.toLowerCase().includes(searchQuery.toLowerCase()),
            );
        }

        // Filter by type
        if (filterType) {
            filteredFiles = filteredFiles.filter((f) => f.type === filterType);
        }

        // Filter by scope
        if (filterScope) {
            filteredFiles = filteredFiles.filter((f) => f.scope === filterScope);
        }

        // Filter by owner
        if (filterOwner) {
            filteredFiles = filteredFiles.filter((f) => f.owner === filterOwner);
        }

        // Filter by ownership (owned by me vs shared with me)
        if (filterOwnership !== 'all' && currentUser) {
            if (filterOwnership === 'owned') {
                filteredFiles = filteredFiles.filter((f) => f.owner === currentUser);
            } else if (filterOwnership === 'shared') {
                // Shared with me: not owned by me but has me in sharedWith
                filteredFiles = filteredFiles.filter(
                    (f) => f.owner !== currentUser && f.sharedWith.some((s) => s.username === currentUser)
                );
            }
        }

        return sortFiles(filteredFiles, { field: 'updatedAt', direction: 'desc' });
    }, [files, browserMode, selectedFolderId, searchQuery, filterType, filterScope, filterOwner, showDeleted, filterOwnership, currentUser]);

    const displayFiles = getFilteredFiles();

    const handleSelectFolder = useCallback((folder: Folder) => {
        setSelectedFolderId(folder.id);
        onSelectFolder?.(folder);
    }, [onSelectFolder]);

    const handleCreateFolder = useCallback(async (name: string) => {
        if (!name.trim()) return;

        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            const newFolder = await api.createFolder(name, selectedFolderId);
            setFolders([...folders, newFolder]);
            toast({ title: 'Folder created', description: `Created "${name}"` });
        } catch (error) {
            console.error('Failed to create folder:', error);
            toast({
                title: 'Failed to create folder',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        }
    }, [connectionConfig, selectedFolderId, folders, setFolders, toast]);

    const handleCreateFile = useCallback(async (title: string, type: FileType) => {
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            const newFile = await api.createFile({ title, type, folderId: selectedFolderId });
            setFiles([...files, newFile]);
            toast({ title: 'Document created', description: `Created "${title}"` });
        } catch (error) {
            console.error('Failed to create file:', error);
            toast({
                title: 'Failed to create document',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        }
    }, [connectionConfig, selectedFolderId, files, setFiles, toast]);

    const handleRefresh = useCallback(() => {
        if (onRefresh) {
            onRefresh();
        } else {
            sync();
        }
    }, [onRefresh, sync]);

    const clearFilters = () => {
        setFilterType(null);
        setFilterScope(null);
        setFilterOwner(null);
        setShowDeleted(false);
        setSearchQuery('');
        setFilterOwnership('all');
    };

    const hasActiveFilters = filterType || filterScope || filterOwner || showDeleted || searchQuery || filterOwnership !== 'all';

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b p-2">
                {/* Scope Toggle */}
                <ScopeToggle />

                <div className="relative flex-1">
                    <Input
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pr-8"
                    />
                </div>

                {/* Filter Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className={hasActiveFilters ? 'bg-primary/10' : ''}>
                            <Filter className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuCheckboxItem
                            checked={showDeleted}
                            onCheckedChange={setShowDeleted}
                        >
                            Show Deleted
                        </DropdownMenuCheckboxItem>
                        
                        <DropdownMenuSeparator />
                        
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            Ownership
                        </div>
                        <DropdownMenuCheckboxItem
                            checked={filterOwnership === 'all'}
                            onCheckedChange={() => setFilterOwnership('all')}
                        >
                            All Files
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={filterOwnership === 'owned'}
                            onCheckedChange={() => setFilterOwnership('owned')}
                        >
                            Owned by Me
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={filterOwnership === 'shared'}
                            onCheckedChange={() => setFilterOwnership('shared')}
                        >
                            Shared with Me
                        </DropdownMenuCheckboxItem>
                        
                        <DropdownMenuSeparator />
                        
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            Type
                        </div>
                        <DropdownMenuCheckboxItem
                            checked={filterType === null}
                            onCheckedChange={() => setFilterType(null)}
                        >
                            All Types
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={filterType === 'yjs'}
                            onCheckedChange={() => setFilterType('yjs')}
                        >
                            Yjs Documents
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={filterType === 'blob'}
                            onCheckedChange={() => setFilterType('blob')}
                        >
                            Blobs
                        </DropdownMenuCheckboxItem>
                        
                        <DropdownMenuSeparator />
                        
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            Scope
                        </div>
                        <DropdownMenuCheckboxItem
                            checked={filterScope === null}
                            onCheckedChange={() => setFilterScope(null)}
                        >
                            All Scopes
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={filterScope === 'drive'}
                            onCheckedChange={() => setFilterScope('drive')}
                        >
                            Drive
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={filterScope === 'app'}
                            onCheckedChange={() => setFilterScope('app')}
                        >
                            App
                        </DropdownMenuCheckboxItem>
                        
                        {uniqueOwners.length > 0 && (
                            <>
                                <DropdownMenuSeparator />
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                    Owner
                                </div>
                                <DropdownMenuCheckboxItem
                                    checked={filterOwner === null}
                                    onCheckedChange={() => setFilterOwner(null)}
                                >
                                    All Owners
                                </DropdownMenuCheckboxItem>
                                {uniqueOwners.slice(0, 10).map((owner) => (
                                    <DropdownMenuCheckboxItem
                                        key={owner}
                                        checked={filterOwner === owner}
                                        onCheckedChange={() => setFilterOwner(owner)}
                                    >
                                        {owner}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </>
                        )}
                        
                        {hasActiveFilters && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={clearFilters}>
                                    Clear All Filters
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRefresh}
                    disabled={syncState.isSyncing}
                >
                    {syncState.isSyncing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                            <Plus className="mr-1 h-4 w-4" />
                            New
                            <ChevronDown className="ml-1 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
                            <FileText className="mr-2 h-4 w-4" />
                            New Document
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setCreateFolderDialogOpen(true)}>
                            <FolderPlus className="mr-2 h-4 w-4" />
                            New Folder
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex items-center border-l pl-2">
                    <Button
                        variant={viewType === 'list' ? 'default' : 'ghost'}
                        size="icon"
                        onClick={() => setViewType('list')}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewType === 'grid' ? 'default' : 'ghost'}
                        size="icon"
                        onClick={() => setViewType('grid')}
                    >
                        <Grid className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Impersonation Banner */}
            {config.documentManager.impersonateUser && (
                <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-sm">
                    <span>Viewing as:</span>
                    <Badge variant="outline">{config.documentManager.impersonateUser}</Badge>
                </div>
            )}

            {/* Active Filters Display */}
            {hasActiveFilters && (
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 text-sm">
                    <span className="text-muted-foreground">Filters:</span>
                    {filterOwnership === 'owned' && <Badge variant="secondary">Owned by Me</Badge>}
                    {filterOwnership === 'shared' && <Badge variant="secondary">Shared with Me</Badge>}
                    {filterType && <Badge variant="secondary">{filterType}</Badge>}
                    {filterScope && <Badge variant="secondary">{filterScope}</Badge>}
                    {filterOwner && <Badge variant="secondary">{filterOwner}</Badge>}
                    {showDeleted && <Badge variant="secondary">deleted</Badge>}
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2">
                        Clear
                    </Button>
                </div>
            )}

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar with folder tree - only in tree mode */}
                {browserMode === 'tree' && (
                    <div className="w-64 border-r overflow-auto">
                        <FolderTree
                            folders={folders}
                            selectedFolderId={selectedFolderId}
                            onSelectFolder={handleSelectFolder}
                        />
                    </div>
                )}

                {/* File list or App List */}
                <div className="flex-1 overflow-auto">
                    {browserMode === 'list' ? (
                        <AppList
                            files={displayFiles}
                            onSelectFile={onSelectFile}
                            connectedFileId={connectedFileId}
                        />
                    ) : (
                        <FileList
                            files={displayFiles}
                            viewType={viewType}
                            onSelectFile={onSelectFile}
                            loading={syncState.isSyncing}
                            connectedFileId={connectedFileId}
                        />
                    )}
                </div>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between border-t px-2 py-1 text-xs text-muted-foreground">
                <span>
                    {displayFiles.length} item{displayFiles.length !== 1 ? 's' : ''}
                    {syncState.lastSyncTime && (
                        <span>
                            {' '}
                            • Last synced:{' '}
                            {syncState.lastSyncTime.toLocaleTimeString()}
                        </span>
                    )}
                    {config.documentManager.impersonateUser && (
                        <span>
                            {' '}
                            • Impersonating: {config.documentManager.impersonateUser}
                        </span>
                    )}
                </span>
                {syncState.lastSyncError && (
                    <span className="text-destructive">
                        Error: {syncState.lastSyncError.message}
                    </span>
                )}
            </div>

            {/* Create File Dialog */}
            <CreateFileDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onCreateFile={handleCreateFile}
            />

            {/* Create Folder Dialog */}
            {createFolderDialogOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-background p-6 rounded-lg shadow-lg w-80">
                        <h3 className="text-lg font-semibold mb-4">Create Folder</h3>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const name = (form.elements.namedItem('name') as HTMLInputElement).value;
                            handleCreateFolder(name);
                            setCreateFolderDialogOpen(false);
                        }}>
                            <Input
                                name="name"
                                placeholder="Folder name"
                                autoFocus
                                className="mb-4"
                            />
                            <div className="flex justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCreateFolderDialogOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit">Create</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}