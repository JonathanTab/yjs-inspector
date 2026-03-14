import { useState } from 'react';
import { useConfig } from '@/state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Check, X, User, Shield, XCircle, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ConnectionPanelProps {
    onConnect: () => void;
    onDisconnect: () => void;
    isConnected: boolean;
}

export function ConnectionPanel({
    onConnect,
    onDisconnect,
    isConnected,
}: ConnectionPanelProps) {
    const [config, setConfig] = useConfig();
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const base = config.documentManager.baseUrl || '';
            const key  = config.documentManager.apiKey;
            const url  = `${base}/storage.php?action=users&apikey=${encodeURIComponent(key)}`;
            const response = await fetch(url, { credentials: 'include' });
            const data = await response.json();

            if (!response.ok || data.error) {
                setTestResult('error');
            } else {
                setTestResult('success');
            }
        } catch {
            setTestResult('error');
        } finally {
            setTesting(false);
        }
    };

    const updateConfig = (key: string, value: string | boolean | null) => {
        setConfig({
            ...config,
            documentManager: {
                ...config.documentManager,
                [key]: value,
            },
        });
    };

    const clearImpersonation = () => {
        updateConfig('impersonateUser', null);
    };

    return (
        <div className="w-full max-w-md space-y-4 p-4 border rounded-lg">
            <div>
                <h2 className="text-lg font-semibold">Connection Settings</h2>
                <p className="text-sm text-muted-foreground">
                    Configure your connection to the document storage server
                </p>
            </div>

            <div className="space-y-4">
                {/* Server URL */}
                <div className="space-y-2">
                    <Label htmlFor="baseUrl">Server URL</Label>
                    <Input
                        id="baseUrl"
                        value={config.documentManager.baseUrl || ''}
                        onChange={(e) => updateConfig('baseUrl', e.target.value)}
                        placeholder="https://example.com"
                        disabled={isConnected}
                    />
                </div>

                {/* API Key */}
                <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                        id="apiKey"
                        type="password"
                        value={config.documentManager.apiKey || ''}
                        onChange={(e) => updateConfig('apiKey', e.target.value)}
                        placeholder="Enter your API key"
                        disabled={isConnected}
                    />
                </div>

                {/* WebSocket URL */}
                <div className="space-y-2">
                    <Label htmlFor="wsUrl">WebSocket URL</Label>
                    <Input
                        id="wsUrl"
                        value={config.documentManager.wsUrl || ''}
                        onChange={(e) => updateConfig('wsUrl', e.target.value)}
                        placeholder="wss://example.com/congruum/"
                        disabled={isConnected}
                    />
                </div>

                {/* Blob Storage URL */}
                <div className="space-y-2">
                    <Label htmlFor="blobStorageUrl">Blob Storage URL</Label>
                    <Input
                        id="blobStorageUrl"
                        value={config.documentManager.blobStorageUrl || ''}
                        onChange={(e) => updateConfig('blobStorageUrl', e.target.value)}
                        placeholder="https://example.com/api"
                        disabled={isConnected}
                    />
                </div>

                {/* Admin Mode Toggle */}
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            <Label htmlFor="adminMode" className="text-sm font-medium">
                                Show All Files (Admin Mode)
                            </Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            View all documents across all users
                        </p>
                    </div>
                    <Switch
                        id="adminMode"
                        checked={config.documentManager.adminMode}
                        onCheckedChange={(checked) => updateConfig('adminMode', checked)}
                        disabled={isConnected}
                    />
                </div>

                {/* Admin Mode Status */}
                {config.documentManager.adminMode && (
                    <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-amber-600" />
                        <Badge variant="outline" className="border-amber-600 text-amber-600">
                            Admin Mode Active - Viewing All Files
                        </Badge>
                    </div>
                )}

                {/* Impersonate User */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <Label htmlFor="impersonateUser">Impersonate User (Optional)</Label>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            id="impersonateUser"
                            type="text"
                            autoComplete="off"
                            data-form-type="other"
                            data-lpignore="true"
                            value={config.documentManager.impersonateUser || ''}
                            onChange={(e) =>
                                updateConfig('impersonateUser', e.target.value || null)
                            }
                            placeholder="Enter username to view as that user"
                            disabled={isConnected}
                            className="flex-1"
                        />
                        {config.documentManager.impersonateUser && !isConnected && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={clearImpersonation}
                                title="Clear impersonation"
                            >
                                <XCircle className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        View files as another user would see them
                    </p>
                </div>

                {/* Test Result */}
                {testResult && (
                    <div
                        className={`flex items-center gap-2 p-2 rounded ${
                            testResult === 'success'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}
                    >
                        {testResult === 'success' ? (
                            <>
                                <Check className="h-4 w-4" />
                                <span className="text-sm">Connection successful</span>
                            </>
                        ) : (
                            <>
                                <X className="h-4 w-4" />
                                <span className="text-sm">Connection failed</span>
                            </>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={testing || !config.documentManager.apiKey}
                    >
                        {testing ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Test Connection
                    </Button>

                    {isConnected ? (
                        <Button variant="destructive" onClick={onDisconnect}>
                            Disconnect
                        </Button>
                    ) : (
                        <Button
                            onClick={onConnect}
                            disabled={!config.documentManager.apiKey}
                        >
                            Connect
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}