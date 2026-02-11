/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 自定义 Next.js Server 实现优雅停机
 *
 * 功能:
 * - 监听 SIGTERM/SIGINT 信号
 * - 停止接受新连接
 * - 等待现有请求完成
 * - 关闭数据库连接
 * - 清理资源
 * - 集成 Winston 日志系统
 */

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const winston = require("winston");
const path = require("path");
const fs = require("fs");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// Ensure logs directory exists
const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "pokemon-draft-server" },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    // Write all logs with importance level of `info` or less to `server-YYYY-MM-DD.log`
    new winston.transports.File({
      filename: path.join(logDir, `server-${new Date().toISOString().slice(0, 10)}.log`)
    }),
  ],
});

// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
if (process.env.NODE_ENV !== "production") {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
} else {
  // In production, also log to console (stdout) for Docker/PM2 to capture
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// 优雅停机状态
let isShuttingDown = false;
let server;

// 活跃连接跟踪
const activeConnections = new Set();

async function startServer() {
  try {
    await app.prepare();

    server = createServer((req, res) => {
      // 如果正在停机，拒绝新请求
      if (isShuttingDown) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "服务器正在重启，请稍后重试",
            status: "shutting_down",
          }),
        );
        return;
      }

      // 跟踪连接
      activeConnections.add(req.socket);
      req.socket.once("close", () => {
        activeConnections.delete(req.socket);
      });

      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    });

    // 配置 keep-alive
    server.keepAliveTimeout = 65000; // 65秒
    server.headersTimeout = 66000; // 66秒

    server.listen(port, () => {
      logger.info(`✅ Server ready on http://${hostname}:${port}`);
      logger.info(`   Environment: ${dev ? "development" : "production"}`);
      logger.info(`   PID: ${process.pid}`);
    });

    // 错误处理
    server.on("error", (err) => {
      logger.error("Server error:", err);
      process.exit(1);
    });
  } catch (err) {
    logger.error("Failed to start server:", err);
    process.exit(1);
  }
}

/**
 * 优雅停机处理
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn("⚠️  Already shutting down, forcing exit...");
    process.exit(0);
    return;
  }

  logger.info(`\n📡 Received ${signal}, starting graceful shutdown...`);
  isShuttingDown = true;

  // 1. 停止接受新连接
  if (server) {
    server.close(() => {
      logger.info("✅ HTTP server closed");
    });
  }

  // 2. 等待活跃连接完成（最多等待30秒）
  logger.info(
    `⏳ Waiting for ${activeConnections.size} active connections to finish...`,
  );
  const shutdownTimeout = setTimeout(() => {
    logger.warn("⚠️  Shutdown timeout reached, forcing close...");
    activeConnections.forEach((socket) => socket.destroy());
    process.exit(0);
  }, 30000); // 30秒超时

  // 轮询检查连接
  const checkInterval = setInterval(() => {
    if (activeConnections.size === 0) {
      clearInterval(checkInterval);
      clearTimeout(shutdownTimeout);
      finishShutdown();
    }
  }, 100);
}

/**
 * 完成停机
 */
async function finishShutdown() {
  logger.info("✅ All connections closed");

  // 3. 关闭数据库连接
  try {
    // 使用 app/lib/prisma.ts 中的单例实例
    const { prisma } = require("./app/lib/prisma");
    await prisma.$disconnect();
    logger.info("✅ Database connections closed");
  } catch (err) {
    logger.error("⚠️  Error closing database:", err);
  }

  // 4. 清理其他资源
  logger.info("✅ Cleanup completed");
  logger.info("👋 Goodbye!");

  process.exit(0);
}

// 监听信号
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// 未捕获的异常处理
process.on("uncaughtException", (err) => {
  logger.error("❌ Uncaught Exception:", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

// 启动服务器
startServer();
