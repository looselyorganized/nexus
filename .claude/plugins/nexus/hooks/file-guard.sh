#!/bin/bash
# File Guard Hook - verifies file claims before Edit/Write operations
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

allow() {
  echo "{\"decision\": \"allow\", \"reason\": \"$1\"}"
  exit 0
}

block() {
  local reason="$1"
  local file="${2:-$FILE_PATH}"
  local claimed_by="${3:-}"
  if [[ -n "$claimed_by" ]]; then
    echo "{\"decision\": \"block\", \"reason\": \"$reason\", \"details\": {\"file\": \"$file\", \"claimedBy\": \"$claimed_by\"}}"
  else
    echo "{\"decision\": \"block\", \"reason\": \"$reason\", \"details\": {\"file\": \"$file\"}}"
  fi
  exit 0
}

# No file path - allow
[[ -z "$FILE_PATH" ]] && allow "No file path provided"

# Skip excluded paths
case "$FILE_PATH" in
  *node_modules/*|*.git/*|*dist/*|*build/*|*.lock|*.env)
    allow "File excluded from claim checking"
    ;;
esac

# Check CLI availability
command -v nexus &>/dev/null || allow "Nexus CLI not installed"

# Get status
STATUS=$(nexus status --json 2>/dev/null || echo '{"error": true}')
echo "$STATUS" | jq -e '.error' &>/dev/null && allow "Could not check Nexus status"

# Get current engineer and claims
CLAIMS=$(echo "$STATUS" | jq -r '.claims // []' 2>/dev/null)

# Check if claimed by another engineer
CLAIMED_BY=$(echo "$CLAIMS" | jq -r --arg file "$FILE_PATH" '.[] | select(.filePath == $file) | .engineerName // .engineerId' 2>/dev/null || echo "")

if [[ -n "$CLAIMED_BY" ]]; then
  # Check if it's claimed by me
  MY_CLAIMS=$(echo "$STATUS" | jq -r '.claims[] | select(.engineerId == .currentEngineerId) | .filePath' 2>/dev/null || echo "")
  if echo "$MY_CLAIMS" | grep -qF "$FILE_PATH"; then
    allow "File claimed by current engineer"
  else
    block "File '$FILE_PATH' is claimed by $CLAIMED_BY. Release their claim first or coordinate with them." "$FILE_PATH" "$CLAIMED_BY"
  fi
fi

allow "File not claimed by anyone"
