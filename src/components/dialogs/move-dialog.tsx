import { useState } from 'react';
import type { Folder } from '@/types/storage';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Folder as FolderIcon, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MoveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemName: string;
    folders: Folder[];
    currentFolderId: string | null;
    onMove: (folderId: string | null) => void;
}

interface TreeNode {
    folder: Folder;
    children: TreeNode[];
}

function buildTree(folders: Folder[]): TreeNode[] {
    const folderMap = new Map<string, TreeNode>();

    folders.forEach((folder) => {
        folderMap.set(folder.id, { folder, children: [] });
    });

    const rootNodes: TreeNode[] = [];
    folderMap.forEach((node) => {
        if (node.folder.parentId) {
            const parent = folderMap.get(node.folder.parentId);
            if (parent) {
                parent.children.push(node);
            } else {
                rootNodes.push(node);
            }
        } else {
            rootNodes.push(node);
        }
    });

    return rootNodes;
}

function FolderNode({
    node,
    depth,
    selectedFolderId,
    onSelect,
    expandedFolders,
    toggleExpand,
}: {
    node: TreeNode;
    depth: number;
    selectedFolderId: string | null;
    onSelect: (folderId: string | null) => void;
    expandedFolders: Set<string>;
    toggleExpand: (id: string) => void;
}) {
    const isExpanded = expandedFolders.has(node.folder.id);
    const isSelected = selectedFolderId === node.folder.id;
    const hasChildren = node.children.length > 0;

    return (
        <div>
            <div
                className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer hover:bg-accent',
                    isSelected && 'bg-primary/10 ring-1 ring-primary',
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
                {hasChildren ? (
                    <button
                        className="p-0.5 hover:bg-accent-foreground/10 rounded"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(node.folder.id);
                        }}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                    </button>
                ) : (
                    <span className="w-4" />
                )}
                <FolderIcon className="h-4 w-4 text-muted-foreground" />
                <span
                    className="truncate text-sm flex-1"
                    onClick={() => onSelect(node.folder.id)}
                >
                    {node.folder.name}
                </span>
            </div>
            {isExpanded && (
                <div>
                    {node.children.map((child) => (
                        <FolderNode
                            key={child.folder.id}
                            node={child}
                            depth={depth + 1}
                            selectedFolderId={selectedFolderId}
                            onSelect={onSelect}
                            expandedFolders={expandedFolders}
                            toggleExpand={toggleExpand}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function MoveDialog({
    open,
    onOpenChange,
    itemName,
    folders,
    currentFolderId,
    onMove,
}: MoveDialogProps) {
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleMove = () => {
        onMove(selectedFolderId);
        onOpenChange(false);
    };

    const tree = buildTree(folders);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Move "{itemName}"</DialogTitle>
                    <DialogDescription>
                        Select a destination folder
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Root folder option */}
                    <div
                        className={cn(
                            'flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer hover:bg-accent',
                            selectedFolderId === null && 'bg-primary/10 ring-1 ring-primary',
                        )}
                        onClick={() => setSelectedFolderId(null)}
                    >
                        <span className="w-4" />
                        <FolderIcon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Root (No folder)</span>
                    </div>

                    {/* Folder tree */}
                    <div className="border rounded-md max-h-64 overflow-auto">
                        {tree.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground text-center">
                                No folders available
                            </div>
                        ) : (
                            <div className="py-2">
                                {tree.map((node) => (
                                    <FolderNode
                                        key={node.folder.id}
                                        node={node}
                                        depth={0}
                                        selectedFolderId={selectedFolderId}
                                        onSelect={setSelectedFolderId}
                                        expandedFolders={expandedFolders}
                                        toggleExpand={toggleExpand}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="text-sm text-muted-foreground">
                        Destination: {selectedFolderId
                            ? folders.find(f => f.id === selectedFolderId)?.name || 'Unknown'
                            : 'Root'}
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleMove}>
                        Move Here
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}