import { useEffect, useState } from 'react';
import { useConnectionConfig, useAdminStats } from '@/state/storage';
import { createServerApi } from '@/lib/server-api';
import type { AdminStats as AdminStatsType } from '@/types/storage';
import { Loader2, FileText, FolderTree, Image, Database, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function AdminStats() {
    const [connectionConfig] = useConnectionConfig();
    const [, setAdminStats] = useAdminStats();
    const [stats, setStats] = useState<AdminStatsType | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!connectionConfig.apiKey) return;

        const fetchStats = async () => {
            setLoading(true);
            setError(null);
            try {
                const api = createServerApi(connectionConfig);
                const result = await api.getAdminStats();
                setStats(result);
                setAdminStats(result);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch stats');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [connectionConfig, setAdminStats]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-sm text-destructive">
                Failed to load stats: {error}
            </div>
        );
    }

    if (!stats) {
        return null;
    }

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">
                System Overview
            </h3>
            <div className="grid grid-cols-2 gap-2">
                <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="text-xs text-muted-foreground">Documents</p>
                            <p className="text-lg font-semibold">{stats.totalDocuments}</p>
                        </div>
                    </div>
                </div>

                <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                        <FolderTree className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="text-xs text-muted-foreground">Folders</p>
                            <p className="text-lg font-semibold">{stats.totalFolders}</p>
                        </div>
                    </div>
                </div>

                <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                        <Image className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="text-xs text-muted-foreground">Blobs</p>
                            <p className="text-lg font-semibold">{stats.totalBlobs}</p>
                        </div>
                    </div>
                </div>

                <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <p className="text-xs text-muted-foreground">Total Size</p>
                            <p className="text-lg font-semibold">{formatBytes(stats.totalSize)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-3 border rounded-lg">
                <h4 className="text-sm font-semibold mb-2">By Type</h4>
                <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                        <span>Yjs Documents</span>
                        <Badge variant="outline">{stats.documentsByType.yjs}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span>Blobs</span>
                        <Badge variant="outline">{stats.documentsByType.blob}</Badge>
                    </div>
                </div>
            </div>

            <div className="p-3 border rounded-lg">
                <h4 className="text-sm font-semibold mb-2">By Scope</h4>
                <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                        <span>Drive</span>
                        <Badge variant="outline">{stats.documentsByScope.drive}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span>App</span>
                        <Badge variant="outline">{stats.documentsByScope.app}</Badge>
                    </div>
                </div>
            </div>

            {stats.deletedDocuments > 0 && (
                <div className="p-3 border rounded-lg border-destructive/50 bg-destructive/5">
                    <div className="flex items-center gap-2">
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <div>
                            <p className="text-xs text-muted-foreground">Deleted Documents</p>
                            <p className="text-lg font-semibold text-destructive">
                                {stats.deletedDocuments}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}