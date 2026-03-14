import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import type { FileDescriptor, Folder } from '@/types/storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetadataInspector } from './metadata-inspector';
import { PermissionsInspector } from './permissions-inspector';
import { VersionsInspector } from './versions-inspector';
import { BlobInspector } from './blob-inspector';
import { FileText, Lock, History, FileImage, Code, Wifi, WifiOff, Maximize2, Redo, Undo, Cable, RotateCw, Activity } from 'lucide-react';
import { JsonViewerPanel } from '@/components/json-viewer-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConfig, useUndoManager, useYDoc } from '@/state';
import { WebSocketConnectProvider } from '@/providers/websocket';

interface InspectorPanelProps {
    file: FileDescriptor | null;
    folder: Folder | null;
    yDoc?: Y.Doc | null;
    connectionState?: 'disconnected' | 'connecting' | 'connected';
    onConnect?: (provider: WebSocketConnectProvider, fileId: string) => void;
    onDisconnect?: () => void;
    onUpdateFile?: (file: FileDescriptor) => void;
    onUpdateFolder?: (folder: Folder) => void;
    onDeleteFile?: (id: string) => void;
}

// Track YDoc updates with a counter
function useYDocUpdateCounter(yDoc: Y.Doc | null | undefined) {
    const [updateCount, setUpdateCount] = useState(0);
    const [isFlashing, setIsFlashing] = useState(false);
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!yDoc) return;

        const callback = () => {
            setUpdateCount((count) => count + 1);
            setIsFlashing(true);
            
            // Clear any existing timeout
            if (flashTimeoutRef.current) {
                clearTimeout(flashTimeoutRef.current);
            }
            
            // Reset flash after 300ms
            flashTimeoutRef.current = setTimeout(() => {
                setIsFlashing(false);
            }, 300);
        };
        
        yDoc.on('update', callback);
        yDoc.on('subdocs', ({ added }) => {
            for (const subDoc of added) {
                subDoc.on('update', callback);
            }
        });
        
        return () => {
            yDoc.off('update', callback);
            yDoc.off('subdocs', callback);
            yDoc.subdocs.forEach((subDoc) => {
                subDoc.off('update', callback);
            });
            if (flashTimeoutRef.current) {
                clearTimeout(flashTimeoutRef.current);
            }
        };
    }, [yDoc]);

    return { updateCount, isFlashing };
}

// Force re-render when YDoc updates
function useYDocUpdates(yDoc: Y.Doc | null | undefined) {
    const [, setCount] = useState(0);

    useEffect(() => {
        if (!yDoc) return;

        const callback = () => {
            setCount((count) => count + 1);
        };
        
        yDoc.on('update', callback);
        yDoc.on('subdocs', ({ added }) => {
            for (const subDoc of added) {
                subDoc.on('update', callback);
            }
        });
        
        return () => {
            yDoc.off('update', callback);
            yDoc.off('subdocs', callback);
            yDoc.subdocs.forEach((subDoc) => {
                subDoc.off('update', callback);
            });
        };
    }, [yDoc]);
}

export function InspectorPanel({
    file,
    folder,
    yDoc,
    connectionState = 'disconnected',
    onConnect,
    onDisconnect,
    onUpdateFile,
    onUpdateFolder,
    onDeleteFile,
}: InspectorPanelProps) {
    const [activeTab, setActiveTab] = useState('metadata');
    const [showViewer, setShowViewer] = useState(false);
    const [config, setConfig] = useConfig();
    const { undoManager, canRedo, canUndo, undoStackSize, redoStackSize } = useUndoManager();
    const [, setYDoc] = useYDoc();

    // Force re-render when YDoc updates
    useYDocUpdates(yDoc);
    
    // Track updates for indicator
    const { updateCount, isFlashing } = useYDocUpdateCounter(connectionState === 'connected' ? yDoc : null);

    // Switch to content tab when connected and auto-show viewer
    useEffect(() => {
        if (connectionState === 'connected' && file?.type === 'yjs') {
            setActiveTab('content');
            setShowViewer(true);
        }
    }, [connectionState, file?.type]);

    // Close viewer when disconnected
    useEffect(() => {
        if (connectionState !== 'connected') {
            setShowViewer(false);
        }
    }, [connectionState]);
    
    // Auto-connect when selecting a YJS file
    const handleConnect = useCallback(async () => {
        if (!config.documentManager.apiKey || !file?.roomId || !onConnect) {
            return;
        }

        try {
            const doc = new Y.Doc();
            setYDoc(doc);

            const provider = new WebSocketConnectProvider(
                config.documentManager.wsUrl,
                file.roomId,
                doc,
            );
            onConnect(provider, file.id);
        } catch (error) {
            console.error('Failed to connect:', error);
        }
    }, [config.documentManager, file, setYDoc, onConnect]);
    
    // Handle disconnect - resets YDoc
    const handleDisconnect = useCallback(() => {
        if (onDisconnect) {
            onDisconnect();
        }
        setYDoc(new Y.Doc());
    }, [onDisconnect, setYDoc]);
    
    // Close viewer and disconnect when leaving the viewer
    const handleCloseViewer = useCallback(() => {
        setShowViewer(false);
        handleDisconnect();
    }, [handleDisconnect]);

    if (!file && !folder) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm text-center">
                    Select a file or folder to view details
                </p>
            </div>
        );
    }

    const item = file || folder;
    const isFile = !!file;
    const isConnected = connectionState === 'connected';

    // YJS Viewer Settings Panel (used in overlay)
    const yjsViewerSettings = (
        <div className="flex items-center gap-4 p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Viewer Settings</span>
            </div>
            <div className="flex flex-wrap gap-3">
                <div className="flex items-center space-x-2">
                    <Switch
                        id="parse-y-doc-switch"
                        checked={config.parseYDoc}
                        onCheckedChange={(checked) =>
                            setConfig({
                                ...config,
                                parseYDoc: checked,
                            })
                        }
                    />
                    <Label htmlFor="parse-y-doc-switch" className="text-xs">Parse</Label>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-delta"
                        checked={config.showDelta}
                        disabled={!config.parseYDoc}
                        onCheckedChange={(checked) =>
                            setConfig({
                                ...config,
                                showDelta: checked,
                            })
                        }
                    />
                    <Label htmlFor="show-delta" className="text-xs">Delta</Label>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-size"
                        checked={config.showSize}
                        onCheckedChange={(checked) =>
                            setConfig({
                                ...config,
                                showSize: checked,
                            })
                        }
                    />
                    <Label htmlFor="show-size" className="text-xs">Size</Label>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        id="editable-switch"
                        disabled={!config.parseYDoc}
                        checked={config.editable}
                        onCheckedChange={(checked) =>
                            setConfig({
                                ...config,
                                editable: checked,
                            })
                        }
                    />
                    <Label htmlFor="editable-switch" className="text-xs">Edit</Label>
                </div>
            </div>

            {config.editable && (
                <div className="flex items-center gap-2 ml-auto">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!canUndo}
                        onClick={() => {
                            if (!undoManager.canUndo()) {
                                console.warn("Cannot undo", undoManager);
                                return;
                            }
                            undoManager.undo();
                        }}
                    >
                        <Undo className="mr-1 h-3 w-3" />
                        Undo({undoStackSize})
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!canRedo}
                        onClick={() => {
                            if (!undoManager.canRedo()) {
                                console.warn("Cannot redo", undoManager);
                                return;
                            }
                            undoManager.redo();
                        }}
                    >
                        <Redo className="mr-1 h-3 w-3" />
                        Redo({redoStackSize})
                    </Button>
                </div>
            )}
        </div>
    );

    return (
        <>
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="border-b p-4">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold truncate flex-1">
                            {isFile ? file!.title : folder!.name}
                        </h2>
                        {isFile && file!.type === 'yjs' && (
                            <>
                                {isConnected ? (
                                    <Badge className="bg-green-600 gap-1">
                                        <Wifi className="h-3 w-3" />
                                        Connected
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="gap-1">
                                        <WifiOff className="h-3 w-3" />
                                        Disconnected
                                    </Badge>
                                )}
                                {isConnected && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setShowViewer(true)}
                                        title="Open viewer"
                                    >
                                        <Maximize2 className="h-3 w-3" />
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {isFile ? file!.type.toUpperCase() : 'Folder'} • {item!.owner}
                    </p>
                </div>

                {/* Connection Controls - only for YJS files */}
                {isFile && file!.type === 'yjs' && (
                    <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                        <span className="text-xs font-medium text-muted-foreground">Connection</span>
                        <div className="flex items-center gap-2">
                            {connectionState === 'connecting' ? (
                                <Button variant="secondary" size="sm" disabled className="gap-1">
                                    <RotateCw className="h-3 w-3 animate-spin" />
                                    Connecting...
                                </Button>
                            ) : isConnected ? (
                                <>
                                    {/* Update indicator */}
                                    <div 
                                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                            isFlashing 
                                                ? 'bg-green-500 text-white' 
                                                : 'bg-muted text-muted-foreground'
                                        }`}
                                    >
                                        <Activity className="h-3 w-3" />
                                        <span>{updateCount} updates</span>
                                    </div>
                                    <Button 
                                        variant="secondary" 
                                        size="sm" 
                                        onClick={handleDisconnect} 
                                        className="gap-1"
                                    >
                                        <WifiOff className="h-3 w-3" />
                                        Disconnect
                                    </Button>
                                </>
                            ) : (
                                <Button 
                                    variant="default" 
                                    size="sm" 
                                    onClick={handleConnect}
                                    disabled={!config.documentManager.apiKey || !file?.roomId}
                                    className="gap-1"
                                >
                                    <Cable className="h-3 w-3" />
                                    Connect
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                    <TabsList className="grid w-full m-2" style={{ gridTemplateColumns: isFile && file!.type === 'yjs' ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
                        <TabsTrigger value="metadata" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            Metadata
                        </TabsTrigger>
                        <TabsTrigger value="permissions" className="text-xs">
                            <Lock className="h-3 w-3 mr-1" />
                            Permissions
                        </TabsTrigger>
                        {isFile && file!.type === 'yjs' && (
                            <TabsTrigger value="content" className="text-xs">
                                <Code className="h-3 w-3 mr-1" />
                                Content
                            </TabsTrigger>
                        )}
                        {isFile && file!.type === 'blob' && (
                            <TabsTrigger value="blob" className="text-xs">
                                <FileImage className="h-3 w-3 mr-1" />
                                Content
                            </TabsTrigger>
                        )}
                        {isFile && file!.type === 'yjs' && (
                            <TabsTrigger value="versions" className="text-xs">
                                <History className="h-3 w-3 mr-1" />
                                Sync
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <div className="flex-1 overflow-auto">
                        <TabsContent value="metadata" className="m-0">
                            {isFile ? (
                                <MetadataInspector
                                    file={file!}
                                    onUpdate={onUpdateFile as ((item: FileDescriptor | Folder | undefined) => void) | undefined}
                                    onDelete={onDeleteFile}
                                />
                            ) : (
                                <MetadataInspector
                                    folder={folder!}
                                    onUpdate={onUpdateFolder as ((item: FileDescriptor | Folder | undefined) => void) | undefined}
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="permissions" className="m-0">
                            {isFile ? (
                                <PermissionsInspector file={file!} onUpdate={onUpdateFile as ((item: FileDescriptor | Folder | undefined) => void) | undefined} />
                            ) : (
                                <PermissionsInspector folder={folder!} onUpdate={onUpdateFolder as ((item: FileDescriptor | Folder | undefined) => void) | undefined} />
                            )}
                        </TabsContent>

                        {isFile && file!.type === 'yjs' && (
                            <TabsContent value="content" className="m-0">
                                {isConnected && yDoc ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4">
                                        <Code className="h-8 w-8 mb-2 opacity-50" />
                                        <p className="text-sm text-center">
                                            Document content is displayed in the overlay viewer
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-2"
                                            onClick={() => setShowViewer(true)}
                                        >
                                            <Maximize2 className="h-3 w-3 mr-1" />
                                            Open Viewer
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4">
                                        <WifiOff className="h-8 w-8 mb-2 opacity-50" />
                                        <p className="text-sm text-center">
                                            {connectionState === 'connecting' 
                                                ? 'Connecting to document...' 
                                                : 'Click "Connect" above to view document content'}
                                        </p>
                                    </div>
                                )}
                            </TabsContent>
                        )}

                        {isFile && file!.type === 'blob' && (
                            <TabsContent value="blob" className="m-0">
                                <BlobInspector file={file!} onUpdate={onUpdateFile} />
                            </TabsContent>
                        )}

                        {isFile && file!.type === 'yjs' && (
                            <TabsContent value="versions" className="m-0">
                                <VersionsInspector file={file!} />
                            </TabsContent>
                        )}
                    </div>
                </Tabs>
            </div>

            {/* Full-screen YJS Viewer Overlay */}
            {showViewer && isConnected && yDoc && file?.type === 'yjs' && (
                <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
                    {/* Overlay Header */}
                    <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/50">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-semibold">{file.title}</h3>
                            <Badge className="bg-green-600 gap-1">
                                <Wifi className="h-3 w-3" />
                                Connected
                            </Badge>
                            {/* Update indicator in overlay */}
                            <div 
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                    isFlashing 
                                        ? 'bg-green-500 text-white' 
                                        : 'bg-muted text-muted-foreground'
                                }`}
                            >
                                <Activity className="h-3 w-3" />
                                <span>{updateCount} updates</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCloseViewer}
                                className="gap-1"
                            >
                                <WifiOff className="h-3 w-3" />
                                Disconnect & Close
                            </Button>
                        </div>
                    </div>

                    {/* Viewer Settings */}
                    {yjsViewerSettings}

                    {/* JSON Viewer */}
                    <div className="flex-1 overflow-auto">
                        <JsonViewerPanel
                            value={yDoc}
                            yDoc={yDoc}
                            inspectDepth={3}
                        />
                    </div>
                </div>
            )}
        </>
    );
}