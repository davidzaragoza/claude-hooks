// Configuration loader service

import type { Config, DEFAULT_CONFIG } from "../types/Config";

let cachedConfig: Config | null = null;

/**
 * Loads configuration from config.json in the project root
 * @returns Configuration object
 */
export async function loadConfig(): Promise<Config> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = "./config.json";
    const file = Bun.file(configPath);
    const exists = await file.exists();

    if (!exists) {
      console.warn("config.json not found, using defaults");
      const { DEFAULT_CONFIG } = await import("../types/Config");
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }

    const text = await file.text();
    const config: Config = JSON.parse(text);

    // Validate required fields
    if (!config.logLevel || !config.logFile) {
      throw new Error("Invalid config: missing required fields");
    }

    cachedConfig = config;
    return config;
  } catch (error) {
    console.error(`Error loading config: ${error}`);
    const { DEFAULT_CONFIG } = await import("../types/Config");
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

/**
 * Clears the cached configuration (useful for testing or config reload)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
