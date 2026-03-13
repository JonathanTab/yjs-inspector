import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type Config = {
  parseYDoc: boolean;
  showDelta: boolean;
  showSize: boolean;
  editable: boolean;
  documentManager: {
    baseUrl: string;
    apiKey: string;
    wsUrl: string;
    blobStorageUrl: string;
    adminMode: boolean;
    impersonateUser: string | null;
  };
};
const defaultConfig = {
  parseYDoc: true,
  showDelta: true,
  showSize: true,
  editable: false,
  documentManager: {
    // Backend API URLs - adjust these for your deployment
    baseUrl: "",  // Empty = relative to current host (e.g., "" for same-origin)
    apiKey: "",   // API key for authentication (via ?apikey= parameter)
    wsUrl: "",    // WebSocket URL for Yjs sync (e.g., "wss://your-server/yjs")
    blobStorageUrl: "",  // Blob storage base URL (leave empty for same-origin)
    adminMode: true,  // Always true - admin mode is permanent
    impersonateUser: null,
  },
} satisfies Config;

export const configAtom = atomWithStorage<Config>(
  "yjs-playground-config",
  defaultConfig,
);

export const useConfig = () => {
  return useAtom(configAtom);
};
