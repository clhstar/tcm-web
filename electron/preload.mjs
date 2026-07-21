import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld(
  'tcmDesktop',
  Object.freeze({
    isDesktop: true,
    platform: process.platform,
  }),
)
