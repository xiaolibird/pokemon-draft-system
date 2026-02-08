import winston from "winston";

const { combine, timestamp, json, colorize, printf } = winston.format;

// 开发环境格式
const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

// 日志格式
const logFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  process.env.NODE_ENV === "development"
    ? combine(colorize(), devFormat)
    : json(),
);

// 创建 logger 实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: logFormat,
  defaultMeta: { service: "pokemon-draft" },
  transports: [
    new winston.transports.Console(),
    // 生产环境可以添加文件传输
    // new winston.transports.File({ filename: "error.log", level: "error" }),
    // new winston.transports.File({ filename: "combined.log" }),
  ],
});

export default logger;

// 便捷方法（使用函数声明以兼容测试脚本的导出检查）
export function logInfo(message: string, meta?: Record<string, unknown>): void {
  logger.info(message, meta);
}

export function logError(
  message: string,
  error?: Error,
  meta?: Record<string, unknown>,
): void {
  logger.error(message, {
    error: error?.message,
    stack: error?.stack,
    ...meta,
  });
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  logger.warn(message, meta);
}

export function logDebug(
  message: string,
  meta?: Record<string, unknown>,
): void {
  logger.debug(message, meta);
}
