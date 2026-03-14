import { useState, useEffect } from 'react';
import * as Y from 'yjs';
import type { FileDescriptor, Folder } from '@/types/storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetadataInspector } from './metadata-inspector';
import { PermissionsInspector } from './permissions-inspector';
import { VersionsInspector } from './versions-inspector';
import { BlobInspector } from './blob-inspector';
import { FileText, Lock, History, FileImage, Code, Wifi, WifiOff } from 'lucide-react';
import { JsonViewer } from '@textea/json-viewer';
import { useTheme } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';

interface InspectorPanelProps {
    file: FileDescriptor | null;
    folder: Folder | null;
    yDoc?: Y.Doc | null;
    connectionState?: 'disconnected' | 'connecting' | 'connected';
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
    onUpdateFile,
    onUpdateFolder,
    onDeleteFile,
}: InspectorPanelProps) {
    const [activeTab, setActiveTab] = useState('metadata');
    const { resolvedTheme } = useTheme();

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

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b p-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold truncate flex-1">
                        {isFile ? file!.title : folder!.name}
                    </h2>
                    {isFile && file!.type === 'yjs' && (
                        isConnected ? (
                            <Badge className="bg-green-600 gap-1">
                                <Wifi className="h-3 w-3" />
                                Connected
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1">
                                <WifiOff className="h-3 w-3" />
                                Disconnected
                            </Badge>
                        )
                    )}
                </div>
                <p className="text-sm text-muted-foreground">
                    {isFile ? file!.type.toUpperCase() : 'Folder'} • {item!.owner}
                </p>
            </div>

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
                                <div className="p-2">
                                    <JsonViewer
                                        value={yDoc}
                                        theme={resolvedTheme}
                                        defaultInspectDepth={2}
                                        className="text-sm"
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-4">
                                    <WifiOff className="h-8 w-8 mb-2 opacity-50" />
                                    <p className="text-sm text-center">
                                        {connectionState === 'connecting' 
                                            ? 'Connecting to document...' 
                                            : 'Click on the document to connect and view content'}
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
    );
}