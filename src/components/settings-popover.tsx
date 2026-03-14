import { useState } from 'react';
import { useConfig } from '@/state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Loader2,
    Check,
    X,
    Settings,
} from 'lucide-react';

export function SettingsPopover() {
    const [config, setConfig] = useConfig();
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const base = config.documentManager.baseUrl || '';
            const key = config.documentManager.apiKey;
            const url = `${base}/storage.php?action=users&apikey=${encodeURIComponent(key)}`;
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

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-80"
                align="start"
                side="bottom"
                sideOffset={8}
            >
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">Connection Settings</h4>
                    </div>

                    {/* Server URL */}
                    <div className="space-y-1.5">
                        <Label htmlFor="baseUrl" className="text-xs">Server URL</Label>
                        <Input
                            id="baseUrl"
                            value={config.documentManager.baseUrl || ''}
                            onChange={(e) => updateConfig('baseUrl', e.target.value)}
                            placeholder="https://example.com"
                            className="h-8 text-sm"
                        />
                    </div>

                    {/* API Key */}
                    <div className="space-y-1.5">
                        <Label htmlFor="apiKey" className="text-xs">API Key</Label>
                        <Input
                            id="apiKey"
                            type="password"
                            value={config.documentManager.apiKey || ''}
                            onChange={(e) => updateConfig('apiKey', e.target.value)}
                            placeholder="Enter your API key"
                            className="h-8 text-sm"
                        />
                    </div>

                    {/* WebSocket URL */}
                    <div className="space-y-1.5">
                        <Label htmlFor="wsUrl" className="text-xs">WebSocket URL</Label>
                        <Input
                            id="wsUrl"
                            value={config.documentManager.wsUrl || ''}
                            onChange={(e) => updateConfig('wsUrl', e.target.value)}
                            placeholder="wss://example.com/congruum/"
                            className="h-8 text-sm"
                        />
                    </div>

                    {/* Blob Storage URL */}
                    <div className="space-y-1.5">
                        <Label htmlFor="blobStorageUrl" className="text-xs">Blob Storage URL</Label>
                        <Input
                            id="blobStorageUrl"
                            value={config.documentManager.blobStorageUrl || ''}
                            onChange={(e) => updateConfig('blobStorageUrl', e.target.value)}
                            placeholder="https://example.com/api"
                            className="h-8 text-sm"
                        />
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <div
                            className={`flex items-center gap-2 p-2 rounded text-xs ${
                                testResult === 'success'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}
                        >
                            {testResult === 'success' ? (
                                <>
                                    <Check className="h-3 w-3" />
                                    <span>Connection test successful</span>
                                </>
                            ) : (
                                <>
                                    <X className="h-3 w-3" />
                                    <span>Connection test failed</span>
                                </>
                            )}
                        </div>
                    )}

                    {/* Test Button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestConnection}
                        disabled={testing || !config.documentManager.apiKey}
                        className="w-full"
                    >
                        {testing ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-2" />
                        ) : null}
                        Test Connection
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}