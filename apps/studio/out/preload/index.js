let electron = require("electron");
//#region src/preload/index.ts
electron.contextBridge.exposeInMainWorld("xiao", { app: { getInfo: () => electron.ipcRenderer.invoke("app:getInfo") } });
//#endregion
