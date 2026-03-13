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
        if (mimeType?.includes('json') || mimeType?.includes('javascript'))
            return FileCode;
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

function formatDate(date: string | number | null): string {
    if (!date) return '';
    if (typeof date === 'number') return new Date(date * 1000).toLocaleDateString();
    return new Date(date).toLocaleDateString();
}

export function FileRow({ file, onClick, isConnected }: FileRowProps) {
    const Icon = getFileIcon(file.type, file.mimeType);
    const isDeleted = file.deleted;
    const isAttachment = file.parentId !== null;

    return (
        <div
            className={cn(
                'flex items-center gap-3 px-4 py-2 hover:bg-accent cursor-pointer',
                isDeleted && 'opacity-50',
                isConnected && 'bg-green-50 dark:bg-green-950/50',
            )}
            onClick={onClick}
        >
            {isConnected ? (
                <Wifi className="h-5 w-5 text-green-600 shrink-0" />
            ) : (
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
            )}

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn('truncate', isDeleted && 'line-through')}>
                        {file.title}
                    </span>
                    {isDeleted && (
                        <Badge variant="destructive" className="text-xs">
                            <Trash2 className="h-3 w-3 mr-1" />
                            Deleted
                        </Badge>
                    )}
                    {isAttachment && (
                        <Badge variant="outline" className="text-xs" title="Attachment">
                            <Paperclip className="h-3 w-3 mr-1" />
                            Attachment
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">{file.owner}</span>
                    {file.app && (
                        <>
                            <span>•</span>
                            <span>{file.app}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Type and Scope badges */}
            <div className="flex items-center gap-1 shrink-0">
                <Badge 
                    variant={file.type === 'yjs' ? 'default' : 'secondary'} 
                    className="text-xs"
                >
                    {file.type}
                </Badge>
                <Badge 
                    variant={file.scope === 'drive' ? 'outline' : 'secondary'} 
                    className="text-xs"
                >
                    {file.scope}
                </Badge>
            </div>

            {/* Access indicators */}
            <div className="flex items-center gap-1 shrink-0">
                {file.publicRead ? (
                    <span title="Public read">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                    </span>
                ) : (
                    <span title="Private">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                    </span>
                )}
                {file.sharedWith.length > 0 && (
                    <span title={`Shared with ${file.sharedWith.length} user(s)`}>
                        <Users className="h-3 w-3 text-muted-foreground" />
                    </span>
                )}
            </div>

            {/* Size */}
            {file.size !== null && (
                <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                    {formatBytes(file.size)}
                </span>
            )}

            {/* Date */}
            <span className="text-xs text-muted-foreground w-24 text-right shrink-0">
                {formatDate(file.updatedAt)}
            </span>
        </div>
    );
}