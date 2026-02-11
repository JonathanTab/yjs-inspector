import { createDocumentManagerApi } from "@/lib/document-manager-api";
import * as Y from "yjs";
import { useConfig, useYDoc } from "../state/index";
import { DocumentBrowser } from "./document-browser";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { WebSocketConnectProvider } from "@/providers/websocket";

export function ConnectDialog({
  onConnect,
}: {
  onConnect: (provider: WebSocketConnectProvider) => void;
}) {
  const [, setYDoc] = useYDoc();
  const [config, setConfig] = useConfig();

  const handleSelectDocument = async (id: string, version: string) => {
    // Use the document manager API to get the room for this version
    const api = createDocumentManagerApi(config.documentManager);
    const result = await api.getRoom(id, version);
    const selectedRoom = result.room;

    // Create WebSocket URL from base URL
    const wsUrl = config.documentManager.baseUrl.replace(/^http/, "ws") + "/congruum/";

    const doc = new Y.Doc();
    setYDoc(doc);

    const connectProvider = new WebSocketConnectProvider(
      wsUrl,
      selectedRoom,
      doc,
    );

    onConnect(connectProvider);
  };

  const handleCreateDocument = () => {
    // TODO: Implement create document dialog
    console.log("Create document not implemented yet");
  };

  return (
    <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
      <DialogHeader>
        <DialogTitle>Connect to Document</DialogTitle>
        <DialogDescription>
          Browse and connect to collaborative documents
        </DialogDescription>
      </DialogHeader>

      <DocumentBrowser
        config={config.documentManager}
        onConfigChange={(newConfig) =>
          setConfig({
            ...config,
            documentManager: {
              ...config.documentManager,
              ...newConfig,
            },
          })
        }
        onSelectDocument={handleSelectDocument}
        onCreateDocument={handleCreateDocument}
      />
    </DialogContent>
  );
}
