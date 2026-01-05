// Logging service with configurable log levels

import { appendFile } from "node:fs/promises";
import { dirname, join, isAbsolute } from "path";
import type { LogLevel } from "../types/Config";
import { loadConfig } from "./config";

// Get the project root directory (two levels up from this file: src/services -> src -> root)
const PROJECT_ROOT = join(dirname(import.meta.dir), "..");

/**
 * Resolves a log file path to an absolute path relative to the project root
 */
function resolveLogPath(logFile: string): string {
  if (isAbsolute(logFile)) {
    return logFile;
  }
  return join(PROJECT_ROOT, logFile);
}

// Log level priority (higher number = more severe)
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger class for structured logging
 */
export class Logger {
  private context: string;
  private currentLogLevel: LogLevel = "info";

  constructor(context: string) {
    this.context = context;
    this.init();
  }

  private async init(): Promise<void> {
    try {
      const config = await loadConfig();
      this.currentLogLevel = config.logLevel;
    } catch (error) {
      console.error(`Failed to load config for logger: ${error}`);
    }
  }

  /**
   * Checks if a message should be logged based on configured log level
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.currentLogLevel];
  }

  /**
   * Formats a log message with timestamp and context
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}\n`;
  }

  /**
   * Writes a log message to the log file
   */
  private async writeToLog(formattedMessage: string): Promise<void> {
    try {
      const config = await loadConfig();
      const logPath = resolveLogPath(config.logFile);
      await appendFile(logPath, formattedMessage);
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  /**
   * Logs a debug message
   */
  async debug(message: string): Promise<void> {
    if (!this.shouldLog("debug")) {
      return;
    }
    const formatted = this.formatMessage("debug", message);
    await this.writeToLog(formatted);
  }

  /**
   * Logs an info message
   */
  async info(message: string): Promise<void> {
    if (!this.shouldLog("info")) {
      return;
    }
    const formatted = this.formatMessage("info", message);
    await this.writeToLog(formatted);
  }

  /**
   * Logs a warning message
   */
  async warn(message: string): Promise<void> {
    if (!this.shouldLog("warn")) {
      return;
    }
    const formatted = this.formatMessage("warn", message);
    await this.writeToLog(formatted);
  }

  /**
   * Logs an error message
   */
  async error(message: string): Promise<void> {
    if (!this.shouldLog("error")) {
      return;
    }
    const formatted = this.formatMessage("error", message);
    await this.writeToLog(formatted);
  }
}

/**
 * Creates a new logger instance with the given context
 * @param context - The context/module name for the logger
 * @returns A new Logger instance
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
