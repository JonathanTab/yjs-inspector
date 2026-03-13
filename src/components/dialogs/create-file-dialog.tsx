import { useState } from 'react';
import type { FileType } from '@/types/storage';
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

interface CreateFileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateFile: (title: string, type: FileType) => void;
}

export function CreateFileDialog({
    open,
    onOpenChange,
    onCreateFile,
}: CreateFileDialogProps) {
    const [title, setTitle] = useState('');
    const [type, setType] = useState<FileType>('yjs');

    const handleCreate = () => {
        if (!title.trim()) return;
        onCreateFile(title.trim(), type);
        setTitle('');
        setType('yjs');
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create New File</DialogTitle>
                    <DialogDescription>
                        Create a new document or blob file
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter file title"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>File Type</Label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="fileType"
                                    value="yjs"
                                    checked={type === 'yjs'}
                                    onChange={() => setType('yjs')}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm">Yjs Document</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="fileType"
                                    value="blob"
                                    checked={type === 'blob'}
                                    onChange={() => setType('blob')}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm">Blob File</span>
                            </label>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={!title.trim()}>
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
