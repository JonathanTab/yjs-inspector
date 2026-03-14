import { useConfig } from '@/state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Eye, User, Shield, XCircle } from 'lucide-react';

export function AdminOptions() {
    const [config, setConfig] = useConfig();

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
        <div className="space-y-3">
            {/* Admin Mode Toggle */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5" />
                    <Label htmlFor="adminMode" className="text-xs font-medium">Admin Mode</Label>
                </div>
                <Switch
                    id="adminMode"
                    checked={config.documentManager.adminMode}
                    onCheckedChange={(checked) => updateConfig('adminMode', checked)}
                />
            </div>

            {/* Admin Mode Status */}
            {config.documentManager.adminMode && (
                <div className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3 text-amber-600" />
                    <Badge variant="outline" className="border-amber-600 text-amber-600 text-[10px]">
                        Viewing All Files
                    </Badge>
                </div>
            )}

            {/* Impersonate User */}
            <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5" />
                    <Label htmlFor="impersonateUser" className="text-xs font-medium">Impersonate User</Label>
                </div>
                <div className="flex gap-1.5">
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
                        placeholder="Username"
                        className="h-8 text-sm flex-1"
                    />
                    {config.documentManager.impersonateUser && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearImpersonation}
                            title="Clear"
                            className="h-8 w-8"
                        >
                            <XCircle className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}