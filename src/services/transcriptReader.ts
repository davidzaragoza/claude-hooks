// Service for reading Claude session transcripts from JSONL files

import type {
  LastMessagesResult,
  TranscriptContent,
  TranscriptEntry,
} from "../types/TranscriptMessage";

/**
 * Extracts text content from a message content field
 * @param content - The content field (string or array of content blocks)
 * @param mode - "all" to concatenate all text blocks, "last" to get only the last one
 * @returns Text string
 */
function extractTextContent(
  content: string | TranscriptContent[],
  mode: "all" | "last" = "all"
): string {
  if (typeof content === "string") {
    return content;
  }

  // Filter for text blocks
  const textBlocks = content.filter((block) => block.type === "text");

  if (mode === "last") {
    // Return only the last text block
    const lastBlock = textBlocks[textBlocks.length - 1];
    return lastBlock?.text || "";
  }

  // Concatenate all text blocks
  return textBlocks.map((block) => block.text || "").join("");
}

/**
 * Checks if a user message is a tool result (should be excluded)
 * @param content - The content field (string or array of content blocks)
 * @returns true if this is a tool result message
 */
function isToolResult(content: string | TranscriptContent[]): boolean {
  if (typeof content === "string") {
    return false;
  }

  // Check if any content block is a tool_result
  return content.some((block) => block.type === "tool_result");
}

/**
 * Reads a Claude transcript JSONL file and returns the last user and assistant messages
 * @param transcript_path - Path to the JSONL transcript file
 * @returns Object containing last user and assistant message text (or null if not found)
 */
export async function getLastUserAndAssistantMessages(
  transcript_path: string
): Promise<LastMessagesResult> {
  let lastUserMessage: string | null = null;
  let lastAssistantMessage: string | null = null;

  try {
    // Read the file
    const file = Bun.file(transcript_path);
    const exists = await file.exists();

    if (!exists) {
      console.error(`Transcript file not found: ${transcript_path}`);
      return { lastUserMessage: null, lastAssistantMessage: null };
    }

    const text = await file.text();

    // Return empty result if file is empty
    if (!text.trim()) {
      return { lastUserMessage: null, lastAssistantMessage: null };
    }

    // Split by newlines and process each line
    const lines = text.split("\n").filter((line) => line.trim() !== "");

    for (const line of lines) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);

        // Skip entries without message field
        if (!entry.message) {
          continue;
        }

        // Process user messages (excluding tool results)
        if (
          entry.type === "user" &&
          !isToolResult(entry.message.content)
        ) {
          lastUserMessage = extractTextContent(entry.message.content);
        }

        // Process assistant messages
        if (entry.type === "assistant") {
          lastAssistantMessage = extractTextContent(entry.message.content, "last");
        }
      } catch (parseError) {
        // Silently skip malformed JSON lines
        console.warn(`Failed to parse transcript line: ${parseError}`);
      }
    }

    return { lastUserMessage, lastAssistantMessage };
  } catch (error) {
    console.error(`Error reading transcript: ${error}`);
    return { lastUserMessage: null, lastAssistantMessage: null };
  }
}
