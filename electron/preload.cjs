const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld(
  'tcmDesktop',
  Object.freeze({
    isDesktop: true,
    platform: process.platform,
    auth: Object.freeze({
      readSession: () => ipcRenderer.invoke('desktop-auth:read-session'),
      writeSession: (serializedSession) => ipcRenderer.invoke('desktop-auth:write-session', serializedSession),
      clearSession: () => ipcRenderer.invoke('desktop-auth:clear-session'),
    }),
    updater: Object.freeze({
      getState: () => ipcRenderer.invoke('desktop-updater:get-state'),
      check: () => ipcRenderer.invoke('desktop-updater:check'),
      download: () => ipcRenderer.invoke('desktop-updater:download'),
      onStateChange: (listener) => {
        const handler = (_event, state) => listener(state)
        ipcRenderer.on('desktop-updater:state', handler)
        return () => ipcRenderer.removeListener('desktop-updater:state', handler)
      },
    }),
  }),
)
