#!/usr/bin/env bun
/**
 * Claude Code Hooks Installer
 *
 * This script configures Claude Code to use the project's custom hooks
 * by registering them in ~/.claude/settings.json
 */

import path from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

// ============================================================================
// TYPES
// ============================================================================

interface HookConfig {
  type: string;
  command: string;
}

interface HookEntry {
  hooks: HookConfig[];
}

interface ClaudeSettings {
  env?: Record<string, string>;
  enabledPlugins?: Record<string, boolean>;
  hooks?: {
    PermissionRequest?: HookEntry[];
    Stop?: HookEntry[];
    [key: string]: HookEntry[] | undefined;
  };
  [key: string]: unknown;
}

interface Config {
  logLevel: "debug" | "info" | "warn" | "error";
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

// ============================================================================
// CONSTANTS
// ============================================================================

// Target hooks to install
const HOOKS_TO_INSTALL = {
  PermissionRequest: "src/hooks/permission.ts",
  Stop: "src/hooks/stop.ts",
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets the home directory of the current user
 */
function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || "";
}

/**
 * Checks if a hook configuration already exists in the settings
 */
function hookExists(hooksArray: HookEntry[], hookPath: string): boolean {
  return hooksArray.some((entry) =>
    entry.hooks.some((hook) => hook.type === "command" && hook.command === hookPath)
  );
}

/**
 * Verifies that a hook file exists
 */
async function verifyHookFile(hookPath: string): Promise<boolean> {
  try {
    const file = Bun.file(hookPath);
    return await file.exists();
  } catch {
    return false;
  }
}

/**
 * Prompts user for input and returns the answer
 */
function promptQuestion(rl: createInterface.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Creates config.json interactively
 */
async function createConfigInteractively(projectRoot: string): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("");
  console.log("=== Telegram Setup ===");
  console.log("");
  console.log("To enable Telegram integration, you need:");
  console.log("1. A Telegram bot token from @BotFather");
  console.log("2. Your Telegram user ID from @userinfobot");
  console.log("");
  console.log("Quick setup guide:");
  console.log("• Open Telegram and message @BotFather");
  console.log("• Send /newbot and follow instructions");
  console.log("• Copy the bot token (looks like: 123456:ABC-DEF...)");
  console.log("• Message @userinfobot to get your user ID");
  console.log("");

  const botToken = await promptQuestion(
    rl,
    "Enter your Telegram bot token (or press Enter to skip): "
  );

  // Create default config (Telegram disabled by default if skipped)
  const config: Config = {
    logLevel: "info",
    logFile: "./logs.log",
    telegramEnabled: false,
    telegramBotToken: "",
    telegramUserIds: [],
    telegramTimeoutMs: 600000,
    telegramPollIntervalMs: 3000,
    permissionHookEnabled: false,
    permissionHookToolsAutoApproved: ["Read", "Glob", "Grep"],
    permissionHookTimeoutMs: 600000,
    permissionHookAllowOnTimeout: false,
  };

  if (!botToken.trim()) {
    console.log("");
    console.log("Skipping Telegram setup. You can configure it later in config.json");
    console.log("");

    // Write config with Telegram disabled
    const configPath = path.join(projectRoot, "config.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`✓ Created config.json at ${configPath}`);
    console.log("");
    rl.close();
    return;
  }

  const userIdsInput = await promptQuestion(
    rl,
    "Enter your Telegram user ID (comma-separated for multiple): "
  );

  const userIds = userIdsInput
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));

  if (userIds.length === 0) {
    console.error("Error: At least one valid user ID is required");
    process.exit(1);
  }

  rl.close();

  // Update config with Telegram values
  config.telegramEnabled = true;
  config.telegramBotToken = botToken.trim();
  config.telegramUserIds = userIds;
  config.permissionHookEnabled = true;

  // Write config.json
  const configPath = path.join(projectRoot, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log("");
  console.log(`✓ Created config.json at ${configPath}`);
  console.log("");
  console.log("Telegram integration enabled!");
  console.log("Don't forget to:");
  console.log("• Start a conversation with your bot (search for your bot's username)");
  console.log("• Send /start to your bot");
  console.log("");
}

// ============================================================================
// MAIN INSTALLATION LOGIC
// ============================================================================

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // Step 1: Get project root (script directory)
  // -------------------------------------------------------------------------
  const projectRoot = import.meta.dir;
  console.log(`Project root: ${projectRoot}`);
  console.log("");

  // -------------------------------------------------------------------------
  // Step 1.5: Check if config.json exists, create if needed
  // -------------------------------------------------------------------------
  const configPath = path.join(projectRoot, "config.json");

  if (!existsSync(configPath)) {
    console.log("No config.json found. Let's create one...");
    await createConfigInteractively(projectRoot);
  } else {
    console.log("Found existing config.json");
    console.log("");
  }

  // -------------------------------------------------------------------------
  // Step 2: Build absolute paths to hooks
  // -------------------------------------------------------------------------
  const hooks: Record<string, string> = {};
  for (const [hookName, relativePath] of Object.entries(HOOKS_TO_INSTALL)) {
    const absolutePath = path.resolve(projectRoot, relativePath);

    // Verify hook file exists
    if (!(await verifyHookFile(absolutePath))) {
      console.error(`Error: Hook file not found: ${absolutePath}`);
      process.exit(1);
    }

    hooks[hookName] = absolutePath;
  }

  // -------------------------------------------------------------------------
  // Step 3: Check ~/.claude directory exists
  // -------------------------------------------------------------------------
  const homeDir = getHomeDir();
  const claudeDir = path.join(homeDir, ".claude");

  if (!existsSync(claudeDir)) {
    console.error("Error: ~/.claude directory not found");
    console.error("");
    console.error("Claude Code configuration directory does not exist.");
    console.error("Please ensure Claude Code is installed and has been run at least once.");
    console.error("");
    console.error(`Expected location: ${claudeDir}`);
    process.exit(1);
  }

  const settingsPath = path.join(claudeDir, "settings.json");
  console.log(`Settings file: ${settingsPath}`);
  console.log("");

  // -------------------------------------------------------------------------
  // Step 4: Load existing settings (or create new object)
  // -------------------------------------------------------------------------
  let settings: ClaudeSettings = {};

  try {
    const settingsFile = Bun.file(settingsPath);
    const exists = await settingsFile.exists();

    if (exists) {
      const text = await settingsFile.text();
      settings = JSON.parse(text);
      console.log("Loaded existing settings.json");
    } else {
      console.log("No existing settings.json found (will create new file)");
    }
  } catch (error) {
    console.error(`Error reading settings.json: ${error}`);
    process.exit(1);
  }

  console.log("");

  // -------------------------------------------------------------------------
  // Step 5: Merge hooks into configuration
  // -------------------------------------------------------------------------
  console.log("Installing hooks...");
  console.log("");

  // Initialize hooks object if it doesn't exist
  if (!settings.hooks) {
    settings.hooks = {};
  }

  let installedCount = 0;
  let alreadyInstalledCount = 0;

  for (const [hookName, hookPath] of Object.entries(hooks)) {
    // Initialize hook array if it doesn't exist
    if (!settings.hooks[hookName]) {
      settings.hooks[hookName] = [];
    }

    const hookArray = settings.hooks[hookName]!;

    // Check if hook already exists
    if (hookExists(hookArray, hookPath)) {
      console.log(`⊘ ${hookName} hook already installed`);
      alreadyInstalledCount++;
    } else {
      // Create hook configuration
      const hookConfig: HookEntry = {
        hooks: [
          {
            type: "command",
            command: hookPath,
          },
        ],
      };

      // Append to hooks array
      hookArray.push(hookConfig);
      console.log(`✓ ${hookName} hook → ${hookPath}`);
      installedCount++;
    }
  }

  console.log("");

  // -------------------------------------------------------------------------
  // Step 6: Write updated settings.json
  // -------------------------------------------------------------------------
  try {
    const formattedJson = JSON.stringify(settings, null, 2);
    await Bun.write(settingsPath, formattedJson);
  } catch (error) {
    console.error(`Error writing settings.json: ${error}`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 7: Success message
  // -------------------------------------------------------------------------
  console.log("Hooks installed successfully!");
  console.log("");

  if (installedCount > 0) {
    console.log(`Installed: ${installedCount} new hook(s)`);
  }
  if (alreadyInstalledCount > 0) {
    console.log(`Already installed: ${alreadyInstalledCount} hook(s)`);
  }

  console.log("");
  console.log("Claude Code will now use these hooks for future sessions.");
}

// ============================================================================
// SCRIPT ENTRY POINT
// ============================================================================

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(`Unexpected error: ${error}`);
  process.exit(1);
}
