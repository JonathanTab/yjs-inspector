import { useEffect, useState, useCallback } from 'react';
import { useConnectionConfig } from '@/state/storage';
import { createServerApi } from '@/lib/server-api';
import type { YjsServerStats as YjsServerStatsType } from '@/types/storage';
import { Loader2, Radio, Users, Plug, ArrowDownUp, HardDrive, RefreshCw, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return '–';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}

// Auto-refresh interval for live server metrics
const REFRESH_MS = 5000;

export function YjsServerStats() {
    const [connectionConfig] = useConnectionConfig();
    const [stats, setStats] = useState<YjsServerStatsType | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasWs = !!connectionConfig.wsUrl;

    const fetchStats = useCallback(async () => {
        if (!connectionConfig.apiKey || !connectionConfig.wsUrl) return;
        setLoading(true);
        setError(null);
        try {
            const api = createServerApi(connectionConfig);
            setStats(await api.getYjsServerStats());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch yjs stats');
        } finally {
            setLoading(false);
        }
    }, [connectionConfig]);

    useEffect(() => {
        if (!connectionConfig.apiKey || !hasWs) return;
        fetchStats();
        const id = setInterval(fetchStats, REFRESH_MS);
        return () => clearInterval(id);
    }, [connectionConfig.apiKey, hasWs, fetchStats]);

    if (!connectionConfig.apiKey || !hasWs) return null;

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
            </div>
        );
    }

    if (error && !stats) {
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Yjs Server
                    </h3>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchStats} title="Retry">
                        <RefreshCw className="h-3 w-3" />
                    </Button>
                </div>
                <div className="p-3 text-xs text-destructive bg-destructive/10 rounded">
                    Yjs stats unavailable: {error}
                </div>
            </div>
        );
    }

    if (!stats) return null;

    const s = stats.server;
    const topRooms = [...stats.rooms]
        .sort((a, b) => b.connections - a.connections)
        .slice(0, 5);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <Server className="h-3.5 w-3.5" />
                    Yjs Server
                </h3>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchStats} disabled={loading} title="Refresh now">
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {/* Primary live counters */}
            <div className="grid grid-cols-2 gap-1.5">
                <div className="p-2.5 border rounded-lg bg-card">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Connections</p>
                    </div>
                    <p className="text-xl font-bold leading-none">{s.totalConnections}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.connectionsOpened} opened total</p>
                </div>

                <div className="p-2.5 border rounded-lg bg-card">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Active Rooms</p>
                    </div>
                    <p className="text-xl font-bold leading-none">{s.activeRooms}</p>
                    {s.onDiskDocCount != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">{s.onDiskDocCount} on disk</p>
                    )}
                </div>

                <div className="p-2.5 border rounded-lg bg-card">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Live Users</p>
                    </div>
                    <p className="text-xl font-bold leading-none">{s.uniqueUsers}</p>
                </div>

                <div className="p-2.5 border rounded-lg bg-card">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Wire I/O</p>
                    </div>
                    <p className="text-sm font-bold leading-tight">↓ {formatBytes(s.wireBytesIn)}</p>
                    <p className="text-sm font-bold leading-tight">↑ {formatBytes(s.wireBytesOut)}</p>
                </div>
            </div>

            {/* Server detail */}
            <div className="border rounded-lg divide-y text-sm">
                <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Uptime</span>
                    <span className="text-xs font-medium">{formatUptime(s.uptimeMs)}</span>
                </div>
                <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Messages (in / out)</span>
                    <span className="text-xs font-medium">{s.messagesIn} / {s.messagesOut}</span>
                </div>
                <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Conns closed</span>
                    <span className="text-xs font-medium">{s.connectionsClosed}</span>
                </div>
                <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">GC</span>
                    <Badge variant={s.gcEnabled ? 'outline' : 'secondary'} className="text-[10px]">
                        {s.gcEnabled ? 'enabled' : 'disabled'}
                    </Badge>
                </div>
            </div>

            {/* Busiest rooms */}
            {topRooms.length > 0 && (
                <div className="space-y-1.5">
                    <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <HardDrive className="h-3 w-3" />
                        Active rooms
                    </p>
                    <div className="border rounded-lg divide-y">
                        {topRooms.map((r) => (
                            <div key={r.roomId} className="px-3 py-1.5 space-y-0.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-[10px] truncate" title={r.roomId}>
                                        {r.roomId}
                                    </span>
                                    <Badge variant="secondary" className="gap-1 text-[10px] flex-shrink-0">
                                        <Plug className="h-2.5 w-2.5" />{r.connections}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span>{formatBytes(r.stateSize)} state</span>
                                    <span>↓{formatBytes(r.wireBytesIn)} ↑{formatBytes(r.wireBytesOut)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p className="text-xs text-muted-foreground text-right">
                live · refreshes every {REFRESH_MS / 1000}s
            </p>
        </div>
    );
}
