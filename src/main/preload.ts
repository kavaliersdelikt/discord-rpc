import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.on(channel, (_, ...args) => listener(...args)),
});
