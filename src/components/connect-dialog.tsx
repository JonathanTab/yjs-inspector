import { BlocksuiteWebsocketProvider } from "@/providers/blocksuite/provider";
import { WebSocketConnectProvider } from "@/providers/websocket";
import { RocketIcon, TriangleAlert } from "lucide-react";
import { useState } from "react";
import * as Y from "yjs";
import { ConnectProvider } from "../providers/types";
import { useConfig, useYDoc } from "../state/index";
import { DocumentBrowser } from "./document-browser";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";

// Hardcoded in the playground of blocksuite
// See https://github.com/toeverything/blocksuite/blob/db6e9d278e4d821e1d5aea912681e8fd1692b39e/packages/playground/apps/default/utils/collection.ts#L66
const BLOCKSUITE_PLAYGROUND_DOC_GUID = "collabPlayground";
const BLOCKSUITE_NAME = "Blocksuite Playground";

const dailyRoomSuffix = new Date().toLocaleDateString("en-CA");
const createDailyRoom = (prefix: string) => `${prefix}-${dailyRoomSuffix}`;

const officialDemos = [
  {
    name: "ProseMirror",
    room: createDailyRoom("prosemirror-demo"),
    url: "wss://demos.yjs.dev/ws",
    demoUrl: "https://demos.yjs.dev/prosemirror/prosemirror.html",
  },
  {
    name: "ProseMirror with Version History",
    room: createDailyRoom("prosemirror-versions-demo"),
    url: "wss://demos.yjs.dev/ws",
    demoUrl:
      "https://demos.yjs.dev/prosemirror-versions/prosemirror-versions.html",
  },
  {
    name: "Quill",
    room: createDailyRoom("quill-demo"),
    url: "wss://demos.yjs.dev/ws",
    demoUrl: "https://demos.yjs.dev/quill/quill.html",
  },
  {
    name: "Monaco",
    room: createDailyRoom("monaco-demo"),
    url: "wss://demos.yjs.dev/ws",
    demoUrl: "https://demos.yjs.dev/monaco/monaco.html",
  },
  {
    name: "CodeMirror",
    room: createDailyRoom("codemirror-demo"),
    url: "wss://demos.yjs.dev/ws",
    demoUrl: "https://demos.yjs.dev/codemirror/codemirror.html",
  },
  {
    name: "CodeMirror 6",
    room: createDailyRoom("codemirror.next-demo"),
    url: "wss://demos.yjs.dev/ws",
    demoUrl: "https://demos.yjs.dev/codemirror.next/codemirror.next.html",
  },
  {
    name: BLOCKSUITE_NAME,
    room: "",
    url: "wss://blocksuite-playground.toeverything.workers.dev",
    demoUrl: "https://try-blocksuite.vercel.app",
    custom: true,
  },
];

export function ConnectDialog({
  onConnect,
}: {
  onConnect: (provider: ConnectProvider) => void;
}) {
  const [yDoc, setYDoc] = useYDoc();
  const [config, setConfig] = useConfig();
  const [url, setUrl] = useState("wss://demos.yjs.dev/ws");
  const [room, setRoom] = useState(() => createDailyRoom("quill-demo"));
  const [provider, setProvider] = useState("Quill");
  const [needCreateNewDoc, setNeedCreateNewDoc] = useState(true);

  const officialDemo = officialDemos.find((demo) => demo.name === provider);

  const handleCreateDocument = () => {
    // TODO: Implement create document dialog
    console.log("Create document not implemented yet");
  };

  const handleSelectDocument = (selectedRoom: string) => {
    // Use the same connection flow as custom WebSocket
    const doc = new Y.Doc();
    setYDoc(doc);

    // Create WebSocket URL from base URL: wss://instrumenta.cf/congruum/
    const wsUrl = config.documentManager.baseUrl.replace(/^http/, "ws") + "/congruum/";

    const connectProvider = new WebSocketConnectProvider(
      wsUrl,
      selectedRoom,
      doc,
    );

    onConnect(connectProvider);
  };

  return (
    <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
      <DialogHeader>
        <DialogTitle>Connect to Document</DialogTitle>
        <DialogDescription>
          Browse and connect to collaborative documents
        </DialogDescription>
      </DialogHeader>

      <div className="flex gap-6 h-[600px]">
        {/* Sidebar - Configuration */}
        <div className="w-80 flex flex-col gap-4">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Provider Type</Label>
              <Select
                value={provider}
                onValueChange={(value) => {
                  setProvider(value);
                  const demo = officialDemos.find((demo) => demo.name === value);
                  if (demo) {
                    setUrl(demo.url);
                    setRoom(demo.room);
                    return;
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="document-manager">
                    📁 Document Manager (instrumenta.cf)
                  </SelectItem>
                  <SelectItem value="y-websocket">🔗 Custom WebSocket</SelectItem>
                  <SelectItem value="y-webrtc" disabled>
                    📡 WebRTC (coming soon)
                  </SelectItem>
                  {officialDemos
                    .filter((i) => i.name !== BLOCKSUITE_NAME)
                    .map((demo) => (
                      <SelectItem key={demo.name} value={demo.name}>
                        {demo.name}
                      </SelectItem>
                    ))}
                  <SelectItem value={BLOCKSUITE_NAME}>
                    {BLOCKSUITE_NAME}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {provider === "document-manager" ? (
              <>
                <div>
                  <Label htmlFor="dm-base-url" className="text-sm font-medium">
                    Base URL
                  </Label>
                  <Input
                    id="dm-base-url"
                    value={config.documentManager.baseUrl}
                    onInput={(e) =>
                      setConfig({
                        ...config,
                        documentManager: {
                          ...config.documentManager,
                          baseUrl: e.currentTarget.value,
                        },
                      })
                    }
                    placeholder="https://instrumenta.cf"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="dm-api-key" className="text-sm font-medium">
                    API Key
                  </Label>
                  <Input
                    id="dm-api-key"
                    type="password"
                    value={config.documentManager.apiKey}
                    onInput={(e) =>
                      setConfig({
                        ...config,
                        documentManager: {
                          ...config.documentManager,
                          apiKey: e.currentTarget.value,
                        },
                      })
                    }
                    placeholder="Optional API key"
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="dm-admin-mode"
                    checked={config.documentManager.adminMode}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        documentManager: {
                          ...config.documentManager,
                          adminMode: checked,
                        },
                      })
                    }
                  />
                  <Label htmlFor="dm-admin-mode" className="text-sm font-medium">
                    Admin Mode
                  </Label>
                </div>
                <p className="text-xs text-gray-600">
                  Show all documents from all users
                </p>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="url-input" className="text-sm font-medium">
                    WebSocket URL
                  </Label>
                  <Input
                    id="url-input"
                    value={url}
                    disabled={!!officialDemo}
                    onInput={(e) => setUrl(e.currentTarget.value)}
                    placeholder="wss://demos.yjs.dev/ws"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="room-input" className="text-sm font-medium">
                    Room Name
                  </Label>
                  <Input
                    id="room-input"
                    className="mt-1"
                    disabled={!!officialDemo && !officialDemo.custom}
                    value={room}
                    onInput={(e) => setRoom(e.currentTarget.value)}
                    placeholder="Please enter a room name"
                  />
                </div>
              </>
            )}

            <div className="border-t pt-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="create-new-doc"
                  checked={needCreateNewDoc}
                  onCheckedChange={(value) => setNeedCreateNewDoc(value)}
                />
                <Label htmlFor="create-new-doc" className="text-sm font-medium">
                  Create New Document
                </Label>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Create a fresh YDoc instead of using existing one
              </p>
            </div>

            {!needCreateNewDoc && (
              <Alert variant="destructive" className="text-xs">
                <TriangleAlert className="h-3 w-3" />
                <AlertDescription>
                  This may contaminate the remote YDoc
                </AlertDescription>
              </Alert>
            )}

            {officialDemo && (
              <Alert className="text-xs">
                <RocketIcon className="h-3 w-3" />
                <AlertDescription>
                  <a
                    className="text-primary underline"
                    href={officialDemo.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Try the {officialDemo.name} demo
                  </a>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        {/* Main Content - Document Browser */}
        <div className="flex-1 border-l pl-6">
          {provider === "document-manager" ? (
            <DocumentBrowser
              config={config.documentManager}
              onSelectDocument={handleSelectDocument}
              onCreateDocument={handleCreateDocument}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="max-w-md">
                <h3 className="text-lg font-medium mb-2">
                  {provider === "y-websocket"
                    ? "Custom WebSocket Connection"
                    : provider === "y-webrtc"
                      ? "WebRTC Connection (Coming Soon)"
                      : officialDemo?.name || "Custom Connection"}
                </h3>
                <p className="text-gray-600 mb-6">
                  Configure your connection settings in the sidebar and click
                  connect below.
                </p>

                <div className="space-y-4">
                  <Button
                    disabled={!url || !room}
                    onClick={async () => {
                      const doc = needCreateNewDoc
                        ? new Y.Doc(
                            provider === BLOCKSUITE_NAME
                              ? { guid: BLOCKSUITE_PLAYGROUND_DOC_GUID }
                              : undefined,
                          )
                        : yDoc;
                      setYDoc(doc);

                      if (provider === BLOCKSUITE_NAME) {
                        const ws = new WebSocket(
                          new URL(`/room/${room}`, url),
                        );
                        await new Promise((resolve, reject) => {
                          ws.addEventListener("open", resolve);
                          ws.addEventListener("error", reject);
                        });
                        const connectProvider =
                          new BlocksuiteWebsocketProvider(ws, doc);
                        onConnect(connectProvider);
                        return;
                      }

                      const connectProvider = new WebSocketConnectProvider(
                        url,
                        room,
                        doc,
                      );

                      onConnect(connectProvider);
                    }}
                    className="w-full"
                  >
                    Connect
                  </Button>

                  {officialDemo && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        window.open(officialDemo.demoUrl, "_blank")
                      }
                      className="w-full"
                    >
                      Try Demo
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
}
