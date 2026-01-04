#!/usr/bin/env bun
// Claude Code Permission Hook
// This script runs when Claude Code requests user permission for a tool

import type { PermissionHookInput } from "../types/PermissionHookInput";
import type { PermissionHookOutput } from "../types/PermissionHookOutput";
import { createLogger } from "../services/logger";
import { loadConfig } from "../services/config";
import { sendTelegramMessage, type TelegramCallback } from "../services/telegram";

// Create logger for this hook
const logger = createLogger("PermissionHook");

// Telegram message length limit is 4096 characters
const TELEGRAM_MAX_LENGTH = 4096;

// Maximum length for tool input display
const MAX_TOOL_INPUT_LENGTH = 2000;

function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.slice(0, maxLength - 3) + "...";
}

function formatToolInput(toolInput: unknown): string {
  if (toolInput === null || toolInput === undefined) {
    return "(no parameters)";
  }

  try {
    const inputStr = JSON.stringify(toolInput, null, 2);
    return truncateMessage(inputStr, MAX_TOOL_INPUT_LENGTH);
  } catch {
    return "(unable to display parameters)";
  }
}

function formatPermissionMessage(
  data: PermissionHookInput,
  toolInputStr: string
): string {
  return `🔐 Permission Request

Session: ${data.session_id}
Working: ${data.cwd}
Tool: ${data.tool_name}

Parameters:
${toolInputStr}

---
• Approve - Allow this tool use
• Deny - Block this tool use`;
}

// Helper function to output permission decision
function outputDecision(behavior: "allow" | "deny"): void {
  const output: PermissionHookOutput = {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior,
      },
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

// Read JSON from stdin
const input = await Bun.stdin.text();

try {
  // Parse the JSON input
  const data: PermissionHookInput = JSON.parse(input);

  await logger.debug(`Received permission request for tool: ${data.tool_name}`);

  // Load configuration
  const config = await loadConfig();

  // Check if permission hook is enabled
  if (!config.permissionHookEnabled) {
    await logger.debug("Permission hook disabled, returning error");
    process.exit(2);
  }

  // Check if tool is auto-approved
  if (config.permissionHookToolsAutoApproved.includes(data.tool_name)) {
    await logger.debug(`Auto-approving tool: ${data.tool_name}`);
    outputDecision("allow");
    process.exit(0);
  }

  // Validate Telegram configuration
  if (!config.telegramEnabled) {
    await logger.error("Permission hook requires Telegram to be enabled");
    process.exit(2);
  }

  if (!config.telegramBotToken) {
    await logger.error("Telegram enabled but bot token not configured");
    process.exit(2);
  }

  if (config.telegramUserIds.length === 0) {
    await logger.error("Telegram enabled but no user IDs configured");
    process.exit(2);
  }

  // Format the tool input for display
  const toolInputStr = formatToolInput(data.tool_input);

  // Format the permission message
  const textToSend = formatPermissionMessage(data, toolInputStr);

  // Validate message length
  if (textToSend.length > TELEGRAM_MAX_LENGTH) {
    await logger.error(`Message too long: ${textToSend.length} characters`);
    process.exit(2);
  }

  await logger.debug("Sending permission request to Telegram");

  // Build callbacks array
  const callbacks: TelegramCallback[] = [
    {
      type: "inline-button",
      display: "✓ Approve",
      command: `/approve ${data.session_id} ${data.tool_use_id}`,
      handler: async () => {
        await logger.info(`Permission approved for tool: ${data.tool_name}`);
      },
    },
    {
      type: "inline-button",
      display: "✗ Deny",
      command: `/deny ${data.session_id} ${data.tool_use_id}`,
      handler: async () => {
        await logger.info(`Permission denied for tool: ${data.tool_name}`);
      },
    },
  ];

  // Create timeout config for permission requests (shorter than stop hook)
  const permissionConfig = {
    ...config,
    telegramTimeoutMs: config.permissionHookTimeoutMs,
  };

  // Send message and wait for response
  const rawCallbackData = await sendTelegramMessage(
    textToSend,
    callbacks,
    permissionConfig
  );

  await logger.debug(`Received Telegram response: ${rawCallbackData}`);

  // Parse the response and verify session_id matches
  const approvePattern = new RegExp(
    `^/approve\\s+(${data.session_id})\\s+(.+)$`
  );
  const denyPattern = new RegExp(`^/deny\\s+(${data.session_id})\\s+(.+)$`);

  const approveMatch = rawCallbackData.match(approvePattern);
  const denyMatch = rawCallbackData.match(denyPattern);

  if (approveMatch && approveMatch[1] === data.session_id) {
    // Approved
    await logger.info(`Permission approved via Telegram for tool: ${data.tool_name}`);
    outputDecision("allow");
  } else if (denyMatch && denyMatch[1] === data.session_id) {
    // Denied
    await logger.info(`Permission denied via Telegram for tool: ${data.tool_name}`);
    outputDecision("deny");
  } else {
    // Invalid or mismatched response - deny for safety
    await logger.warn(`Invalid Telegram response: ${rawCallbackData}`);
    process.exit(2);
  }

  // Exit with success
  process.exit(0);
} catch (error) {
  await logger.error(`Error: ${error}`);

  // Check if it's a timeout error
  if (error instanceof Error && error.message === "timeout waiting for response") {
    const config = await loadConfig();

    // Check timeout behavior
    if (config.permissionHookAllowOnTimeout) {
      await logger.warn("Timeout - allowing permission");
      outputDecision("allow");
    } else {
      await logger.warn("Timeout - denying permission (default safe behavior)");
      outputDecision("deny");
    }
    process.exit(0);
  }

  process.exit(2);
}
