#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

git checkout main --quiet && git pull --quiet

while true; do
  # Stop if no queue items (numbered list entries)
  if ! grep -qE '^\d+\.' QUEUE.md; then
    echo "Queue empty — done."
    break
  fi
  # Stop if something is already active
  if grep -qE '^\d+\..*\[active\]' QUEUE.md; then
    echo "An item is already active — exiting."
    break
  fi
  # Stop if [stop] tag is present
  if grep -qE '^\d+\..*\[stop\]' QUEUE.md; then
    echo "Stop requested — exiting."
    break
  fi
  # Stop if no [auto] items exist
  if ! grep -qE '^\d+\..*\[auto\]' QUEUE.md; then
    echo "No [auto] items — done."
    break
  fi

  echo "Work found — launching session..."
  claude --append-system-prompt "$(cat .claude/agents/autonomous.md)" -p "Process the next auto item from the queue."

  # Refresh main after session completes
  git checkout main --quiet && git pull --quiet
  sleep 5
done
