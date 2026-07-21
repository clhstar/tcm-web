import { createReadStream, promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const rendererDirectory = path.resolve(currentDirectory, '..', 'dist')
const developmentUrl = process.env.TCM_WEB_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'
const updateCheckInterval = 4 * 60 * 60 * 1000

let updaterState = {
  status: app.isPackaged ? 'idle' : 'unsupported',
  currentVersion: app.getVersion(),
}
let updateCheckTimer
let isRestartingForUpdate = false
let isDownloadingUpdate = false

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function isInsideRendererDirectory(filePath) {
  return filePath === rendererDirectory || filePath.startsWith(`${rendererDirectory}${path.sep}`)
}

async function resolveRendererFile(requestPath) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(requestPath)
  } catch {
    return undefined
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '')
  const requestedFile = path.resolve(rendererDirectory, relativePath)
  if (!isInsideRendererDirectory(requestedFile)) {
    return undefined
  }

  try {
    const stats = await fs.stat(requestedFile)
    if (stats.isFile()) {
      return requestedFile
    }
  } catch {
    // BrowserRouter routes are served by the renderer entry point below.
  }

  return path.join(rendererDirectory, 'index.html')
}

async function startRendererServer() {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    const filePath = await resolveRendererFile(requestUrl.pathname)
    if (!filePath) {
      response.writeHead(403).end('Forbidden')
      return
    }

    try {
      const stats = await fs.stat(filePath)
      response.writeHead(200, {
        'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
        'Content-Length': stats.size,
        'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      })
      createReadStream(filePath).pipe(response)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Unable to determine the local renderer server address')
  }

  return {
    close: () => server.close(),
    url: `http://127.0.0.1:${address.port}`,
  }
}

function isAllowedExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function createMainWindow(rendererUrl) {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'TCM Consultation',
    autoHideMenuBar: process.platform !== 'darwin',
    backgroundColor: '#f7f5f0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDirectory, 'preload.mjs'),
      sandbox: true,
    },
  })

  const rendererOrigin = new URL(rendererUrl).origin
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (new URL(targetUrl).origin !== rendererOrigin) {
      event.preventDefault()
      if (isAllowedExternalUrl(targetUrl)) {
        void shell.openExternal(targetUrl)
      }
    }
  })
  window.once('ready-to-show', () => window.show())

  await window.loadURL(rendererUrl)
  return window
}

function publishUpdaterState(patch) {
  updaterState = { ...updaterState, ...patch }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('desktop-updater:state', updaterState)
  }
}

function updaterErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/(github_pat_|ghp_)[A-Za-z0-9_]+/g, '[redacted]')
}

function configureDesktopUpdater() {
  ipcMain.handle('desktop-updater:get-state', () => updaterState)
  ipcMain.handle('desktop-updater:check', async () => {
    if (!app.isPackaged) return updaterState
    await checkForDesktopUpdate()
    return updaterState
  })
  ipcMain.handle('desktop-updater:download', async () => {
    if (!app.isPackaged || updaterState.status !== 'available') return updaterState
    isDownloadingUpdate = true
    publishUpdaterState({ status: 'downloading', percent: 0, error: undefined })
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      publishUpdaterState({ status: 'error', error: updaterErrorMessage(error) })
    }
    return updaterState
  })

  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    publishUpdaterState({ status: 'checking', error: undefined })
  })
  autoUpdater.on('update-available', (info) => {
    isDownloadingUpdate = false
    publishUpdaterState({ status: 'available', version: info.version, percent: undefined, error: undefined })
  })
  autoUpdater.on('update-not-available', () => {
    isDownloadingUpdate = false
    publishUpdaterState({ status: 'idle', version: undefined, percent: undefined, error: undefined })
  })
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, progress.percent))
    publishUpdaterState({ status: 'downloading', percent })
    for (const window of BrowserWindow.getAllWindows()) window.setProgressBar(percent / 100)
  })
  autoUpdater.on('update-downloaded', (info) => {
    isDownloadingUpdate = false
    publishUpdaterState({ status: 'downloaded', version: info.version, percent: 100 })
    for (const window of BrowserWindow.getAllWindows()) window.setProgressBar(-1)
    if (isRestartingForUpdate) return
    isRestartingForUpdate = true
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 1200)
  })
  autoUpdater.on('error', (error) => {
    for (const window of BrowserWindow.getAllWindows()) window.setProgressBar(-1)
    if (isDownloadingUpdate) {
      isDownloadingUpdate = false
      publishUpdaterState({ status: 'error', error: updaterErrorMessage(error) })
    } else {
      publishUpdaterState({ status: 'idle', error: undefined })
    }
  })
}

async function checkForDesktopUpdate() {
  if (!app.isPackaged || updaterState.status === 'checking' || updaterState.status === 'downloading') return
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    if (isDownloadingUpdate) {
      isDownloadingUpdate = false
      publishUpdaterState({ status: 'error', error: updaterErrorMessage(error) })
    } else {
      publishUpdaterState({ status: 'idle', error: undefined })
    }
  }
}

let rendererServer

configureDesktopUpdater()

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  const rendererUrl = app.isPackaged
    ? (rendererServer = await startRendererServer()).url
    : developmentUrl

  await createMainWindow(rendererUrl)
  if (app.isPackaged) {
    setTimeout(() => void checkForDesktopUpdate(), 3000)
    updateCheckTimer = setInterval(() => void checkForDesktopUpdate(), updateCheckInterval)
  }
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow(rendererUrl)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (updateCheckTimer) clearInterval(updateCheckTimer)
  rendererServer?.close()
})
