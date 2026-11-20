import { defineConfig } from 'vite'

// The same Node handler serves development, the local build preview, and Vercel.
function localApi(server) {
  server.middlewares.use(async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/organize') return next()
    try {
      const { default: organize } = await import('./api/organize.js')
      await organize(req, res)
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ error: { code: 'SERVER_ERROR', message: '本地接口启动失败，请检查项目文件并重启服务。' } }))
    }
  })
}

export default defineConfig({
  plugins: [{ name: 'meeting-organizer-api', configureServer: localApi, configurePreviewServer: localApi }]
})
