import { useEffect, useState, useCallback } from 'react';
import { useConnectionConfig } from '@/state/storage';
import { createServerApi } from '@/lib/server-api';
import type { YjsRoomStats } from '@/types/storage';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Activity, HardDrive, Plug, Users, ArrowDownUp, Radio } from 'lucide-react';

function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return '–';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatAgo(ms: number | null | undefined): string {
    if (ms == null) return '–';
    const diff = Date.now() - ms;
    const s = Math.floor(diff / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

const REFRESH_MS = 4000;

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
    return (
        <div className="p-2.5 border rounded-lg bg-card">
            <div className="flex items-center gap-1.5 mb-0.5">
                {icon}
                <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <p className="text-lg font-bold leading-none">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
    );
}

export function YjsDocStats({ roomId }: { roomId: string }) {
    const [connectionConfig] = useConnectionConfig();
    const [stats, setStats] = useState<YjsRoomStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasWs = !!connectionConfig.wsUrl;

    const fetchStats = useCallback(async () => {
        if (!connectionConfig.apiKey || !connectionConfig.wsUrl || !roomId) return;
        setLoading(true);
        setError(null);
        try {
            const api = createServerApi(connectionConfig);
            setStats(await api.getYjsRoomStats(roomId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch document stats');
        } finally {
            setLoading(false);
        }
    }, [connectionConfig, roomId]);

    useEffect(() => {
        if (!connectionConfig.apiKey || !hasWs || !roomId) return;
        fetchStats();
        const id = setInterval(fetchStats, REFRESH_MS);
        return () => clearInterval(id);
    }, [connectionConfig.apiKey, hasWs, roomId, fetchStats]);

    if (!connectionConfig.apiKey || !hasWs) return null;

    // Ignore stats left over from a previously-selected room until the new fetch lands.
    const current = stats && stats.roomId === roomId ? stats : null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    <Label className="text-base">Live Server Stats</Label>
                </div>
                <div className="flex items-center gap-1.5">
                    {current && (
                        <Badge variant={current.loaded ? 'default' : 'outline'} className={`text-[10px] ${current.loaded ? 'bg-green-600' : ''}`}>
                            {current.loaded ? 'active' : 'idle'}
                        </Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchStats} disabled={loading} title="Refresh now">
                        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {loading && !current ? (
                <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                </div>
            ) : error && !current ? (
                <div className="p-3 text-xs text-destructive bg-destructive/10 rounded">
                    {error}
                </div>
            ) : current ? (
                <div className="pl-6 space-y-3">
                    {/* Size + connection grid */}
                    <div className="grid grid-cols-2 gap-1.5">
                        <Stat
                            icon={<HardDrive className="h-3.5 w-3.5 text-muted-foreground" />}
                            label="On-disk size"
                            value={formatBytes(current.onDiskSize)}
                            sub="persisted (LevelDB)"
                        />
                        <Stat
                            icon={<HardDrive className="h-3.5 w-3.5 text-muted-foreground" />}
                            label="In-memory"
                            value={formatBytes(current.live?.stateSize)}
                            sub="live state"
                        />
                        <Stat
                            icon={<Plug className="h-3.5 w-3.5 text-muted-foreground" />}
                            label="Connections"
                            value={current.live?.connections ?? 0}
                            sub={current.live ? `${current.live.connectionsOpened} since load` : undefined}
                        />
                        <Stat
                            icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
                            label="Active users"
                            value={current.live?.userCount ?? 0}
                        />
                    </div>

                    {/* Over-the-wire + realtime detail */}
                    <div className="border rounded-lg divide-y text-sm">
                        <div className="px-3 py-1.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <ArrowDownUp className="h-3 w-3" /> Over the wire
                            </span>
                            <span className="text-xs font-medium">
                                ↓ {formatBytes(current.live?.wireBytesIn)} · ↑ {formatBytes(current.live?.wireBytesOut)}
                            </span>
                        </div>
                        <div className="px-3 py-1.5 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Messages (in / out)</span>
                            <span className="text-xs font-medium">
                                {current.live ? `${current.live.messagesIn} / ${current.live.messagesOut}` : '–'}
                            </span>
                        </div>
                        <div className="px-3 py-1.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Radio className="h-3 w-3" /> Awareness (presence)
                            </span>
                            <span className="text-xs font-medium">{current.live?.awarenessStates ?? 0}</span>
                        </div>
                        <div className="px-3 py-1.5 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Last activity</span>
                            <span className="text-xs font-medium">{formatAgo(current.live?.lastActivityAt)}</span>
                        </div>
                    </div>

                    {/* Connected users */}
                    {current.live && current.live.users.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground">Connected users</p>
                            <div className="flex flex-wrap gap-1">
                                {current.live.users.map((u) => (
                                    <Badge key={u} variant="secondary" className="text-[10px] gap-1">
                                        <Users className="h-2.5 w-2.5" />{u}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {!current.loaded && (
                        <p className="text-xs text-muted-foreground">
                            Room is idle (no connected clients). Showing persisted on-disk size only.
                        </p>
                    )}
                </div>
            ) : null}
        </div>
    );
}
