// 客户端安全的日志模块
// 此文件仅在客户端使用，不依赖 Node.js 模块

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

// 开发环境格式化
function formatDevLog(
  level: LogLevel,
  message: string,
  meta?: LogMeta,
): string {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta || {}).length ? JSON.stringify(meta) : "";
  return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
}

// 控制台日志包装器
const logWithConsole = (level: LogLevel, message: string, meta?: LogMeta) => {
  const formatted = formatDevLog(level, message, meta);

  switch (level) {
    case "debug":
      console.debug(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "error":
      console.error(formatted);
      break;
  }
};

// 客户端日志 - 仅在开发环境输出
export const logInfo = (message: string, meta?: LogMeta) => {
  if (process.env.NODE_ENV === "development") {
    logWithConsole("info", message, meta);
  }
};

export const logError = (message: string, error?: Error, meta?: LogMeta) => {
  // 错误始终输出
  logWithConsole("error", message, {
    error: error?.message,
    stack: error?.stack,
    ...meta,
  });
};

export const logWarn = (message: string, meta?: LogMeta) => {
  if (process.env.NODE_ENV === "development") {
    logWithConsole("warn", message, meta);
  }
};

export const logDebug = (message: string, meta?: LogMeta) => {
  if (process.env.NODE_ENV === "development") {
    logWithConsole("debug", message, meta);
  }
};

// 兼容导出（如果其他地方导入 default）
export default {
  info: logInfo,
  error: logError,
  warn: logWarn,
  debug: logDebug,
};
