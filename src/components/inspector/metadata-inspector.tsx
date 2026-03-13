import { useState } from 'react';
import type { FileDescriptor, Folder, ConnectionConfig } from '@/types/storage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Save, Globe, Lock, Trash2, Loader2, Edit2, Copy, Check, FileText, FolderOpen, Hash, Link } from 'lucide-react';
import { useConnectionConfig, useFiles, useFolders } from '@/state/storage';
import { createServerApi } from '@/lib/server-api';
import { useToast } from '@/components/ui/use-toast';

interface MetadataInspectorProps {
    file?: FileDescriptor;
    folder?: Folder;
    onUpdate?: (item: FileDescriptor | Folder | undefined) => void;
}

function formatDate(date: string | number | null): string {
    if (!date) return 'N/A';
    try {
        const d = typeof date === 'number' ? new Date(date * 1000) : new Date(date);
        return d.toLocaleString();
    } catch {
        return 'Invalid Date';
    }
}

function formatBytes(bytes: number | null): string {
    if (bytes === null) return 'N/A';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function MetadataInspector({ file, folder, onUpdate }: MetadataInspectorProps) {
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(file?.title ?? folder?.name ?? '');
    const [loading, setLoading] = useState(false);
    const [connectionConfig] = useConnectionConfig();
    const [files, setFiles] = useFiles();
    const [folders, setFolders] = useFolders();
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const { toast } = useToast();

    const item = file || folder;
    const isFile = !!file;

    if (!item) return null;

    const copyToClipboard = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleSave = async () => {
        if (!title.trim()) return;
        
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.renameFile(item.id, title);
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
                toast({ title: 'File renamed', description: `Renamed to "${title}"` });
            } else {
                const updated = await api.renameFolder(item.id, title);
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
                toast({ title: 'Folder renamed', description: `Renamed to "${title}"` });
            }
            setEditing(false);
        } catch (error) {
            console.error('Failed to rename:', error);
            toast({ 
                title: 'Failed to rename', 
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        setTitle(file?.title ?? folder?.name ?? '');
        setEditing(false);
    };

    const handlePublicToggle = async (field: 'publicRead' | 'publicWrite', value: boolean) => {
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.setFilePublic(
                    item.id,
                    field === 'publicRead' ? value : item.publicRead,
                    field === 'publicWrite' ? value : item.publicWrite
                );
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
                toast({ title: 'Access updated' });
            } else {
                const updated = await api.setFolderPublic(
                    item.id,
                    field === 'publicRead' ? value : item.publicRead,
                    field === 'publicWrite' ? value : item.publicWrite
                );
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
                toast({ title: 'Access updated' });
            }
        } catch (error) {
            console.error('Failed to update access:', error);
            toast({
                title: 'Failed to update access',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 space-y-4">
            {/* Title/Name */}
            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    {isFile ? <FileText className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
                    {isFile ? 'Title' : 'Name'}
                </Label>
                {editing ? (
                    <div className="flex gap-2">
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={loading}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') handleCancel();
                            }}
                        />
                        <Button size="sm" onClick={handleSave} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancel} disabled={loading}>
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <div
                        className="text-sm p-2 bg-muted rounded cursor-pointer flex items-center justify-between group"
                        onClick={() => setEditing(true)}
                    >
                        <span className="truncate">{isFile ? file!.title : folder!.name}</span>
                        <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                )}
            </div>

            {/* ID */}
            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    ID
                </Label>
                <div className="text-sm p-2 bg-muted rounded font-mono text-xs break-all flex items-center justify-between gap-2">
                    <span className="break-all">{item.id}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={() => copyToClipboard(item.id, 'id')}
                    >
                        {copiedId === 'id' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                </div>
            </div>

            {/* Owner */}
            <div className="space-y-2">
                <Label>Owner</Label>
                <div className="text-sm p-2 bg-muted rounded flex items-center justify-between">
                    <span>{item.owner}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(item.owner, 'owner')}
                    >
                        {copiedId === 'owner' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                </div>
            </div>

            {/* Type badges */}
            {isFile && (
                <div className="space-y-2">
                    <Label>Type</Label>
                    <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline">{file!.type.toUpperCase()}</Badge>
                        <Badge variant="outline">{file!.scope}</Badge>
                        {file!.deleted && (
                            <Badge variant="destructive">
                                <Trash2 className="h-3 w-3 mr-1" />
                                Deleted
                            </Badge>
                        )}
                    </div>
                </div>
            )}

            {/* Room ID for YJS files */}
            {isFile && file!.type === 'yjs' && file!.roomId && (
                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        <Link className="h-4 w-4" />
                        Room ID
                    </Label>
                    <div className="text-sm p-2 bg-muted rounded font-mono text-xs break-all flex items-center justify-between gap-2">
                        <span className="break-all">{file!.roomId}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => copyToClipboard(file!.roomId!, 'room')}
                        >
                            {copiedId === 'room' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>
            )}

            {/* Blob Key for blob files */}
            {isFile && file!.type === 'blob' && file!.blobKey && (
                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        Blob Key
                    </Label>
                    <div className="text-sm p-2 bg-muted rounded font-mono text-xs break-all">
                        {file!.blobKey}
                    </div>
                </div>
            )}

            {/* Public Access Controls */}
            <div className="space-y-3 pt-2 border-t">
                <Label className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Public Access
                </Label>
                
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {item.publicRead ? (
                            <Globe className="h-4 w-4 text-green-600" />
                        ) : (
                            <Lock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm">Public Read</span>
                    </div>
                    <Switch
                        checked={item.publicRead}
                        onCheckedChange={(checked) => handlePublicToggle('publicRead', checked)}
                        disabled={loading}
                    />
                </div>
                
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {item.publicWrite ? (
                            <Globe className="h-4 w-4 text-green-600" />
                        ) : (
                            <Lock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm">Public Write</span>
                    </div>
                    <Switch
                        checked={item.publicWrite}
                        onCheckedChange={(checked) => handlePublicToggle('publicWrite', checked)}
                        disabled={loading}
                    />
                </div>
            </div>

            {/* File-specific metadata */}
            {isFile && (
                <>
                    {/* App */}
                    {file!.app && (
                        <div className="space-y-2">
                            <Label>App</Label>
                            <div className="text-sm p-2 bg-muted rounded">
                                {file!.app}
                            </div>
                        </div>
                    )}

                    {/* MIME Type */}
                    {file!.mimeType && (
                        <div className="space-y-2">
                            <Label>MIME Type</Label>
                            <div className="text-sm p-2 bg-muted rounded">
                                {file!.mimeType}
                            </div>
                        </div>
                    )}

                    {/* Size */}
                    <div className="space-y-2">
                        <Label>Size</Label>
                        <div className="text-sm p-2 bg-muted rounded">
                            {formatBytes(file!.size)}
                        </div>
                    </div>

                    {/* Filename */}
                    {file!.filename && (
                        <div className="space-y-2">
                            <Label>Filename</Label>
                            <div className="text-sm p-2 bg-muted rounded">
                                {file!.filename}
                            </div>
                        </div>
                    )}

                    {/* Folder */}
                    <div className="space-y-2">
                        <Label>Folder</Label>
                        <div className="text-sm p-2 bg-muted rounded font-mono text-xs">
                            {file!.folderId || 'Root'}
                        </div>
                    </div>
                    
                    {/* Parent Document (Attachment) */}
                    {file!.parentId && (
                        <div className="space-y-2">
                            <Label>Parent Document</Label>
                            <div className="text-sm p-2 bg-muted rounded font-mono text-xs">
                                {file!.parentId}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Folder-specific metadata */}
            {!isFile && folder && (
                <>
                    {/* Parent Folder */}
                    <div className="space-y-2">
                        <Label>Parent Folder</Label>
                        <div className="text-sm p-2 bg-muted rounded font-mono text-xs">
                            {folder.parentId || 'Root'}
                        </div>
                    </div>
                </>
            )}

            {/* Timestamps */}
            <div className="space-y-2 pt-2 border-t">
                <Label>Created</Label>
                <div className="text-sm p-2 bg-muted rounded">
                    {formatDate(item.createdAt)}
                </div>
            </div>

            <div className="space-y-2">
                <Label>Updated</Label>
                <div className="text-sm p-2 bg-muted rounded">
                    {formatDate(item.updatedAt)}
                </div>
            </div>
        </div>
    );
}