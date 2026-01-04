import { Bot } from "grammy";
import type { Config } from "../types/Config";
import { createLogger } from "./logger";

const logger = createLogger("TelegramService");

// Telegram message length limit is 4096 characters
const TELEGRAM_MAX_LENGTH = 4096;

// Types for callback configuration
export type TelegramCallbackType = "inline-button" | "hidden";

export interface TelegramCallback {
  type: TelegramCallbackType;
  display?: string; // Button text for "inline-button" type
  command: string | RegExp; // Pattern to match
  handler: (match: string | RegExpMatchArray) => void | Promise<void>;
}

function validateMessageLength(message: string): void {
  if (message.length > TELEGRAM_MAX_LENGTH) {
    throw new Error(
      `Message length (${message.length}) exceeds Telegram maximum (${TELEGRAM_MAX_LENGTH})`
    );
  }
}

async function initializeBot(botToken: string): Promise<Bot> {
  await logger.debug("Initializing Telegram bot");

  const bot = new Bot(botToken);

  // Validate token by making an API call
  try {
    await bot.api.getMe();
    await logger.info("Telegram bot initialized successfully");
  } catch (error) {
    await logger.error(`Failed to initialize Telegram bot: ${error}`);
    throw new Error(`Invalid Telegram bot token: ${error}`);
  }

  return bot;
}

export async function sendTelegramMessage(
  textToSend: string,
  callbacks: TelegramCallback[],
  config: Config
): Promise<string> {
  await logger.debug("Sending Telegram message");

  // Validate message length
  validateMessageLength(textToSend);

  // Enforce minimum poll interval of 1 second
  const pollIntervalMs = Math.max(config.telegramPollIntervalMs, 1000);
  await logger.debug(`Using poll interval: ${pollIntervalMs}ms`);

  // Initialize bot
  const bot = await initializeBot(config.telegramBotToken);

  // Build inline keyboard from "inline-button" callbacks
  const inlineKeyboard = callbacks
    .filter((cb) => cb.type === "inline-button")
    .map((cb) => ({
      text: cb.display || "",
      callback_data: typeof cb.command === "string" ? cb.command : cb.command.source,
    }));

  // Send message to all configured users
  for (const userId of config.telegramUserIds) {
    try {
      await bot.api.sendMessage(userId, textToSend, {
        reply_markup: {
          inline_keyboard: inlineKeyboard.length > 0 ? [inlineKeyboard] : undefined,
        },
      });
      await logger.info(`Message sent successfully to user ${userId}`);
    } catch (error) {
      await logger.error(`Failed to send message to user ${userId}: ${error}`);
      throw error;
    }
  }

  // Wait for response
  const startTime = Date.now();
  const userIdSet = new Set(config.telegramUserIds);

  // Clear any pending updates from previous sessions
  let lastUpdateId: number;
  try {
    const oldUpdates = await bot.api.getUpdates({ timeout: 0 });
    if (oldUpdates.length > 0) {
      const lastUpdate = oldUpdates[oldUpdates.length - 1];
      if (lastUpdate.update_id !== undefined) {
        lastUpdateId = lastUpdate.update_id;
        await logger.debug(
          `Cleared ${oldUpdates.length} old update(s), starting from update_id ${lastUpdateId}`
        );
      } else {
        lastUpdateId = 0;
      }
    } else {
      lastUpdateId = 0;
    }
  } catch (error) {
    await logger.debug(`Error clearing old updates: ${error}`);
    lastUpdateId = 0;
  }

  while (true) {
    // Check timeout
    if (config.telegramTimeoutMs > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= config.telegramTimeoutMs) {
        await logger.warn(
          `Timeout waiting for Telegram response (${config.telegramTimeoutMs}ms)`
        );
        throw new Error("timeout waiting for response");
      }
    }

    // Poll for updates
    try {
      const updates = await bot.api.getUpdates({
        offset: lastUpdateId + 1, // Get only new updates
        timeout: 0, // Don't use long polling
      });

      if (updates.length > 0) {
        await logger.debug(`Received ${updates.length} update(s) from Telegram`);
      }

      for (const update of updates) {
        // Track this update ID to mark it as consumed
        if (update.update_id !== undefined) {
          lastUpdateId = update.update_id;
        }

        // Handle callback query (button press)
        if (update.callback_query) {
          const query = update.callback_query;
          const fromId = query.from.id;

          // Only process from configured users
          if (!userIdSet.has(fromId)) {
            await logger.debug(`Ignoring callback from unauthorized user ${fromId}`);
            continue;
          }

          const callbackData = query.data;
          if (!callbackData) continue;

          // Find matching callback
          const matchedCallback = callbacks.find((cb) => {
            if (cb.type !== "inline-button") return false;
            if (typeof cb.command === "string") {
              return cb.command === callbackData;
            } else {
              return cb.command.test(callbackData);
            }
          });

          if (matchedCallback) {
            await logger.info(`Received callback: ${callbackData}`);

            // Answer the callback query
            await bot.api.answerCallbackQuery(query.id, {
              text: "✓ Received",
            });

            // Execute handler
            const match = typeof matchedCallback.command === "string"
              ? callbackData
              : callbackData.match(matchedCallback.command);
            await matchedCallback.handler(match || callbackData);

            // Return raw callback data
            return callbackData;
          } else {
            await logger.debug(`Ignoring unknown callback: ${callbackData}`);
            await bot.api.answerCallbackQuery(query.id);
          }
        }

        // Handle text message
        if (update.message && update.message.text) {
          const fromId = update.message.from.id;
          const text = update.message.text;

          await logger.debug(`Received text message from user ${fromId}: "${text}"`);

          // Only process from configured users
          if (!userIdSet.has(fromId)) {
            await logger.debug(`Ignoring message from unauthorized user ${fromId}`);
            continue;
          }

          // Find matching callback
          const matchedCallback = callbacks.find((cb) => {
            if (typeof cb.command === "string") {
              return text === cb.command;
            } else {
              return cb.command.test(text);
            }
          });

          if (matchedCallback) {
            await logger.info(`Received message matching callback: ${text}`);

            // Execute handler
            const match = typeof matchedCallback.command === "string"
              ? text
              : text.match(matchedCallback.command);
            await matchedCallback.handler(match || text);

            // Return raw message
            return text;
          } else {
            await logger.debug(`Ignoring unmatched message: ${text}`);
          }
        }
      }
    } catch (error) {
      await logger.error(`Error polling Telegram updates: ${error}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
