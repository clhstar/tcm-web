import { createReadStream, promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, session, shell } from 'electron'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const rendererDirectory = path.resolve(currentDirectory, '..', 'dist')
const developmentUrl = process.env.TCM_WEB_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'

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

let rendererServer

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  const rendererUrl = app.isPackaged
    ? (rendererServer = await startRendererServer()).url
    : developmentUrl

  await createMainWindow(rendererUrl)
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

app.on('before-quit', () => rendererServer?.close())
