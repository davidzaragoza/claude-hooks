# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Claude Code Hooks** project - a TypeScript implementation of custom hooks that integrate with Claude Code's hook system. Hooks are executable scripts triggered at specific points during Claude Code's lifecycle.

Currently implemented:
- **Stop Hook**: Executes when Claude Code finishes responding to a user request
- **Permission Hook**: Executes when Claude Code requests user permission for a tool

## Development Commands

This project uses **Bun** as the runtime and package manager (not npm/node).

```bash
# Install dependencies
bun install

# Run the stop hook directly (for testing)
bun run src/hooks/stop.ts

# Run the permission hook directly (for testing)
bun run src/hooks/permission.ts

# Type checking
bun --version  # Ensure Bun is installed
```

### Configuration

Edit `config.json` in the project root to adjust settings:

```json
{
  "logLevel": "debug",  // Options: "debug", "info", "warn", "error"
  "logFile": "./logs.log",
  "telegramEnabled": false,  // Set to true to enable Telegram integration
  "telegramBotToken": "your-bot-token",
  "telegramUserIds": [123456789],
  "permissionHookEnabled": false,  // Set to true to enable permission hook
  "permissionHookToolsAutoApproved": [],  // Tools to auto-approve (e.g., ["Bash", "Read"])
  "permissionHookTimeoutMs": 600000,  // Time to wait for permission response (10 minutes)
  "permissionHookAllowOnTimeout": false  // Whether to allow on timeout (false = deny, safer)
}
```

### Viewing Logs

Logs are written to the file specified in `config.json` (default: `./logs.log`):

```bash
# View logs in real-time
tail -f logs.log

# View all logs
cat logs.log
```

### Installing Hooks

To configure Claude Code to use these hooks, run the install script from the project root:

```bash
bun run install-hooks.ts
```

This script will:
- Create `config.json` interactively (if it doesn't exist)
  - Prompt for Telegram bot token and user ID
  - You can skip Telegram setup and configure it later
- Verify the hook files exist
- Register the hooks in `~/.claude/settings.json`
- Preserve any existing hook configurations
- Provide feedback on what was installed

**Requirements:**
- Claude Code must be installed (creates `~/.claude` directory)

**What it does:**
The script adds the hooks to your Claude Code settings:
- **PermissionRequest hook** → `src/hooks/permission.ts`
- **Stop hook** → `src/hooks/stop.ts`

If you run the script multiple times, it will detect existing hooks and skip duplicates.

**First Run:**
On first run, the installer will create `config.json` with your settings:
- `telegramEnabled`: Set to `true` if you provide Telegram credentials, `false` if skipped
- `permissionHookEnabled`: Set to `true` if Telegram is enabled, `false` otherwise
- Other settings use sensible defaults

You can always edit `config.json` later to adjust settings.

## Architecture

### Hook Communication Protocol

Claude Code hooks communicate via **stdin/stdout**:
1. Claude Code triggers a hook event
2. JSON input is piped to the hook via stdin
3. The hook processes the input and optionally returns JSON output via stdout
4. The hook can return decisions that affect Claude Code's behavior

### Project Structure

```
src/
├── hooks/
│   ├── stop.ts                    # Executable hook script (+x permissions, shebang)
│   └── permission.ts              # Executable hook script (+x permissions, shebang)
├── services/
│   ├── transcriptReader.ts        # Service for reading Claude session transcripts
│   ├── config.ts                  # Configuration loader
│   ├── logger.ts                  # Logging service with levels
│   └── telegram.ts                # Generic Telegram bot integration service
└── types/
    ├── StopHookInput.ts           # Input interface (session_id, transcript_path, cwd, etc.)
    ├── StopHookOutput.ts          # Output interface (decision: "block", reason)
    ├── PermissionHookInput.ts     # Input interface (tool_name, tool_input, tool_use_id, etc.)
    ├── PermissionHookOutput.ts    # Output interface (decision: "allow" | "deny")
    ├── TranscriptMessage.ts       # Transcript message types
    └── Config.ts                  # Configuration types and defaults
config.json                         # Project configuration (log level, log file path, Telegram settings)
```

### Stop Hook Behavior

The stop hook:
- Receives session metadata (session ID, transcript path, working directory, permission mode)
- Retrieves the last user and assistant messages from the transcript
- Logs all activity using the structured logging system
- When Telegram integration is enabled, sends notifications and waits for user approval
- Can optionally return `{ decision: "block", reason: string }` to prevent Claude's response from being shown
- Uses `stop_hook_active` flag to control whether blocking is enforced
- Uses exit code 0 for success, 1 for errors

### Permission Hook Behavior

The permission hook:
- Executes when Claude Code requests user permission to use a tool
- Receives tool metadata (tool name, tool input, tool use ID, session info)
- Checks if the hook is enabled via `permissionHookEnabled` config
- Auto-approves tools listed in `permissionHookToolsAutoApproved` without prompting
- Requires Telegram integration to be enabled for manual approvals
- Sends a formatted message to Telegram with the tool name and parameters
- Presents "✓ Approve" and "✗ Deny" buttons for user decision
- Uses `permissionHookTimeoutMs` for timeout (separate from stop hook timeout)
- On timeout: allows or denies based on `permissionHookAllowOnTimeout` (default: deny for safety)
- Returns `{ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" | "deny" } } }`
- Uses exit code 0 for success, 2 for errors or invalid responses

### TypeScript Configuration

The project uses **strict TypeScript** with additional safety flags:
- `noUncheckedIndexedAccess`: Prevents accidental undefined access
- `noImplicitOverride`: Requires explicit override keyword
- `noEmit: true`: Type-checking only; Bun executes TypeScript directly

**No compilation step**: Bun runs TypeScript files directly via its JIT compiler.

## Configuration

The project uses `config.json` in the project root for configuration:

```json
{
  "logLevel": "debug",
  "logFile": "./logs.log"
}
```

### Configuration Options

- **logLevel**: Controls logging verbosity (`"debug"`, `"info"`, `"warn"`, `"error"`)
  - `debug`: Detailed diagnostic information
  - `info`: General informational messages (default)
  - `warn`: Warning messages
  - `error`: Error messages only

- **logFile**: Path to the log file where logs are written

- **telegramEnabled**: Enable Telegram bot integration (default: `false`)
- **telegramBotToken**: Telegram bot token from BotFather
- **telegramUserIds**: Array of Telegram user IDs to send notifications to
- **telegramTimeoutMs**: Maximum time to wait for Telegram approval (default: 600000ms / 10 minutes)
- **telegramPollIntervalMs**: Interval between checking for Telegram responses (default: 10000ms / 10 seconds)

- **permissionHookEnabled**: Enable the permission hook (default: `false`)
- **permissionHookToolsAutoApproved**: Array of tool names to auto-approve without prompting (default: `[]`)
- **permissionHookTimeoutMs**: Maximum time to wait for permission response (default: 600000ms / 10 minutes)
- **permissionHookAllowOnTimeout**: Whether to allow (`true`) or deny (`false`) on timeout (default: `false` - deny for safety)

The configuration is loaded via `src/services/config.ts` and cached for performance.

See the [Telegram Integration](#telegram-integration) section for detailed setup instructions.

## Logging System

The project includes a structured logging service (`src/services/logger.ts`) that provides:

### Features

- **Log levels**: debug, info, warn, error (filterable via config)
- **Context-aware logging**: Each logger instance has a context label
- **Structured format**: `[timestamp] [LEVEL] [context] message`
- **Automatic file writing**: Logs are appended to the configured log file

### Usage

```typescript
import { createLogger } from "../services/logger";

const logger = createLogger("MyModule");

await logger.debug("Detailed debug info");
await logger.info("General information");
await logger.warn("Warning message");
await logger.error("Error occurred");
```

### Log Output Format

```
[2025-01-04T12:34:56.789Z] [INFO] [StopHook] Last user message: hello
[2025-01-04T12:34:56.790Z] [ERROR] [StopHook] Error parsing input
```

## Services

### Transcript Reader Service

Located in `src/services/transcriptReader.ts`, this service reads Claude session transcripts from JSONL files.

#### Function: `getLastUserAndAssistantMessages`

```typescript
async function getLastUserAndAssistantMessages(
  transcript_path: string
): Promise<{
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
}>
```

**Behavior**:
- Reads the JSONL transcript file
- Finds the last "user" and "assistant" messages
- Excludes tool results (automatically filtered)
- For user messages: extracts all text content (concatenates if content is an array)
- For assistant messages: extracts only the last text block (to avoid excessive length)
- Returns the text content as strings, or `null` if not found

**Example**:
```typescript
import { getLastUserAndAssistantMessages } from "../services/transcriptReader";

const { lastUserMessage, lastAssistantMessage } =
  await getLastUserAndAssistantMessages(transcript_path);

console.log("User said:", lastUserMessage);
console.log("Assistant replied:", lastAssistantMessage);
```

### Telegram Service

Located in `src/services/telegram.ts`, this is a **generic** service for sending Telegram messages and waiting for user responses via callbacks. It is designed to be reusable by any hook that needs Telegram integration.

#### Types

```typescript
// Callback type
export type TelegramCallbackType = "inline-button" | "hidden";

// Callback interface
export interface TelegramCallback {
  type: TelegramCallbackType;
  display?: string;           // Button text for "inline-button" type
  command: string | RegExp;   // Pattern to match (string or regex)
  handler: (match: string | RegExpMatchArray) => void | Promise<void>;
}
```

#### Function: `sendTelegramMessage`

```typescript
async function sendTelegramMessage(
  textToSend: string,
  callbacks: TelegramCallback[],
  config: Config
): Promise<string>
```

**Parameters:**
- `textToSend`: The message text to send (max 4096 characters, throws if exceeded)
- `callbacks`: Array of callback objects defining how to handle responses
- `config`: Configuration object (must contain `telegramBotToken`, `telegramUserIds`, `telegramTimeoutMs`, `telegramPollIntervalMs`)

**Returns:** `Promise<string>` - The raw callback data that was matched

**Behavior:**
1. Validates message length (throws `Error` if exceeds 4096 characters)
2. Initializes bot with `config.telegramBotToken`
3. Builds inline keyboard from callbacks with `type: "inline-button"`
4. Sends message to all `config.telegramUserIds`
5. Polls for responses using `config.telegramTimeoutMs` and `config.telegramPollIntervalMs`
6. Matches incoming messages (button presses or text) against callback patterns
7. Executes the matched callback's handler function
8. Returns the raw callback data string

**Example Usage:**
```typescript
import { sendTelegramMessage, type TelegramCallback } from "../services/telegram";
import { loadConfig } from "../services/config";

const config = await loadConfig();

// Define callbacks
const callbacks: TelegramCallback[] = [
  {
    type: "inline-button",
    display: "✓ Approve",
    command: "/approve",
    handler: async () => {
      console.log("User approved");
    }
  },
  {
    type: "hidden",
    command: /^\/block\s+(.+)$/,
    handler: async (match) => {
      const reason = Array.isArray(match) ? match[1] : String(match);
      console.log(`User blocked with reason: ${reason}`);
    }
  }
];

// Send message and wait for response
const response = await sendTelegramMessage(
  "Please approve or block this action",
  callbacks,
  config
);

console.log(`User responded with: ${response}`);
```

**Callback Types:**
- **inline-button**: Creates a visible button in the Telegram message with `display` text. When clicked, sends `callback_data` matching the `command`.
- **hidden**: Does not create a button. Matches against text messages sent by the user.

**Pattern Matching:**
- String `command`: Exact match required (e.g., `"/approve"`)
- RegExp `command`: Pattern match (e.g., `/^\/block\s+(.+)$/`)
- Handler receives either:
  - A `RegExpMatchArray` if the command is a RegExp and matched
  - The original string if the command is a string or pattern didn't capture groups

## Telegram Integration

The stop hook can optionally send notifications via Telegram for user approval.

### Configuration

Add these fields to `config.json`:

```json
{
  "telegramEnabled": true,
  "telegramBotToken": "your-bot-token-from-botfather",
  "telegramUserIds": [123456789],
  "telegramTimeoutMs": 300000,
  "telegramPollIntervalMs": 10000
}
```

**Getting Started:**

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) on Telegram
   - Send `/newbot`
   - Follow instructions to name your bot
   - Save the bot token (looks like `123456:ABC-DEF...`)

2. Get your Telegram user ID
   - Message [@userinfobot](https://t.me/userinfobot) on Telegram
   - It will reply with your user ID (a number)

3. Update `config.json` with the bot token and your user ID
   - Set `telegramEnabled: true`
   - Set `telegramBotToken` to your bot token
   - Set `telegramUserIds` to an array with your user ID

**Workflow:**

When `telegramEnabled` is true:
1. After Claude responds, stop hook formats a message with session info, user message, and Claude's response
2. Stop hook builds an array of `TelegramCallback` objects:
   - An inline-button callback for approval (`/stop [sessionId]`)
   - A hidden callback for blocking with regex pattern (`/^\/continue\s+[sessionId]\s+(.+)$/`)
3. Stop hook calls `sendTelegramMessage(textToSend, callbacks, config)` to send the message
4. The telegram service sends the message and waits for a matching response
5. User can either:
   - Press "✓ Stop (allow claude to stop)" button → triggers the approval callback
   - Reply `/continue [sessionId] [reason]` → triggers the block callback with reason
6. Stop hook parses the returned raw callback data and outputs the appropriate decision

**Stop Hook Implementation:**

```typescript
// In src/hooks/stop.ts
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

const rawCallbackData = await sendTelegramMessage(textToSend, callbacks, config);

// Parse response and output decision
if (rawCallbackData === `/stop ${data.session_id}`) {
  // Approved - exit normally
} else {
  // Blocked - output block decision
  const blockMatch = rawCallbackData.match(/^\/continue\s+\S+\s+(.+)$/);
  if (blockMatch) {
    const hookResponse: StopHookOutput = {
      decision: "block",
      reason: blockMatch[1],
    };
    console.log(JSON.stringify(hookResponse, null, 2));
  }
}
```

### Message Truncation

To ensure messages fit within Telegram's 4096 character limit:
- User messages are truncated to 1000 characters
- Assistant messages are truncated to 3500 characters
- Template overhead is automatically calculated
- Total message length never exceeds 4096 characters
- Truncated messages show "..." at the end to indicate content was cut

### Message Handling

**Message Formatting**: The stop hook is responsible for formatting messages (using `formatMessage()` and `truncateMessage()` functions defined in `src/hooks/stop.ts`). The telegram service only validates that the total message length does not exceed 4096 characters.

**Format**: Messages are sent as plain text (not HTML) to avoid parsing errors with system reminder tags.

**Old Message Handling**: When the telegram service starts, it clears any pending updates from previous sessions to prevent processing old messages. This prevents infinite loops where old responses are mistakenly processed.

## Permission Hook Integration

The permission hook requires Telegram integration to be enabled and configured. It sends permission requests to Telegram for user approval when Claude Code attempts to use a tool.

### Configuration

Add these fields to `config.json`:

```json
{
  "permissionHookEnabled": true,
  "permissionHookToolsAutoApproved": ["Bash", "Read"],
  "permissionHookTimeoutMs": 600000,
  "permissionHookAllowOnTimeout": false,
  "telegramEnabled": true,
  "telegramBotToken": "your-bot-token-from-botfather",
  "telegramUserIds": [123456789]
}
```

**Getting Started:**

Follow the same setup steps as the [Telegram Integration](#telegram-integration) section to create a bot and get your user ID.

**Workflow:**

When `permissionHookEnabled` is true:
1. Claude Code attempts to use a tool and triggers the permission hook
2. Permission hook checks if the tool is in `permissionHookToolsAutoApproved`
   - If yes: automatically allows the tool use without prompting
   - If no: continues to step 3
3. Permission hook formats a message with session info, tool name, and tool parameters
4. Permission hook builds an array of `TelegramCallback` objects:
   - An inline-button callback for approval (`/approve [sessionId] [toolUseId]`)
   - An inline-button callback for denial (`/deny [sessionId] [toolUseId]`)
5. Permission hook calls `sendTelegramMessage(textToSend, callbacks, permissionConfig)` to send the message
   - Uses `permissionHookTimeoutMs` instead of the default `telegramTimeoutMs`
6. The telegram service sends the message and waits for a matching response
7. User can either:
   - Press "✓ Approve" button → allows the tool use
   - Press "✗ Deny" button → denies the tool use
   - Wait for timeout → behavior determined by `permissionHookAllowOnTimeout`
8. Permission hook outputs the decision via stdout and exits

**Permission Hook Implementation:**

```typescript
// In src/hooks/permission.ts
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

const rawCallbackData = await sendTelegramMessage(
  textToSend,
  callbacks,
  permissionConfig
);

// Parse response and output decision
const approvePattern = new RegExp(`^/approve\\s+(${data.session_id})\\s+(.+)$`);
const denyPattern = new RegExp(`^/deny\\s+(${data.session_id})\\s+(.+)$`);

const approveMatch = rawCallbackData.match(approvePattern);
const denyMatch = rawCallbackData.match(denyPattern);

if (approveMatch && approveMatch[1] === data.session_id) {
  outputDecision("allow");
} else if (denyMatch && denyMatch[1] === data.session_id) {
  outputDecision("deny");
} else {
  // Invalid response - deny for safety
  process.exit(2);
}
```

### Message Truncation

To ensure messages fit within Telegram's 4096 character limit:
- Tool input parameters are truncated to 2000 characters
- Template overhead is automatically calculated
- Total message length never exceeds 4096 characters
- Truncated messages show "..." at the end to indicate content was cut

### Timeout Behavior

The permission hook has configurable timeout behavior:

- **Timeout Duration**: Controlled by `permissionHookTimeoutMs` (default: 600000ms / 10 minute)
- **On Timeout**:
  - If `permissionHookAllowOnTimeout` is `true`: allows the tool use
  - If `permissionHookAllowOnTimeout` is `false` (default): denies the tool use (safer)
- The timeout is separate from the stop hook timeout, allowing shorter response times for permission requests

### Auto-Approved Tools

You can configure tools to be automatically approved without Telegram prompts:

```json
{
  "permissionHookToolsAutoApproved": ["Read", "Glob", "Grep"]
}
```

This is useful for low-risk tools that you trust Claude Code to use without manual approval.

## Key Patterns

1. **Executable Hooks**: Hook files must have execute permissions (`chmod +x`) and include a shebang (`#!/usr/bin/env bun`)

2. **Stdin Reading**: Hooks read JSON from stdin using `await Bun.stdin.text()`

3. **Logging**: Use the `createLogger()` service for all logging (don't use `console.log` or `appendFile` directly)
   ```typescript
   const logger = createLogger("HookName");
   await logger.info("Message");
   ```

4. **Error Handling**: Use try-catch with explicit exit codes; log errors using the logger

5. **Session Persistence**: The same `session_id` appears across multiple hook invocations within a single Claude Code session

6. **Using Services**: Import services from `src/services/` for shared functionality like transcript reading, logging, and Telegram integration

7. **Generic Telegram Service**: The `telegram.ts` service is designed to be reusable by any hook. When implementing new hooks that need Telegram:
   - Import `sendTelegramMessage` and `TelegramCallback` from `src/services/telegram`
   - Define your message formatting logic in the hook (not in the telegram service)
   - Build callbacks array with appropriate commands and handlers
   - Parse the returned raw callback data to determine user action
   - Always pass the full `Config` object to `sendTelegramMessage`
