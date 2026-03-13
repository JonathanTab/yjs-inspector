import type { FileDescriptor } from '@/types/storage';
import { FileRow } from './file-row';
import { FileText, Loader2, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileListProps {
    files: FileDescriptor[];
    viewType: 'grid' | 'list';
    onSelectFile: (file: FileDescriptor) => void;
    loading?: boolean;
    connectedFileId?: string | null;
}

export function FileList({ files, viewType, onSelectFile, loading, connectedFileId }: FileListProps) {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-sm">Loading files...</p>
            </div>
        );
    }

    if (files.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-8 w-8 mb-2" />
                <p className="text-sm">No files found</p>
            </div>
        );
    }

    if (viewType === 'grid') {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4">
                {files.map((file) => (
                    <div
                        key={file.id}
                        className={cn(
                            "flex flex-col items-center p-4 rounded-lg border hover:bg-accent cursor-pointer relative",
                            connectedFileId === file.id && "ring-2 ring-green-500 bg-green-50 dark:bg-green-950"
                        )}
                        onClick={() => onSelectFile(file)}
                    >
                        {connectedFileId === file.id && (
                            <Wifi className="h-3 w-3 text-green-600 absolute top-2 right-2" />
                        )}
                        <FileText className="h-8 w-8 mb-2 text-muted-foreground" />
                        <span className="text-sm text-center truncate w-full">
                            {file.title}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="divide-y">
            {files.map((file) => (
                <FileRow
                    key={file.id}
                    file={file}
                    onClick={() => onSelectFile(file)}
                    isConnected={connectedFileId === file.id}
                />
            ))}
        </div>
    );
}
