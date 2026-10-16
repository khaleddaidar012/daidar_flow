import { contextBridge, ipcRenderer } from "electron";
import type { Command } from "../core/contracts";
contextBridge.exposeInMainWorld("flow", {
  invoke: (command: Command, payload: unknown) =>
    ipcRenderer.invoke("flow:command", command, payload),
});
