import * as Y from "yjs";
import { useState, useCallback, useEffect } from "react";
import { Header } from "./components/site-header";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/toaster";
import { StorageBrowser } from "./components/storage-browser";
import { InspectorPanel } from "./components/inspector";
import { AdminStats } from "./components/admin";
import { AdminOptions } from "./components/admin-options";
import { SettingsPopover } from "./components/settings-popover";
import { useSelectedFile, useSelectedFolder, useFiles, useFolders, useConnectionConfig, useConfig } from "./state";
import { createServerApi } from "./lib/server-api";
import { RotateCw, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, Shield, User, Wifi, WifiOff } from "lucide-react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import type { FileDescriptor, Folder, ConnectionConfig } from "./types/storage";
import { WebSocketConnectProvider } from "./providers/websocket";
import { useYDoc } from "./state";

function useConnectionState() {
    const [state, setState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
    const [provider, setProvider] = useState<WebSocketConnectProvider | null>(null);
    const [connectedFileId, setConnectedFileId] = useState<string | null>(null);

    const connect = useCallback((newProvider: WebSocketConnectProvider, fileId: string) => {
        setState("connecting");
        setProvider(newProvider);
        setConnectedFileId(fileId);
        newProvider.connect();
        newProvider.waitForSynced().then(() => {
            setState("connected");
        }).catch((err) => {
            console.error("Connection failed:", err);
            setState("disconnected");
            setProvider(null);
            setConnectedFileId(null);
        });
    }, []);

    const disconnect = useCallback(() => {
        if (provider) {
            provider.disconnect();
            setProvider(null);
        }
        setState("disconnected");
        setConnectedFileId(null);
    }, [provider]);

    return { state, provider, connect, disconnect, connectedFileId };
}

export function App() {
    const [selectedFile, setSelectedFile] = useSelectedFile();
    const [selectedFolder, setSelectedFolder] = useSelectedFolder();
    const [files, setFiles] = useFiles();
    const [folders, setFolders] = useFolders();
    const [connectionConfig] = useConnectionConfig();
    const [config] = useConfig();
    const [yDoc, setYDoc] = useYDoc();
    
    const { state: connectionState, provider, connect, disconnect, connectedFileId } = useConnectionState();
    
    const [showLeftPanel, setShowLeftPanel] = useState(true);
    const [showRightPanel, setShowRightPanel] = useState(true);

    // Sync files and folders from server
    const sync = useCallback(async () => {
        if (!connectionConfig.apiKey) return;
        
        try {
            const api = createServerApi(connectionConfig as ConnectionConfig);
            const result = await api.fullSync();
            setFiles(result.documents);
            setFolders(result.folders);
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }, [connectionConfig, setFiles, setFolders]);

    // Initial sync when API key is configured
    useEffect(() => {
        if (connectionConfig.apiKey && files.length === 0) {
            sync();
        }
    }, [connectionConfig.apiKey, files.length, sync]);

    const handleSelectFile = useCallback((file: FileDescriptor) => {
        setSelectedFile(file);
        setSelectedFolder(null);
        // Don't auto-connect - user must explicitly connect via inspector panel
    }, [setSelectedFile, setSelectedFolder]);

    // Handler for when InspectorPanel creates a new connection
    const handleConnect = useCallback((newProvider: WebSocketConnectProvider, fileId: string) => {
        // Disconnect from previous document if any
        if (provider) {
            provider.disconnect();
        }
        
        connect(newProvider, fileId);
    }, [connect, provider]);

    const handleSelectFolder = useCallback((folder: Folder) => {
        setSelectedFolder(folder);
        setSelectedFile(null);
    }, [setSelectedFolder, setSelectedFile]);

    const handleDisconnect = useCallback(() => {
        disconnect();
        setYDoc(new Y.Doc()); // Reset to empty doc
    }, [disconnect, setYDoc]);

    return (
        <ThemeProvider>
            <div className="flex h-screen flex-col">
                <Header />
                
                {/* Toolbar */}
                <div className="flex items-center gap-2 border-b px-4 py-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowLeftPanel(!showLeftPanel)}
                        title={showLeftPanel ? "Hide sidebar" : "Show sidebar"}
                    >
                        {showLeftPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                    </Button>

                    <div className="flex-1" />

                    {/* Connection Status */}
                    {connectionState !== 'disconnected' && selectedFile && (
                        <div className="flex items-center gap-2 mr-2">
                            {connectionState === 'connecting' ? (
                                <Badge variant="outline" className="gap-1">
                                    <RotateCw className="h-3 w-3 animate-spin" />
                                    Connecting to {selectedFile.title}
                                </Badge>
                            ) : (
                                <Badge className="bg-green-600 gap-1">
                                    <Wifi className="h-3 w-3" />
                                    Connected: {selectedFile.title}
                                </Badge>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDisconnect}
                                className="h-6 px-2"
                            >
                                <WifiOff className="h-3 w-3 mr-1" />
                                Disconnect
                            </Button>
                        </div>
                    )}

                    {/* Admin Mode Badge */}
                    <div className="flex items-center gap-2 text-sm">
                        <Badge className="bg-green-600 gap-1">
                            <Shield className="h-3 w-3" />
                            Admin Mode
                        </Badge>
                        {config.documentManager.impersonateUser && (
                            <Badge variant="outline" className="gap-1">
                                <User className="h-3 w-3" />
                                {config.documentManager.impersonateUser}
                            </Badge>
                        )}
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowRightPanel(!showRightPanel)}
                        title={showRightPanel ? "Hide inspector" : "Show inspector"}
                    >
                        {showRightPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
                    </Button>
                </div>

                {/* Main content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left panel - Settings & Admin Stats */}
                    {showLeftPanel && (
                        <div className="w-80 border-r overflow-auto">
                            <div className="p-4 space-y-4">
                                {/* Settings Button */}
                                <SettingsPopover />
                                
                                {/* Admin Options */}
                                <AdminOptions />
                            </div>
                            
                            {/* Admin Stats - show when connected */}
                            {connectionConfig.apiKey && (
                                <div className="border-t p-4">
                                    <AdminStats />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Center panel - Storage Browser (always visible) */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <StorageBrowser
                            onSelectFile={handleSelectFile}
                            onSelectFolder={handleSelectFolder}
                            connectedFileId={connectedFileId}
                            onRefresh={sync}
                        />
                    </div>

                    {/* Right panel - Inspector */}
                    {showRightPanel && (
                        <div className="w-96 border-l overflow-auto">
                            <InspectorPanel
                                file={selectedFile}
                                folder={selectedFolder}
                                yDoc={connectionState === 'connected' ? yDoc : null}
                                connectionState={connectionState}
                                onConnect={handleConnect}
                                onDisconnect={handleDisconnect}
                                onUpdateFile={(updated) => {
                                    setFiles(files.map(f => f.id === updated.id ? updated : f));
                                    if (selectedFile?.id === updated.id) setSelectedFile(updated);
                                }}
                                onUpdateFolder={(updated) => {
                                    setFolders(folders.map(f => f.id === updated.id ? updated : f));
                                    if (selectedFolder?.id === updated.id) setSelectedFolder(updated);
                                }}
                                onDeleteFile={(id) => {
                                    setFiles(files.filter(f => f.id !== id));
                                    if (selectedFile?.id === id) setSelectedFile(null);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
            <Toaster />
        </ThemeProvider>
    );
}

// For debugging
(globalThis as any).Y = Y;
console.info("Tip: You can access Yjs via 'Y' in the console for debugging");
