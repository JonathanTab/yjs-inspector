import type { FileDescriptor } from '@/types/storage';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { FileText, FileImage, File, FileCode, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppListProps {
    files: FileDescriptor[];
    onSelectFile: (file: FileDescriptor) => void;
    connectedFileId?: string | null;
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

// Helper to parse date strings or numbers into timestamps
function parseDate(date: string | number | null): number {
    if (date === null) return 0;
    if (typeof date === 'number') return date;
    return new Date(date).getTime() || 0;
}

export function AppList({ files, onSelectFile, connectedFileId }: AppListProps) {
    // Group files by app
    const groupedFiles = useMemo(() => {
        const groups: Map<string | null, FileDescriptor[]> = new Map();
        
        files.forEach((file) => {
            const key = file.app;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(file);
        });

        // Sort files within each group by updated date
        groups.forEach((groupFiles) => {
            groupFiles.sort((a, b) => parseDate(b.updatedAt) - parseDate(a.updatedAt));
        });

        return groups;
    }, [files]);

    // Sort groups: null (no app) first, then alphabetically
    const sortedGroups = useMemo(() => {
        const entries = Array.from(groupedFiles.entries());
        return entries.sort((a, b) => {
            if (a[0] === null) return -1;
            if (b[0] === null) return 1;
            return a[0].localeCompare(b[0]);
        });
    }, [groupedFiles]);

    if (files.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">No app-scoped documents found</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4">
            {sortedGroups.map(([appName, groupFiles]) => (
                <div key={appName ?? 'no-app'} className="space-y-2">
                    <div className="flex items-center gap-2 sticky top-0 bg-background z-10 py-1">
                        <h3 className="text-sm font-semibold">
                            {appName ?? 'No App'}
                        </h3>
                        <Badge variant="outline" className="text-xs">
                            {groupFiles.length}
                        </Badge>
                    </div>
                    
                    <div className="divide-y border rounded-lg">
                        {groupFiles.map((file) => {
                            const Icon = getFileIcon(file.type, file.mimeType);
                            
                            return (
                                <div
                                    key={file.id}
                                    className={cn(
                                        'flex items-center gap-3 px-4 py-2 hover:bg-accent cursor-pointer',
                                        file.deleted && 'opacity-50',
                                    )}
                                    onClick={() => onSelectFile(file)}
                                >
                                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                'truncate',
                                                file.deleted && 'line-through'
                                            )}>
                                                {file.title}
                                            </span>
                                            {file.scope === 'app' && (
                                                <Badge variant="secondary" className="text-xs">
                                                    app
                                                </Badge>
                                            )}
                                            {file.scope === 'drive' && (
                                                <Badge variant="outline" className="text-xs">
                                                    drive
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span>{file.owner}</span>
                                            {file.type === 'blob' && (
                                                <>
                                                    <span>•</span>
                                                    <span>{file.mimeType || 'unknown'}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                                        {connectedFileId === file.id && (
                                            <Wifi className="h-3 w-3 text-green-600" />
                                        )}
                                        {file.size !== null && (
                                            <span className="w-16 text-right">
                                                {formatBytes(file.size)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}