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
    adminMode: boolean;
  };
};
const defaultConfig = {
  parseYDoc: true,
  showDelta: true,
  showSize: true,
  editable: false,
  documentManager: {
    baseUrl: "https://instrumenta.cf",
    apiKey: "",
    adminMode: false,
  },
} satisfies Config;

export const configAtom = atomWithStorage<Config>(
  "yjs-playground-config",
  defaultConfig,
);

export const useConfig = () => {
  return useAtom(configAtom);
};
