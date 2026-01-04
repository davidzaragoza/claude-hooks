// Supported log levels
export type LogLevel = "debug" | "info" | "warn" | "error";

// Configuration interface
export interface Config {
  logLevel: LogLevel;
  logFile: string;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramUserIds: number[];
  telegramTimeoutMs: number;
  telegramPollIntervalMs: number;
  permissionHookEnabled: boolean;
  permissionHookToolsAutoApproved: string[];
  permissionHookTimeoutMs: number;
  permissionHookAllowOnTimeout: boolean;
}

// Default configuration values
export const DEFAULT_CONFIG: Config = {
  logLevel: "info",
  logFile: "./logs.log",
  telegramEnabled: false,
  telegramBotToken: "",
  telegramUserIds: [],
  telegramTimeoutMs: 600000,  // 10 minutes
  telegramPollIntervalMs: 10000,  // 10 seconds
  permissionHookEnabled: false,
  permissionHookToolsAutoApproved: [],
  permissionHookTimeoutMs: 600000,  // 10 minutes
  permissionHookAllowOnTimeout: false,  // Deny on timeout (safer)
};
