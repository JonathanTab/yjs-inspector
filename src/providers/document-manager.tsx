import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { ConnectProvider } from "./types";
import { DocumentManagerConfig, createDocumentManagerApi } from "../lib/document-manager-api";

export class DocumentManagerProvider implements ConnectProvider {
  public doc: Y.Doc;
  private wsProvider: WebsocketProvider | null = null;
  private api: ReturnType<typeof createDocumentManagerApi>;
  private room: string;
  private wsUrl: string;

  constructor(
    doc: Y.Doc,
    room: string,
    config: DocumentManagerConfig,
    wsUrl: string,
  ) {
    this.doc = doc;
    this.room = room;
    this.wsUrl = wsUrl;
    this.api = createDocumentManagerApi(config);
  }

  connect(): void {
    if (this.wsProvider) {
      return;
    }

    // Create WebSocket provider for real-time sync
    this.wsProvider = new WebsocketProvider(this.wsUrl, this.room, this.doc, {
      connect: true,
    });
  }

  disconnect(): void {
    if (this.wsProvider) {
      this.wsProvider.disconnect();
      this.wsProvider.destroy();
      this.wsProvider = null;
    }
  }

  async waitForSynced(): Promise<void> {
    if (!this.wsProvider) {
      throw new Error("Not connected");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 10000);

      this.wsProvider!.once("sync", (isSynced: boolean) => {
        clearTimeout(timeout);
        if (isSynced) {
          resolve();
        } else {
          reject(new Error("Sync failed"));
        }
      });

      this.wsProvider!.once("status", (event: { status: string }) => {
        if (event.status === "disconnected") {
          clearTimeout(timeout);
          reject(new Error("Disconnected"));
        }
      });
    });
  }

  getApi() {
    return this.api;
  }

  getRoom() {
    return this.room;
  }
}
