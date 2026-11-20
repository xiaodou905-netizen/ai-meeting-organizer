import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import organize from '../api/organize.js'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

// This single-page bundle is small. Index its build output at startup so a
// request can only select a published asset, never a path on the filesystem.
const assets = new Map()
for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue
  const path = join(entry.parentPath, entry.name)
  const segments = relative(dist, path).split(sep)
  if (segments.some(segment => segment.startsWith('.'))) continue
  assets.set('/' + segments.join('/'), {
    body: await readFile(path),
    type: types[extname(entry.name)] || 'application/octet-stream',
  })
}
const index = assets.get('/index.html')
if (!index) throw new Error('缺少 dist/index.html，请先运行 npm run build。')

function message(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(text)
}

async function serve(req, res) {
  let path
  try {
    path = decodeURIComponent(req.url.split('?', 1)[0])
  } catch {
    return message(res, 400, '无效的请求路径。')
  }

  if (!path.startsWith('/') || /[\u0000-\u001f\u007f\\]/u.test(path)) {
    return message(res, 400, '无效的请求路径。')
  }
  if (path === '/api/organize') return organize(req, res)
  if (path === '/api' || path.startsWith('/api/') || path.split('/').some(part => part.startsWith('.'))) {
    return message(res, 404, '未找到资源。')
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return message(res, 405, '页面仅支持 GET 和 HEAD。')
  }

  const accept = req.headers.accept || '*/*'
  const isPage = !extname(path) && path !== '/assets' && !path.startsWith('/assets/')
    && (accept.includes('text/html') || accept.includes('*/*'))
  const asset = assets.get(path) || (isPage && index)
  if (!asset) return message(res, 404, '未找到资源。')
  res.writeHead(200, {
    'Content-Type': asset.type,
    'Content-Length': asset.body.length,
    'Cache-Control': asset === index ? 'no-cache' : 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(req.method === 'HEAD' ? undefined : asset.body)
}

const port = Number(process.env.PORT || 3000)
createServer((req, res) => {
  serve(req, res).catch(() => {
    if (res.headersSent) res.destroy()
    else message(res, 500, '服务暂时不可用。')
  })
}).listen(port, '0.0.0.0', function () {
  console.log(`会议纪要整理器已启动，监听 0.0.0.0:${this.address().port}`)
})
