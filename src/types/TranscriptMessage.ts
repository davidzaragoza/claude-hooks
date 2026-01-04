// Type definitions for Claude transcript JSONL files

export type TranscriptEntryType =
  | "user"
  | "assistant"
  | "system"
  | "summary"
  | "file-history-snapshot";

// Individual content block in a message
export interface TranscriptContent {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  [key: string]: unknown; // Allow other unknown fields
}

// Message object within a transcript entry
export interface TranscriptMessage {
  role: string;
  content: string | TranscriptContent[];
  [key: string]: unknown; // Allow other unknown fields
}

// A single line in the JSONL transcript file
export interface TranscriptEntry {
  type: TranscriptEntryType;
  message?: TranscriptMessage;
  [key: string]: unknown; // Allow other unknown fields
}

// Result type for the transcript reader service
export interface LastMessagesResult {
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
}
