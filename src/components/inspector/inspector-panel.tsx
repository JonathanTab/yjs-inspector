import { useState, useEffect } from 'react';
import * as Y from 'yjs';
import type { FileDescriptor, Folder } from '@/types/storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetadataInspector } from './metadata-inspector';
import { PermissionsInspector } from './permissions-inspector';
import { VersionsInspector } from './versions-inspector';
import { BlobInspector } from './blob-inspector';
import { FileText, Lock, History, FileImage, Code, Wifi, WifiOff, Maximize2, Redo, Undo } from 'lucide-react';
import { JsonViewerPanel } from '@/components/json-viewer-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfig, useUndoManager } from '@/state';

interface InspectorPanelProps {
    file: FileDescriptor | null;
    folder: Folder | null;
    yDoc?: Y.Doc | null;
    connectionState?: 'disconnected' | 'connecting' | 'connected';
    onConnect?: () => void;
    onDisconnect?: () => void;
    onUpdateFile?: (file: FileDescriptor) => void;
    onUpdateFolder?: (folder: Folder) => void;
    onDeleteFile?: (id: string) => void;
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
    const [isPopOutOpen, setIsPopOutOpen] = useState(false);
    const [config, setConfig] = useConfig();
    const { undoManager, canRedo, canUndo, undoStackSize, redoStackSize } = useUndoManager();

    // Force re-render when YDoc updates
    useYDocUpdates(yDoc);

    // Switch to content tab when connected
    useEffect(() => {
        if (connectionState === 'connected' && file?.type === 'yjs') {
            setActiveTab('content');
        }
    }, [connectionState, file?.type]);

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

    const yjsSettingsContent = (
        <div className="flex flex-col gap-3 p-3 border-b bg-muted/30">
            {/* Connection Controls */}
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Connection</span>
                <div className="flex items-center gap-2">
                    {isConnected ? (
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={onDisconnect}
                            className="h-7"
                        >
                            <WifiOff className="h-3 w-3 mr-1" />
                            Disconnect
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="default"
                            onClick={onConnect}
                            disabled={connectionState === 'connecting'}
                            className="h-7"
                        >
                            {connectionState === 'connecting' ? (
                                <>
                                    <Wifi className="h-3 w-3 mr-1 animate-pulse" />
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <Wifi className="h-3 w-3 mr-1" />
                                    Connect
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">YJS Viewer Settings</span>
            </div>
            <div className="flex flex-wrap gap-3">
                <div className="flex items-center space-x-2">
                    <Switch
                        id="parse-y-doc-switch-inspector"
                        checked={config.parseYDoc}
                        onCheckedChange={(checked) =>
                            setConfig({
                                ...config,
                                parseYDoc: checked,
                            })
                        }
                    />
                    <Label htmlFor="parse-y-doc-switch-inspector" className="text-xs">Parse</Label>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-delta-inspector"
                        checked={config.showDelta}
                        disabled={!config.parseYDoc}
                        onCheckedChange={(checked) =>
                            setConfig({
                                ...config,
                                showDelta: checked,
                            })
                        }
                    />
                    <Label htmlFor="show-delta-inspector" className="text-xs">Delta</Label>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-size-inspector"
                        checked={config.showSize}
                        onCheckedChange={(checked) =>
                            setConfig({
                                ...config,
                                showSize: checked,
                            })
                        }
                    />
                    <Label htmlFor="show-size-inspector" className="text-xs">Size</Label>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        id="editable-switch-inspector"
                        disabled={!config.parseYDoc}
                        checked={config.editable}
                        onCheckedChange={(checked) =>
                            setConfig({
                                ...config,
                                editable: checked,
                            })
                        }
                    />
                    <Label htmlFor="editable-switch-inspector" className="text-xs">Edit</Label>
                </div>
            </div>

            {config.editable && (
                <div className="flex items-center gap-2">
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
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => setIsPopOutOpen(true)}
                                    title="Pop out viewer"
                                >
                                    <Maximize2 className="h-3 w-3" />
                                </Button>
                            </>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {isFile ? file!.type.toUpperCase() : 'Folder'} • {item!.owner}
                    </p>
                </div>

                {/* YJS Settings - show when viewing a YJS file */}
                {isFile && file!.type === 'yjs' && yjsSettingsContent}

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
                                    <JsonViewerPanel
                                        value={yDoc}
                                        yDoc={yDoc}
                                        inspectDepth={2}
                                    />
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

            {/* Pop-out Dialog */}
            <Dialog open={isPopOutOpen} onOpenChange={setIsPopOutOpen}>
                <DialogContent className="max-w-[90vw] max-h-[90vh] h-[90vh] flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            {file?.title}
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
                        </DialogTitle>
                    </DialogHeader>
                    
                    {/* Settings in pop-out */}
                    {yjsSettingsContent}
                    
                    <div className="flex-1 overflow-auto min-h-0">
                        {isConnected && yDoc ? (
                            <JsonViewerPanel
                                value={yDoc}
                                yDoc={yDoc}
                                inspectDepth={3}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                                <WifiOff className="h-12 w-12 mb-4 opacity-50" />
                                <p className="text-sm text-center">
                                    {connectionState === 'connecting' 
                                        ? 'Connecting to document...' 
                                        : 'Click "Connect" above to view document content'}
                                </p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}