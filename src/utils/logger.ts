type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
}

class Logger {
  private requestIdCounter = 0;

  private formatLog(level: LogLevel, message: string, context?: Record<string, unknown>, requestId?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context }),
      ...(requestId && { requestId }),
    };
  }

  private output(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    const requestStr = entry.requestId ? ` [${entry.requestId}]` : "";
    console.log(`${prefix}${requestStr} ${entry.message}${contextStr}`);
  }

  generateRequestId(): string {
    this.requestIdCounter++;
    return `req-${Date.now()}-${this.requestIdCounter}`;
  }

  info(message: string, context?: Record<string, unknown>, requestId?: string): void {
    this.output(this.formatLog("info", message, context, requestId));
  }

  warn(message: string, context?: Record<string, unknown>, requestId?: string): void {
    this.output(this.formatLog("warn", message, context, requestId));
  }

  error(message: string, context?: Record<string, unknown>, requestId?: string): void {
    this.output(this.formatLog("error", message, context, requestId));
  }

  debug(message: string, context?: Record<string, unknown>, requestId?: string): void {
    if (process.env.NODE_ENV === "development") {
      this.output(this.formatLog("debug", message, context, requestId));
    }
  }
}

export const logger = new Logger();

