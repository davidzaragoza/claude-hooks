#!/usr/bin/env bun
// Claude Code Stop Hook
// This script runs when Claude Code finishes responding

import type { StopHookInput } from "../types/StopHookInput";
import type { StopHookOutput } from "../types/StopHookOutput";
import { getLastUserAndAssistantMessages } from "../services/transcriptReader";
import { createLogger } from "../services/logger";
import { loadConfig } from "../services/config";
import { sendTelegramMessage, type TelegramCallback } from "../services/telegram";

// Create logger for this hook
const logger = createLogger("StopHook");

// Telegram message length limit is 4096 characters
const TELEGRAM_MAX_LENGTH = 4096;

// Maximum lengths for individual message parts
const MAX_USER_MESSAGE_LENGTH = 1000;
const MAX_ASSISTANT_MESSAGE_LENGTH = 3500;

// Internal type for message formatting
interface TelegramMessageData {
  sessionId: string;
  workingDirectory: string;
  timestamp: string;
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
}

function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.slice(0, maxLength - 3) + "...";
}

function formatMessage(data: TelegramMessageData): string {
  const userMessage = data.lastUserMessage || "(no message)";
  const assistantMessage = data.lastAssistantMessage || "(no message)";

  // Calculate template length (without the actual messages)
  const template = `🤖 Claude Code Session

Session: ${data.sessionId}
Working: ${data.workingDirectory}
Time: ${data.timestamp}

👤 User said:
__USER_MESSAGE__

🤖 Claude responded:
__ASSISTANT_MESSAGE__

---
Reply with: /continue ${data.sessionId} This needs revision
Or tap the button below to approve`;

  const templateLength = template.length;
  const availableSpace = TELEGRAM_MAX_LENGTH - templateLength;

  // Split available space between user and assistant messages (60/40 split favoring assistant)
  const maxUserLen = Math.min(MAX_USER_MESSAGE_LENGTH, Math.floor(availableSpace * 0.4));
  const maxAssistantLen = Math.min(
    MAX_ASSISTANT_MESSAGE_LENGTH,
    Math.floor(availableSpace * 0.6)
  );

  // Truncate messages to fit
  const truncatedUserMessage = truncateMessage(userMessage, maxUserLen);
  const truncatedAssistantMessage = truncateMessage(assistantMessage, maxAssistantLen);

  // Build final message
  return template
    .replace("__USER_MESSAGE__", truncatedUserMessage)
    .replace("__ASSISTANT_MESSAGE__", truncatedAssistantMessage);
}

// Read JSON from stdin
const input = await Bun.stdin.text();

try {
  // Parse the JSON input
  const data: StopHookInput = JSON.parse(input);

  await logger.debug(`Received hook input: ${JSON.stringify(data)}`);

  // Load configuration
  const config = await loadConfig();

  // If Telegram is not enabled, exit normally
  if (!config.telegramEnabled) {
    await logger.debug("Telegram notifications disabled, exiting");
    process.exit(0);
  }

  // Validate Telegram configuration
  if (!config.telegramBotToken) {
    await logger.error("Telegram enabled but bot token not configured");
    process.exit(0);
  }

  if (config.telegramUserIds.length === 0) {
    await logger.warn("Telegram enabled but no user IDs configured, exiting");
    process.exit(0);
  }

  // Get last user and assistant messages from transcript
  const { lastUserMessage, lastAssistantMessage } =
    await getLastUserAndAssistantMessages(data.transcript_path);

  await logger.debug("Last user message: " + (lastUserMessage || "(none)"));
  await logger.debug("Last assistant message: " + (lastAssistantMessage || "(none)"));

  // Build message data for Telegram
  const messageData: TelegramMessageData = {
    sessionId: data.session_id,
    workingDirectory: data.cwd,
    timestamp: new Date().toISOString(),
    lastUserMessage,
    lastAssistantMessage,
  };

  // Format the message
  const textToSend = formatMessage(messageData);

  // Build callbacks array
  const callbacks: TelegramCallback[] = [
    {
      type: "inline-button",
      display: "✓ Stop (allow claude to stop)",
      command: `/stop ${data.session_id}`,
      handler: async () => {
        await logger.info("Response approved via Telegram");
      },
    },
    {
      type: "hidden",
      command: new RegExp(`^/continue\\s+${data.session_id}\\s+(.+)$`),
      handler: async (match) => {
        const reason = Array.isArray(match) ? match[1] : String(match);
        await logger.info(`Response blocked via Telegram: ${reason}`);
      },
    },
  ];

  // Send message and wait for response
  const rawCallbackData = await sendTelegramMessage(textToSend, callbacks, config);

  // Parse the response based on raw callback data
  if (rawCallbackData === `/stop ${data.session_id}`) {
    // Approved - no output needed, just exit 0
  } else {
    // Blocked - parse the reason
    const blockMatch = rawCallbackData.match(
      new RegExp(`^/continue\\s+${data.session_id}\\s+(.+)$`)
    );
    if (blockMatch) {
      const reason = blockMatch[1];

      // Output block decision
      const hookResponse: StopHookOutput = {
        decision: "block",
        reason,
      };
      console.log(JSON.stringify(hookResponse, null, 2));
    }
  }

  // Exit with success
  process.exit(0);
} catch (error) {
  await logger.error(`Error: ${error}`);

  // Check if it's a timeout error
  if (error instanceof Error && error.message === "timeout waiting for response") {
    // Output timeout decision (undefined = don't block, but log error)
    const hookResponse: StopHookOutput = {
      decision: undefined,
      reason: "timeout waiting for response",
    };
    console.log(JSON.stringify(hookResponse, null, 2));
    process.exit(0);
  }

  process.exit(1);
}
