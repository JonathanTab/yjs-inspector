import * as Y from 'yjs';
import { useConfig, useYDoc } from '../state/index';
import { StorageBrowser } from './storage-browser';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { WebSocketConnectProvider } from '@/providers/websocket';
import type { FileDescriptor } from '@/types/storage';

export function ConnectDialog({
    onConnect,
}: {
    onConnect: (provider: WebSocketConnectProvider, fileId: string) => void;
}) {
    const [, setYDoc] = useYDoc();
    const [config] = useConfig();

    const handleSelectFile = async (file: FileDescriptor) => {
        // Only Yjs documents have rooms
        if (file.type !== 'yjs' || !file.roomId) {
            console.warn('Selected file is not a Yjs document or has no room ID');
            return;
        }

        const doc = new Y.Doc();
        setYDoc(doc);

        const connectProvider = new WebSocketConnectProvider(
            config.documentManager.wsUrl,
            file.roomId,
            doc,
        );

        onConnect(connectProvider, file.id);
    };

    return (
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
                <DialogTitle>Connect to Document</DialogTitle>
                <DialogDescription>
                    Browse and connect to collaborative documents
                </DialogDescription>
            </DialogHeader>

            <div className="h-[60vh] overflow-hidden">
                <StorageBrowser
                    onSelectFile={handleSelectFile}
                />
            </div>
        </DialogContent>
    );
}