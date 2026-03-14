import type { FileDescriptor } from '@/types/storage';
import {
    FileText,
    FileImage,
    FileCode,
    File,
    Globe,
    Lock,
    Users,
    Trash2,
    Paperclip,
    Wifi,
    Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface FileRowProps {
    file: FileDescriptor;
    onClick: () => void;
    isConnected?: boolean;
}

function getFileIcon(type: string, mimeType: string | null) {
    if (type === 'blob') {
        if (mimeType?.startsWith('image/')) return FileImage;
        if (mimeType?.includes('json') || mimeType?.includes('javascript')) return FileCode;
        if (mimeType?.startsWith('text/')) return FileText;
        return File;
    }
    return FileText;
}

function formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatRelativeDate(date: string | number | null): string {
    if (!date) return '';
    const d = typeof date === 'number' ? new Date(date * 1000) : new Date(date);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
}

export function FileRow({ file, onClick, isConnected }: FileRowProps) {
    const Icon = isConnected ? Wifi : (file.type === 'blob' ? Database : getFileIcon(file.type, file.mimeType));
    const isDeleted = file.deleted;
    const isAttachment = file.parentId !== null;
    const size = formatBytes(file.size);
    const date = formatRelativeDate(file.updatedAt);

    return (
        <div
            className={cn(
                'flex items-center gap-3 px-4 py-2 hover:bg-accent cursor-pointer transition-colors',
                isDeleted && 'opacity-50',
                isConnected && 'bg-green-50 dark:bg-green-950/30 border-l-2 border-l-green-500',
            )}
            onClick={onClick}
        >
            <Icon className={cn('h-4 w-4 shrink-0', isConnected ? 'text-green-600' : 'text-muted-foreground')} />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className={cn(
                        'text-sm truncate',
                        isDeleted && 'line-through text-muted-foreground',
                    )}>
                        {file.title}
                    </span>
                    {isAttachment && (
                        <span title="Attachment"><Paperclip className="h-3 w-3 text-muted-foreground shrink-0" /></span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{file.owner}</span>
                    {file.app && (
                        <span className="text-xs text-muted-foreground/70 truncate max-w-[100px]">
                            {file.app}
                        </span>
                    )}
                </div>
            </div>

            {/* Type + scope badges */}
            <div className="flex items-center gap-1 shrink-0">
                <Badge
                    variant={file.type === 'yjs' ? 'default' : 'secondary'}
                    className="text-[10px] h-4 px-1.5"
                >
                    {file.type}
                </Badge>
                {file.scope === 'app' && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        app
                    </Badge>
                )}
                {isDeleted && (
                    <Badge variant="destructive" className="text-[10px] h-4 px-1.5 gap-0.5">
                        <Trash2 className="h-2 w-2" />
                        del
                    </Badge>
                )}
            </div>

            {/* Access / sharing */}
            <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                {file.publicRead
                    ? <span title="Public read"><Globe className="h-3 w-3" /></span>
                    : <span title="Private"><Lock className="h-3 w-3 opacity-50" /></span>
                }
                {file.sharedWith.length > 0 && (
                    <span className="flex items-center gap-0.5 text-xs" title={`Shared with ${file.sharedWith.length} user(s)`}>
                        <Users className="h-3 w-3" />
                        {file.sharedWith.length}
                    </span>
                )}
            </div>

            {/* Size */}
            {size && (
                <span className="text-xs text-muted-foreground w-14 text-right shrink-0 tabular-nums">
                    {size}
                </span>
            )}

            {/* Date */}
            <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                {date}
            </span>
        </div>
    );
}
