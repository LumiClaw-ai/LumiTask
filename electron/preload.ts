import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("lumitask", {
  isElectron: true,
});
