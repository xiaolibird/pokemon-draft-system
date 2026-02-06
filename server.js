/**
 * 自定义 Next.js Server 实现优雅停机
 *
 * 功能:
 * - 监听 SIGTERM/SIGINT 信号
 * - 停止接受新连接
 * - 等待现有请求完成
 * - 关闭数据库连接
 * - 清理资源
 */

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

// Next.js app
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// 优雅停机状态
let isShuttingDown = false
let server

// 活跃连接跟踪
const activeConnections = new Set()

async function startServer() {
  try {
    await app.prepare()

    server = createServer((req, res) => {
      // 如果正在停机，拒绝新请求
      if (isShuttingDown) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: '服务器正在重启，请稍后重试',
            status: 'shutting_down',
          }),
        )
        return
      }

      // 跟踪连接
      activeConnections.add(req.socket)
      req.socket.once('close', () => {
        activeConnections.delete(req.socket)
      })

      const parsedUrl = parse(req.url, true)
      handle(req, res, parsedUrl)
    })

    // 配置 keep-alive
    server.keepAliveTimeout = 65000 // 65秒
    server.headersTimeout = 66000 // 66秒

    server.listen(port, () => {
      console.log(`✅ Server ready on http://${hostname}:${port}`)
      console.log(`   Environment: ${dev ? 'development' : 'production'}`)
      console.log(`   PID: ${process.pid}`)
    })

    // 错误处理
    server.on('error', (err) => {
      console.error('Server error:', err)
      process.exit(1)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

/**
 * 优雅停机处理
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('⚠️  Already shutting down, forcing exit...')
    process.exit(0)
    return
  }

  console.log(`\n📡 Received ${signal}, starting graceful shutdown...`)
  isShuttingDown = true

  // 1. 停止接受新连接
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed')
    })
  }

  // 2. 等待活跃连接完成（最多等待30秒）
  console.log(
    `⏳ Waiting for ${activeConnections.size} active connections to finish...`,
  )
  const shutdownTimeout = setTimeout(() => {
    console.log('⚠️  Shutdown timeout reached, forcing close...')
    activeConnections.forEach((socket) => socket.destroy())
    process.exit(0)
  }, 30000) // 30秒超时

  // 轮询检查连接
  const checkInterval = setInterval(() => {
    if (activeConnections.size === 0) {
      clearInterval(checkInterval)
      clearTimeout(shutdownTimeout)
      finishShutdown()
    }
  }, 100)
}

/**
 * 完成停机
 */
async function finishShutdown() {
  console.log('✅ All connections closed')

  // 3. 关闭数据库连接
  try {
    // 使用 app/lib/prisma.ts 中的单例实例
    const { prisma } = require('./app/lib/prisma')
    await prisma.$disconnect()
    console.log('✅ Database connections closed')
  } catch (err) {
    console.error('⚠️  Error closing database:', err)
  }

  // 4. 清理其他资源
  console.log('✅ Cleanup completed')
  console.log('👋 Goodbye!')

  process.exit(0)
}

// 监听信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// 未捕获的异常处理
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err)
  gracefulShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  gracefulShutdown('UNHANDLED_REJECTION')
})

// 启动服务器
startServer()
