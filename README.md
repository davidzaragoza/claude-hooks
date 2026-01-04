# Claude Code Hooks

A TypeScript implementation of custom hooks for [Claude Code](https://claude.ai/code), enabling remote approval and monitoring via Telegram.

## Features

- **Permission Hook**: Require remote approval for tool usage via Telegram
- **Stop Hook**: Review and optionally block Claude's responses after completion
- **Telegram Integration**: Real-time notifications and approval workflow
- **Auto-Approval**: Configure trusted tools to skip manual approval
- **Structured Logging**: Comprehensive logging with configurable levels
- **Type-Safe**: Written in strict TypeScript

## Project Overview

This project extends Claude Code with custom hooks that integrate with Telegram for remote supervision. Perfect for monitoring AI agent behavior and maintaining control over tool usage.

### Currently Implemented Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| **PermissionRequest** | Before Claude uses a tool | Require approval via Telegram |
| **Stop** | After Claude responds | Review and optionally block or continue iterating |

## Installation

### Prerequisites

- **Bun** runtime (>= 1.0.0)
- **Claude Code** installed and configured
- **Telegram** account and bot (for remote approval)

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/claude-hooks.git
   cd claude-hooks
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Run the installer:**
   ```bash
   bun run install-hooks.ts
   ```

   The installer will:
   - Prompt you for Telegram bot token and user ID (optional, can skip)
   - Create `config.json` with your settings
   - Register hooks with Claude Code (`~/.claude/settings.json`)
   - Verify hook files are executable

   **Note:** If you skip Telegram setup, you can configure it later by editing `config.json`

4. **Verify installation:**
   ```bash
   # Check hooks are registered
   cat ~/.claude/settings.json | grep -A 10 "hooks"
   ```

## Configuration

The installer creates `config.json` in the project root. Here's the structure:

```json
{
  "logLevel": "info",
  "logFile": "./logs.log",
  "telegramEnabled": true,
  "telegramBotToken": "your-bot-token-from-botfather",
  "telegramUserIds": [123456789],
  "telegramTimeoutMs": 600000,
  "telegramPollIntervalMs": 10000,
  "permissionHookEnabled": true,
  "permissionHookToolsAutoApproved": ["Read", "Glob", "Grep"],
  "permissionHookTimeoutMs": 600000,
  "permissionHookAllowOnTimeout": false
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logLevel` | string | `"info"` | Logging level: `debug`, `info`, `warn`, `error` |
| `logFile` | string | `"./logs.log"` | Path to log file |
| `telegramEnabled` | boolean | `true` | Enable Telegram integration |
| `telegramBotToken` | string | - | Bot token from [@BotFather](https://t.me/BotFather) |
| `telegramUserIds` | number[] | - | Telegram user IDs to notify from [@userinfobot](https://t.me/userinfobot) |
| `telegramTimeoutMs` | number | `600000` | Max wait for Telegram response (10 min) |
| `telegramPollIntervalMs` | number | `10000` | Response check interval (10 sec) |
| `permissionHookEnabled` | boolean | `true` | Enable permission hook |
| `permissionHookToolsAutoApproved` | string[] | `[]` | Tools to auto-approve without prompting |
| `permissionHookTimeoutMs` | number | `600000` | Permission request timeout (10 min) |
| `permissionHookAllowOnTimeout` | boolean | `false` | Allow (true) or deny (false) on timeout |

## Telegram Setup

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow the instructions to name your bot
4. Save the bot token (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2. Get Your Telegram User ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your user ID (a number)
3. Add this number to `telegramUserIds` array

### 3. Test Your Bot

1. Find your bot on Telegram (search for your bot's username)
2. Send `/start` to your bot
3. The hooks will now send messages to this bot

## Usage

### Permission Hook Workflow

When Claude Code attempts to use a tool:

1. Permission hook triggers
2. If tool is in `permissionHookToolsAutoApproved`: automatically allow
3. Otherwise: send Telegram notification with tool details
4. User approves (✓) or denies (✗) via Telegram buttons
5. On timeout: behavior determined by `permissionHookAllowOnTimeout`

**Example Telegram Message:**
```
🔐 Permission Request

Session: abc123
Working: /home/user/project
Tool: Bash

Parameters:
{
  "command": "rm -rf /important/files"
}

---
• Approve - Allow this tool use
• Deny - Block this tool use
```

### Stop Hook Workflow

When Claude Code finishes responding:

1. Stop hook triggers
2. Send Telegram notification with:
   - Session ID
   - Last user message
   - Claude's response (truncated to 3500 chars)
3. User can:
   - Press "✓ Stop" to allow Claude to finish (default)
   - Reply `/continue [sessionId] [reason]` to block the response

### Viewing Logs

```bash
# View logs in real-time
tail -f logs.log

# View all logs
cat logs.log

# Filter by level
grep "ERROR" logs.log
```

## Development

### Project Structure

```
src/
├── hooks/
│   ├── permission.ts          # Permission hook executable
│   └── stop.ts                # Stop hook executable
├── services/
│   ├── config.ts              # Configuration loader
│   ├── logger.ts              # Logging service
│   ├── telegram.ts            # Telegram integration
│   └── transcriptReader.ts    # Transcript parser
└── types/
    ├── PermissionHookInput.ts
    ├── PermissionHookOutput.ts
    ├── StopHookInput.ts
    ├── StopHookOutput.ts
    ├── TranscriptMessage.ts
    └── Config.ts
```

## How It Works

### Hook Communication Protocol

Claude Code hooks communicate via **stdin/stdout**:

1. Claude Code triggers a hook event
2. JSON input is piped to the hook via stdin
3. The hook processes the input
4. Optionally returns JSON output via stdout
5. The hook can return decisions affecting Claude's behavior

### Example Hook Input (PermissionRequest)

```json
{
  "session_id": "abc123",
  "cwd": "/home/user/project",
  "transcript_path": "/home/user/.claude/sessions/abc123/transcript.jsonl",
  "permission_mode": "auto",
  "hook_event_name": "PermissionRequest",
  "tool_name": "Bash",
  "tool_input": {
    "command": "echo 'hello'"
  },
  "tool_use_id": "toolu_01abc123"
}
```

### Example Hook Output (PermissionRequest)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow"
    }
  }
}
```

## Troubleshooting

### Hooks Not Triggering

1. Verify hooks are registered:
   ```bash
   cat ~/.claude/settings.json | grep -A 20 '"hooks"'
   ```

2. Check hook files are executable:
   ```bash
   ls -l src/hooks/*.ts
   # Should show -rwx--x--x permissions
   ```

3. Check Claude Code logs for errors

### Telegram Messages Not Arriving

1. Verify bot token is correct
2. Start a conversation with your bot (send `/start`)
3. Check your user ID is correct (message @userinfobot)
4. Check logs for errors: `cat logs.log | grep -i telegram`

### Permission Hook Timeout

If permission requests timeout frequently:
- Increase `permissionHookTimeoutMs` in `config.json`

## Security Considerations

- **Bot Token**: Keep `telegramBotToken` secret. Never commit `config.json` to git
- **Timeout Behavior**: Default timeout behavior is `deny` for safety
- **Auto-Approval**: Only auto-approve safe tools (Read, Glob, Grep)
- **File Permissions**: Hooks run with your user permissions - validate tool inputs

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Fork the repository
git clone https://github.com/yourusername/claude-hooks.git
cd claude-hooks

# Install dependencies
bun install

# Make changes and test
bun run install-hooks.ts
```

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built for [Claude Code](https://claude.ai/code)
- Uses [Bun](https://bun.sh) as runtime
- Integrates with [Telegram Bot API](https://core.telegram.org/bots/api)

## Support

- **Issues**: [GitHub Issues](https://github.com/davidzaragoza/claude-hooks/issues)