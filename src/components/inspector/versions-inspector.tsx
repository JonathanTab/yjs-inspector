import { useState } from 'react';
import type { FileDescriptor } from '@/types/storage';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link, Wifi, Copy, Check, Loader2, Radio } from 'lucide-react';
import { useConnectionConfig } from '@/state/storage';
import { useToast } from '@/components/ui/use-toast';

interface VersionsInspectorProps {
    file: FileDescriptor;
    onConnectVersion?: (room: string) => void;
}

export function VersionsInspector({ file, onConnectVersion }: VersionsInspectorProps) {
    const [connecting, setConnecting] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [connectionConfig] = useConnectionConfig();
    const { toast } = useToast();

    const copyToClipboard = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleConnect = async () => {
        if (!file.roomId) return;
        
        setConnecting(true);
        try {
            onConnectVersion?.(file.roomId);
            toast({ title: 'Connected to document', description: `Room: ${file.roomId}` });
        } catch (error) {
            console.error('Failed to connect:', error);
            toast({
                title: 'Failed to connect',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive'
            });
        } finally {
            setConnecting(false);
        }
    };

    if (file.type !== 'yjs') {
        return (
            <div className="p-4 text-center text-muted-foreground">
                This file is not a Yjs document
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            {/* Room Information */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4" />
                    <Label className="text-base">Yjs Sync Room</Label>
                </div>

                {file.roomId ? (
                    <div className="space-y-3 pl-6">
                        {/* Room ID */}
                        <div className="space-y-2">
                            <Label className="text-sm text-muted-foreground">Room ID</Label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 p-2 bg-muted rounded font-mono text-xs break-all">
                                    {file.roomId}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 flex-shrink-0"
                                    onClick={() => copyToClipboard(file.roomId!, 'room')}
                                >
                                    {copied === 'room' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                </Button>
                            </div>
                        </div>

                        {/* WebSocket URL */}
                        <div className="space-y-2">
                            <Label className="text-sm text-muted-foreground">WebSocket URL</Label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 p-2 bg-muted rounded font-mono text-xs break-all">
                                    {connectionConfig.wsUrl}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 flex-shrink-0"
                                    onClick={() => copyToClipboard(connectionConfig.wsUrl, 'ws')}
                                >
                                    {copied === 'ws' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                </Button>
                            </div>
                        </div>

                        {/* Connection Actions */}
                        <div className="flex gap-2 pt-2">
                            <Button 
                                onClick={handleConnect}
                                disabled={connecting}
                                className="flex-1"
                            >
                                {connecting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        <Wifi className="h-4 w-4 mr-2" />
                                        Connect to Document
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="pl-6 text-sm text-muted-foreground">
                        No room ID assigned. This document may not be properly initialized.
                    </div>
                )}
            </div>

            {/* Document Info */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    <Label className="text-base">Document Info</Label>
                </div>

                <div className="space-y-3 pl-6">
                    <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">Document ID</span>
                        <Badge variant="outline" className="font-mono text-xs">
                            {file.id}
                        </Badge>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">Scope</span>
                        <Badge variant="outline">
                            {file.scope}
                        </Badge>
                    </div>

                    {file.app && (
                        <div className="flex items-center justify-between p-2 bg-muted rounded">
                            <span className="text-sm">App</span>
                            <Badge variant="outline">
                                {file.app}
                            </Badge>
                        </div>
                    )}

                    {file.folderId && (
                        <div className="flex items-center justify-between p-2 bg-muted rounded">
                            <span className="text-sm">Folder</span>
                            <Badge variant="outline" className="font-mono text-xs">
                                {file.folderId}
                            </Badge>
                        </div>
                    )}
                </div>
            </div>

            {/* Info Box */}
            <div className="p-4 bg-muted/50 rounded text-sm text-muted-foreground">
                <p className="font-medium mb-1">About Yjs Documents</p>
                <p>
                    Yjs documents are real-time collaborative documents. Each document has a unique 
                    room ID used for WebSocket synchronization. Connect to the document to inspect 
                    its Yjs data structures and see real-time updates.
                </p>
            </div>
        </div>
    );
}