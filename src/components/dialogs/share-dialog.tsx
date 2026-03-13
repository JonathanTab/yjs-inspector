import { useState } from 'react';
import type { Permission } from '@/types/storage';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface ShareDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemName: string;
    sharedWith: Array<{ username: string; permissions: Permission[] }>;
    onShare: (username: string, permissions: Permission[]) => void;
    onRevoke: (username: string) => void;
}

export function ShareDialog({
    open,
    onOpenChange,
    itemName,
    sharedWith,
    onShare,
    onRevoke,
}: ShareDialogProps) {
    const [username, setUsername] = useState('');
    const [readPermission, setReadPermission] = useState(true);
    const [writePermission, setWritePermission] = useState(false);

    const handleShare = () => {
        if (!username.trim()) return;
        const permissions: Permission[] = [];
        if (readPermission) permissions.push('read');
        if (writePermission) permissions.push('write');
        if (permissions.length === 0) return;

        onShare(username.trim(), permissions);
        setUsername('');
        setReadPermission(true);
        setWritePermission(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Share "{itemName}"</DialogTitle>
                    <DialogDescription>
                        Share this item with other users
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Current shares */}
                    {sharedWith.length > 0 && (
                        <div className="space-y-2">
                            <Label>Shared With</Label>
                            <div className="space-y-2">
                                {sharedWith.map((share) => (
                                    <div
                                        key={share.username}
                                        className="flex items-center justify-between p-2 bg-muted rounded"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">{share.username}</span>
                                            <div className="flex gap-1">
                                                {share.permissions.map((perm) => (
                                                    <Badge key={perm} variant="outline" className="text-xs">
                                                        {perm}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => onRevoke(share.username)}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add new share */}
                    <div className="space-y-2">
                        <Label>Add User</Label>
                        <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Permissions</Label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={readPermission}
                                    onChange={(e) => setReadPermission(e.target.checked)}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm">Read</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={writePermission}
                                    onChange={(e) => setWritePermission(e.target.checked)}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm">Write</span>
                            </label>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Done
                    </Button>
                    <Button
                        onClick={handleShare}
                        disabled={!username.trim() || (!readPermission && !writePermission)}
                    >
                        Share
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}