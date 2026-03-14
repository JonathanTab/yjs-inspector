import { useState } from 'react';
import type { FileDescriptor, Folder, ConnectionConfig, AdminFileUpdate, AdminFolderUpdate } from '@/types/storage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    Save, Globe, Lock, Trash2, Loader2, Edit2, Copy, Check,
    FileText, FolderOpen, Hash, Link, RotateCcw, AlertTriangle,
    Settings2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useConnectionConfig, useFiles, useFolders } from '@/state/storage';
import { createServerApi } from '@/lib/server-api';
import { useToast } from '@/components/ui/use-toast';
import { useConfig } from '@/state';

interface MetadataInspectorProps {
    file?: FileDescriptor;
    folder?: Folder;
    onUpdate?: (item: FileDescriptor | Folder | undefined) => void;
    onDelete?: (id: string) => void;
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
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function CopyField({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="text-sm p-2 bg-muted rounded font-mono text-xs break-all flex items-center justify-between gap-2">
            <span className="break-all">{value}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={copy} title={`Copy ${label}`}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
        </div>
    );
}

export function MetadataInspector({ file, folder, onUpdate, onDelete }: MetadataInspectorProps) {
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(file?.title ?? folder?.name ?? '');
    const [loading, setLoading] = useState(false);
    const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
    const [showAdminEdit, setShowAdminEdit] = useState(false);
    const [adminFields, setAdminFields] = useState<AdminFileUpdate & AdminFolderUpdate>({});
    const [connectionConfig] = useConnectionConfig();
    const [config] = useConfig();
    const [files, setFiles] = useFiles();
    const [folders, setFolders] = useFolders();
    const { toast } = useToast();

    const item = file || folder;
    const isFile = !!file;
    const isAdmin = config.documentManager.adminMode;

    if (!item) return null;

    const handleSave = async () => {
        if (!title.trim()) return;
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.renameFile(item.id, title);
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
                toast({ title: 'File renamed', description: `"${title}"` });
            } else {
                const updated = await api.renameFolder(item.id, title);
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
                toast({ title: 'Folder renamed', description: `"${title}"` });
            }
            setEditing(false);
        } catch (error) {
            toast({ title: 'Failed to rename', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handlePublicToggle = async (field: 'publicRead' | 'publicWrite', value: boolean) => {
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.setFilePublic(
                    item.id,
                    field === 'publicRead' ? value : item.publicRead,
                    field === 'publicWrite' ? value : item.publicWrite,
                );
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
            } else {
                const updated = await api.setFolderPublic(
                    item.id,
                    field === 'publicRead' ? value : item.publicRead,
                    field === 'publicWrite' ? value : item.publicWrite,
                );
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
            }
            toast({ title: 'Access updated' });
        } catch (error) {
            toast({ title: 'Failed to update access', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!isFile) return;
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            await api.deleteFile(item.id);
            const updated: FileDescriptor = { ...file!, deleted: true };
            onUpdate?.(updated);
            setFiles(files.map(f => f.id === item.id ? updated : f));
            toast({ title: 'File deleted (soft)', description: 'Can be restored from Deleted view' });
        } catch (error) {
            toast({ title: 'Failed to delete', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!isFile) return;
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            const updated = await api.restoreFile(item.id);
            onUpdate?.(updated);
            setFiles(files.map(f => f.id === updated.id ? updated : f));
            toast({ title: 'File restored' });
        } catch (error) {
            toast({ title: 'Failed to restore', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handlePermanentDelete = async () => {
        if (!isFile) return;
        if (!confirmPermanentDelete) {
            setConfirmPermanentDelete(true);
            return;
        }
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            await api.permanentDeleteFile(item.id);
            onDelete?.(item.id);
            setFiles(files.filter(f => f.id !== item.id));
            toast({ title: 'File permanently deleted' });
        } catch (error) {
            toast({ title: 'Failed to permanently delete', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
        } finally {
            setLoading(false);
            setConfirmPermanentDelete(false);
        }
    };

    const handleAdminSave = async () => {
        if (Object.keys(adminFields).length === 0) return;
        setLoading(true);
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            if (isFile) {
                const updated = await api.adminUpdateFile(item.id, adminFields as AdminFileUpdate);
                onUpdate?.(updated);
                setFiles(files.map(f => f.id === updated.id ? updated : f));
            } else {
                const updated = await api.adminUpdateFolder(item.id, adminFields as AdminFolderUpdate);
                onUpdate?.(updated);
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
            }
            toast({ title: 'Admin update applied' });
            setAdminFields({});
            setShowAdminEdit(false);
        } catch (error) {
            toast({ title: 'Admin update failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 space-y-4">
            {/* Deleted banner */}
            {isFile && file!.deleted && (
                <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                    <Trash2 className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">This file is soft-deleted</span>
                    <Button size="sm" variant="outline" onClick={handleRestore} disabled={loading} className="h-6 px-2 text-xs">
                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                        Restore
                    </Button>
                </div>
            )}

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
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setTitle(file?.title ?? folder?.name ?? ''); setEditing(false); } }}
                        />
                        <Button size="sm" onClick={handleSave} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setTitle(file?.title ?? folder?.name ?? ''); setEditing(false); }} disabled={loading}>
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <div
                        className="text-sm p-2 bg-muted rounded cursor-pointer flex items-center justify-between group"
                        onClick={() => setEditing(true)}
                    >
                        <span className={`truncate ${isFile && file!.deleted ? 'line-through opacity-60' : ''}`}>
                            {isFile ? file!.title : folder!.name}
                        </span>
                        <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                )}
            </div>

            {/* ID */}
            <div className="space-y-1.5">
                <Label className="flex items-center gap-2"><Hash className="h-4 w-4" />ID</Label>
                <CopyField value={item.id} label="ID" />
            </div>

            {/* Owner */}
            <div className="space-y-1.5">
                <Label>Owner</Label>
                <CopyField value={item.owner} label="owner" />
            </div>

            {/* Type badges */}
            {isFile && (
                <div className="space-y-1.5">
                    <Label>Type</Label>
                    <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline">{file!.type.toUpperCase()}</Badge>
                        <Badge variant="outline">{file!.scope}</Badge>
                        {file!.app && <Badge variant="secondary">{file!.app}</Badge>}
                        {file!.deleted && <Badge variant="destructive"><Trash2 className="h-3 w-3 mr-1" />Deleted</Badge>}
                        {file!.parentId && <Badge variant="outline">Attachment</Badge>}
                    </div>
                </div>
            )}

            {/* Room ID */}
            {isFile && file!.type === 'yjs' && file!.roomId && (
                <div className="space-y-1.5">
                    <Label className="flex items-center gap-2"><Link className="h-4 w-4" />Room ID</Label>
                    <CopyField value={file!.roomId} label="room ID" />
                </div>
            )}

            {/* Blob Key */}
            {isFile && file!.type === 'blob' && file!.blobKey && (
                <div className="space-y-1.5">
                    <Label className="flex items-center gap-2"><Hash className="h-4 w-4" />Blob Key</Label>
                    <CopyField value={file!.blobKey} label="blob key" />
                </div>
            )}

            {/* File metadata */}
            {isFile && (
                <div className="space-y-2">
                    {file!.mimeType && (
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">MIME Type</span>
                            <span className="font-mono text-xs">{file!.mimeType}</span>
                        </div>
                    )}
                    {file!.size !== null && (
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Size</span>
                            <span>{formatBytes(file!.size)}</span>
                        </div>
                    )}
                    {file!.filename && (
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Filename</span>
                            <span className="font-mono text-xs truncate max-w-[160px]">{file!.filename}</span>
                        </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Folder</span>
                        <span className="font-mono text-xs">{file!.folderId || 'Root'}</span>
                    </div>
                    {file!.parentId && (
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Parent Doc</span>
                            <span className="font-mono text-xs truncate max-w-[160px]">{file!.parentId}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Folder metadata */}
            {!isFile && folder && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Parent Folder</span>
                    <span className="font-mono text-xs">{folder.parentId || 'Root'}</span>
                </div>
            )}

            {/* Timestamps */}
            <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span>{formatDate(item.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Updated</span>
                    <span>{formatDate(item.updatedAt)}</span>
                </div>
            </div>

            {/* Public Access Controls */}
            <div className="space-y-3 pt-2 border-t">
                <Label className="flex items-center gap-2"><Globe className="h-4 w-4" />Public Access</Label>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {item.publicRead ? <Globe className="h-4 w-4 text-green-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm">Public Read</span>
                    </div>
                    <Switch checked={item.publicRead} onCheckedChange={(v) => handlePublicToggle('publicRead', v)} disabled={loading} />
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {item.publicWrite ? <Globe className="h-4 w-4 text-green-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm">Public Write</span>
                    </div>
                    <Switch checked={item.publicWrite} onCheckedChange={(v) => handlePublicToggle('publicWrite', v)} disabled={loading} />
                </div>
            </div>

            {/* Lifecycle actions */}
            {isFile && (
                <div className="pt-2 border-t space-y-2">
                    <Label className="text-muted-foreground text-xs">Actions</Label>
                    <div className="flex flex-wrap gap-2">
                        {!file!.deleted ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDelete}
                                disabled={loading}
                                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            >
                                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                                Delete
                            </Button>
                        ) : (
                            <Button variant="outline" size="sm" onClick={handleRestore} disabled={loading}>
                                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                                Restore
                            </Button>
                        )}

                        {isAdmin && (
                            confirmPermanentDelete ? (
                                <div className="flex gap-1">
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handlePermanentDelete}
                                        disabled={loading}
                                    >
                                        {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                                        Confirm Permanent Delete
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setConfirmPermanentDelete(false)}>Cancel</Button>
                                </div>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setConfirmPermanentDelete(true)}
                                    className="text-destructive"
                                >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Perm. Delete
                                </Button>
                            )
                        )}
                    </div>
                </div>
            )}

            {/* Admin raw field editor */}
            {isAdmin && (
                <div className="pt-2 border-t">
                    <button
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full"
                        onClick={() => setShowAdminEdit(!showAdminEdit)}
                    >
                        <Settings2 className="h-3 w-3" />
                        Admin: Edit raw fields
                        {showAdminEdit ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                    </button>

                    {showAdminEdit && (
                        <div className="mt-3 space-y-3 p-3 bg-muted/50 rounded border border-dashed">
                            <p className="text-xs text-muted-foreground">Only fill in fields you want to change.</p>

                            {isFile && (
                                <>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Owner</Label>
                                        <Input
                                            className="h-7 text-xs"
                                            placeholder={file!.owner}
                                            value={(adminFields as AdminFileUpdate).owner ?? ''}
                                            onChange={(e) => setAdminFields({ ...adminFields, owner: e.target.value || undefined })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Room ID (yjs)</Label>
                                        <Input
                                            className="h-7 text-xs font-mono"
                                            placeholder={file!.roomId ?? 'none'}
                                            value={(adminFields as AdminFileUpdate).room_id ?? ''}
                                            onChange={(e) => setAdminFields({ ...adminFields, room_id: e.target.value || undefined })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Folder ID</Label>
                                        <Input
                                            className="h-7 text-xs font-mono"
                                            placeholder={file!.folderId ?? 'none (root)'}
                                            value={(adminFields as AdminFileUpdate).folder_id ?? ''}
                                            onChange={(e) => setAdminFields({ ...adminFields, folder_id: e.target.value || undefined })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">App</Label>
                                        <Input
                                            className="h-7 text-xs"
                                            placeholder={file!.app ?? 'none'}
                                            value={(adminFields as AdminFileUpdate).app ?? ''}
                                            onChange={(e) => setAdminFields({ ...adminFields, app: e.target.value || undefined })}
                                        />
                                    </div>
                                </>
                            )}

                            {!isFile && (
                                <div className="space-y-1">
                                    <Label className="text-xs">Owner</Label>
                                    <Input
                                        className="h-7 text-xs"
                                        placeholder={folder!.owner}
                                        value={(adminFields as AdminFolderUpdate).owner ?? ''}
                                        onChange={(e) => setAdminFields({ ...adminFields, owner: e.target.value || undefined })}
                                    />
                                </div>
                            )}

                            <Button
                                size="sm"
                                onClick={handleAdminSave}
                                disabled={loading || Object.keys(adminFields).length === 0}
                                className="w-full"
                            >
                                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                                Apply Admin Changes
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
