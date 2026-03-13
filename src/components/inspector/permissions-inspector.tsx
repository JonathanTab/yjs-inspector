import { useState, useEffect } from 'react';
import type { FileDescriptor, Folder, Permission, ConnectionConfig } from '@/types/storage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Globe, Users, Plus, X, Check, Loader2, UserPlus } from 'lucide-react';
import { useConnectionConfig, useFiles, useFolders } from '@/state/storage';
import { createServerApi } from '@/lib/server-api';
import { useToast } from '@/components/ui/use-toast';

interface PermissionsInspectorProps {
    file?: FileDescriptor;
    folder?: Folder;
    onUpdate?: (item: FileDescriptor | Folder | undefined) => void;
}

export function PermissionsInspector({ file, folder, onUpdate }: PermissionsInspectorProps) {
    const [newUsername, setNewUsername] = useState('');
    const [newPermissions, setNewPermissions] = useState<Permission[]>(['read']);
    const [loading, setLoading] = useState(false);
    const [userSearch, setUserSearch] = useState('');
    const [availableUsers, setAvailableUsers] = useState<Array<{ username: string; displayName?: string }>>([]);
    const [showUserSuggestions, setShowUserSuggestions] = useState(false);
    const [connectionConfig] = useConnectionConfig();
    const [files, setFiles] = useFiles();
    const [folders, setFolders] = useFolders();
    const { toast } = useToast();

    const item = file || folder;
    const isFile = !!file;

    // Load available users
    useEffect(() => {
        const loadUsers = async () => {
            if (!connectionConfig.apiKey) return;
            try {
                const api = createServerApi(connectionConfig as ConnectionConfig);
                const users = await api.getUsers();
                setAvailableUsers(users.map(u => ({ username: u.username, displayName: u.username })));
            } catch (error) {
                console.error('Failed to load users:', error);
            }
        };
        loadUsers();
    }, [connectionConfig]);

    if (!item) return null;

    const filteredUsers = availableUsers.filter(u => 
        u.username.toLowerCase().includes(userSearch.toLowerCase()) &&
        !item.sharedWith.some(s => s.username === u.username)
    );

    const handleTogglePublicRead = async (checked: boolean) => {
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.setFilePublic(item.id, checked, item.publicWrite);
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
            } else {
                const updated = await api.setFolderPublic(item.id, checked, item.publicWrite);
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
            }
            toast({ title: 'Public read updated' });
        } catch (error) {
            console.error('Failed to update public read:', error);
            toast({
                title: 'Failed to update',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleTogglePublicWrite = async (checked: boolean) => {
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.setFilePublic(item.id, item.publicRead, checked);
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
            } else {
                const updated = await api.setFolderPublic(item.id, item.publicRead, checked);
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
            }
            toast({ title: 'Public write updated' });
        } catch (error) {
            console.error('Failed to update public write:', error);
            toast({
                title: 'Failed to update',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleAddShare = async () => {
        if (!newUsername.trim()) return;
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.shareFile(item.id, newUsername.trim(), newPermissions);
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
            } else {
                const updated = await api.shareFolder(item.id, newUsername.trim(), newPermissions);
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
            }
            toast({ title: 'Share added', description: `Shared with ${newUsername}` });
            setNewUsername('');
            setNewPermissions(['read']);
            setShowUserSuggestions(false);
        } catch (error) {
            console.error('Failed to add share:', error);
            toast({
                title: 'Failed to add share',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePermissions = async (username: string, permissions: Permission[]) => {
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.shareFile(item.id, username, permissions);
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
            } else {
                const updated = await api.shareFolder(item.id, username, permissions);
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
            }
            toast({ title: 'Permissions updated' });
        } catch (error) {
            console.error('Failed to update permissions:', error);
            toast({
                title: 'Failed to update permissions',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveShare = async (username: string) => {
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.revokeFile(item.id, username);
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
            } else {
                const updated = await api.revokeFolder(item.id, username);
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
            }
            toast({ title: 'Share removed', description: `Removed access for ${username}` });
        } catch (error) {
            console.error('Failed to remove share:', error);
            toast({
                title: 'Failed to remove share',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const togglePermission = (perm: Permission) => {
        if (newPermissions.includes(perm)) {
            setNewPermissions(newPermissions.filter(p => p !== perm));
        } else {
            setNewPermissions([...newPermissions, perm]);
        }
    };

    return (
        <div className="p-4 space-y-6">
            {/* Public Access */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <Label className="text-base">Public Access</Label>
                </div>

                <div className="flex items-center justify-between pl-6">
                    <div className="space-y-0.5">
                        <Label className="text-sm">Public Read</Label>
                        <p className="text-xs text-muted-foreground">
                            Anyone can view this {isFile ? 'file' : 'folder'}
                        </p>
                    </div>
                    <Switch
                        checked={item.publicRead}
                        onCheckedChange={handleTogglePublicRead}
                        disabled={loading}
                    />
                </div>

                <div className="flex items-center justify-between pl-6">
                    <div className="space-y-0.5">
                        <Label className="text-sm">Public Write</Label>
                        <p className="text-xs text-muted-foreground">
                            Anyone can edit this {isFile ? 'file' : 'folder'}
                        </p>
                    </div>
                    <Switch
                        checked={item.publicWrite}
                        onCheckedChange={handleTogglePublicWrite}
                        disabled={loading}
                    />
                </div>
            </div>

            {/* Shared With */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <Label className="text-base">Shared With</Label>
                    <Badge variant="outline" className="ml-auto">
                        {item.sharedWith.length}
                    </Badge>
                </div>

                {/* Existing shares */}
                <div className="space-y-2 pl-6">
                    {item.sharedWith.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                            Not shared with anyone
                        </p>
                    ) : (
                        item.sharedWith.map((share) => (
                            <div
                                key={share.username}
                                className="flex items-center justify-between p-2 bg-muted rounded"
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-sm font-medium truncate">{share.username}</span>
                                    <div className="flex gap-1">
                                        <Button
                                            variant={share.permissions.includes('read') ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => {
                                                const perms = share.permissions.includes('read')
                                                    ? share.permissions.filter((p): p is Permission => p !== 'read')
                                                    : [...share.permissions, 'read'] as Permission[];
                                                handleUpdatePermissions(share.username, perms.length > 0 ? perms : ['read']);
                                            }}
                                            disabled={loading}
                                        >
                                            Read
                                        </Button>
                                        <Button
                                            variant={share.permissions.includes('write') ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => {
                                                const perms = share.permissions.includes('write')
                                                    ? share.permissions.filter((p): p is Permission => p !== 'write')
                                                    : [...share.permissions, 'write'] as Permission[];
                                                handleUpdatePermissions(share.username, perms);
                                            }}
                                            disabled={loading}
                                        >
                                            Write
                                        </Button>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 flex-shrink-0"
                                    onClick={() => handleRemoveShare(share.username)}
                                    disabled={loading}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>

                {/* Add new share */}
                <div className="space-y-2 pl-6">
                    <div className="relative">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    placeholder="Username"
                                    value={newUsername}
                                    onChange={(e) => {
                                        setNewUsername(e.target.value);
                                        setUserSearch(e.target.value);
                                        setShowUserSuggestions(true);
                                    }}
                                    onFocus={() => setShowUserSuggestions(true)}
                                    disabled={loading}
                                />
                                {showUserSuggestions && filteredUsers.length > 0 && (
                                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-auto">
                                        {filteredUsers.slice(0, 5).map((user) => (
                                            <button
                                                key={user.username}
                                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                                                onClick={() => {
                                                    setNewUsername(user.username);
                                                    setShowUserSuggestions(false);
                                                }}
                                            >
                                                <UserPlus className="h-3 w-3" />
                                                {user.displayName || user.username}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-muted-foreground">Permissions:</span>
                            <Button
                                variant={newPermissions.includes('read') ? 'default' : 'outline'}
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => togglePermission('read')}
                                disabled={loading}
                            >
                                Read
                            </Button>
                            <Button
                                variant={newPermissions.includes('write') ? 'default' : 'outline'}
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => togglePermission('write')}
                                disabled={loading}
                            >
                                Write
                            </Button>
                            <div className="flex-1" />
                            <Button
                                size="sm"
                                onClick={handleAddShare}
                                disabled={!newUsername.trim() || loading}
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Owner Info */}
            <div className="space-y-4 pt-2 border-t">
                <Label className="text-base">Owner</Label>
                <div className="flex items-center gap-2 pl-6">
                    <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" />
                        {item.owner}
                    </Badge>
                    <span className="text-xs text-muted-foreground">(full access)</span>
                </div>
            </div>
        </div>
    );
}