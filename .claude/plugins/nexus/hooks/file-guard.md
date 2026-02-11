---
name: file-guard
description: Check if a file is claimed by another engineer before allowing edits
event: PreToolUse
tools:
  - Edit
  - Write
---

# File Guard Hook

Before editing or writing a file, check if it's claimed by another engineer via Nexus.

## Logic

1. Extract the `file_path` from the tool input
2. Skip checking for excluded paths (node_modules, .git, dist, .lock, .env)
3. Run `nexus status --json` to get current claims
4. If the file is claimed by the current engineer, allow
5. If the file is claimed by another engineer, block with explanation
6. If no claims data available (CLI not installed, not linked), allow
