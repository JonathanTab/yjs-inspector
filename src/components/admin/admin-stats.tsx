import { useEffect, useState } from 'react';
import { useConnectionConfig } from '@/state/storage';
import { createServerApi } from '@/lib/server-api';
import type { AdminStats as AdminStatsType } from '@/types/storage';
import { Loader2, FileText, FolderTree, Database, Trash2, Users, Share2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function StatRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="flex items-center gap-1.5">
                {typeof value === 'number' || typeof value === 'string'
                    ? <span className="text-sm font-medium">{value}</span>
                    : value}
                {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
            </div>
        </div>
    );
}

export function AdminStats() {
    const [connectionConfig] = useConnectionConfig();
    const [stats, setStats] = useState<AdminStatsType | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = async () => {
        if (!connectionConfig.apiKey) return;
        setLoading(true);
        setError(null);
        try {
            const api = createServerApi(connectionConfig);
            const result = await api.getAdminStats();
            setStats(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch stats');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionConfig.apiKey]);

    if (!connectionConfig.apiKey) return null;

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-3 text-xs text-destructive bg-destructive/10 rounded">
                Stats unavailable: {error}
            </div>
        );
    }

    if (!stats) return null;

    const total = stats.totalDocuments + stats.deletedDocuments;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    System Overview
                </h3>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchStats} disabled={loading} title="Refresh stats">
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {/* Primary counts */}
            <div className="grid grid-cols-2 gap-1.5">
                <div className="p-2.5 border rounded-lg bg-card">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Documents</p>
                    </div>
                    <p className="text-xl font-bold leading-none">{stats.totalDocuments}</p>
                    {stats.totalDeleted != null && stats.totalDeleted > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">+{stats.totalDeleted} deleted</p>
                    )}
                </div>

                <div className="p-2.5 border rounded-lg bg-card">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Folders</p>
                    </div>
                    <p className="text-xl font-bold leading-none">{stats.totalFolders}</p>
                </div>

                <div className="p-2.5 border rounded-lg bg-card">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Blob Size</p>
                    </div>
                    <p className="text-xl font-bold leading-none">{formatBytes(stats.totalSize)}</p>
                </div>

                <div className="p-2.5 border rounded-lg bg-card">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Users</p>
                    </div>
                    <p className="text-xl font-bold leading-none">{stats.totalUsers ?? '–'}</p>
                    {stats.uniqueOwners != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">{stats.uniqueOwners} with files</p>
                    )}
                </div>
            </div>

            {/* Breakdown */}
            <div className="border rounded-lg divide-y text-sm">
                <div className="px-3 py-1.5">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">By Type</p>
                    <StatRow label="Yjs documents" value={<Badge variant="outline">{stats.documentsByType.yjs}</Badge>} />
                    <StatRow label="Blob files" value={<Badge variant="outline">{stats.documentsByType.blob}</Badge>} />
                </div>

                <div className="px-3 py-1.5">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">By Scope</p>
                    <StatRow label="Drive" value={<Badge variant="outline">{stats.documentsByScope.drive}</Badge>} />
                    <StatRow label="App" value={<Badge variant="outline">{stats.documentsByScope.app}</Badge>} />
                </div>

                {(stats.totalShares != null || stats.totalFolderShares != null) && (
                    <div className="px-3 py-1.5">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Sharing</p>
                        {stats.totalShares != null && (
                            <StatRow
                                label="File shares"
                                value={<Badge variant="secondary" className="gap-1"><Share2 className="h-2.5 w-2.5" />{stats.totalShares}</Badge>}
                            />
                        )}
                        {stats.totalFolderShares != null && (
                            <StatRow
                                label="Folder shares"
                                value={<Badge variant="secondary">{stats.totalFolderShares}</Badge>}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Deleted warning */}
            {stats.deletedDocuments > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                    <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="text-xs">{stats.deletedDocuments} soft-deleted files pending cleanup</span>
                </div>
            )}

            {/* Total count summary */}
            <p className="text-xs text-muted-foreground text-right">
                {total} total records in database
            </p>
        </div>
    );
}
