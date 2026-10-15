import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('xiaoSpike', { embedded: true });
