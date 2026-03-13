import { useState } from 'react';
import type { Folder } from '@/types/storage';
import {
    Folder as FolderIcon,
    FolderOpen,
    ChevronRight,
    ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FolderTreeProps {
    folders: Folder[];
    selectedFolderId: string | null;
    onSelectFolder: (folder: Folder) => void;
}

interface TreeNode {
    folder: Folder;
    children: TreeNode[];
}

function buildTree(folders: Folder[]): TreeNode[] {
    const folderMap = new Map<string, TreeNode>();

    // Create nodes for all folders
    folders.forEach((folder) => {
        folderMap.set(folder.id, { folder, children: [] });
    });

    // Build tree structure
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
    onSelectFolder,
    expandedFolders,
    toggleExpand,
}: {
    node: TreeNode;
    depth: number;
    selectedFolderId: string | null;
    onSelectFolder: (folder: Folder) => void;
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
                    isSelected && 'bg-accent',
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => onSelectFolder(node.folder)}
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
                {isSelected ? (
                    <FolderOpen className="h-4 w-4 text-primary" />
                ) : (
                    <FolderIcon className="h-4 w-4" />
                )}
                <span className="truncate text-sm">{node.folder.name}</span>
            </div>
            {isExpanded && (
                <div>
                    {node.children.map((child) => (
                        <FolderNode
                            key={child.folder.id}
                            node={child}
                            depth={depth + 1}
                            selectedFolderId={selectedFolderId}
                            onSelectFolder={onSelectFolder}
                            expandedFolders={expandedFolders}
                            toggleExpand={toggleExpand}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function FolderTree({
    folders,
    selectedFolderId,
    onSelectFolder,
}: FolderTreeProps) {
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

    const tree = buildTree(folders);

    if (tree.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-muted-foreground">
                <FolderIcon className="h-8 w-8 mb-2" />
                <p className="text-sm text-center">No folders yet</p>
            </div>
        );
    }

    return (
        <div className="py-2">
            {/* Root folder option */}
            <div
                className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer hover:bg-accent',
                    selectedFolderId === null && 'bg-accent',
                )}
                onClick={() => onSelectFolder({ id: '', name: 'Root', parentId: null, owner: '', permissions: [], sharedWith: [], createdAt: null, updatedAt: null, publicRead: false, publicWrite: false })}
            >
                <span className="w-4" />
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">All Files</span>
            </div>
            {tree.map((node) => (
                <FolderNode
                    key={node.folder.id}
                    node={node}
                    depth={0}
                    selectedFolderId={selectedFolderId}
                    onSelectFolder={onSelectFolder}
                    expandedFolders={expandedFolders}
                    toggleExpand={toggleExpand}
                />
            ))}
        </div>
    );
}