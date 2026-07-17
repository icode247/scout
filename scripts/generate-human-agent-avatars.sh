#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is required." >&2
  exit 1
fi

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
IMAGE_GEN="$CODEX_HOME/skills/.system/imagegen/scripts/image_gen.py"
PROMPTS="scripts/human-agent-avatar-prompts.jsonl"
OUTPUT_DIR="public/assets/agents"

if [[ ! -f "$IMAGE_GEN" ]]; then
  echo "Image generator not found at $IMAGE_GEN" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

python "$IMAGE_GEN" generate-batch \
  --input "$PROMPTS" \
  --out-dir "$OUTPUT_DIR" \
  --concurrency 5 \
  --force

echo "Generated five fictional Scout human-agent avatars in $OUTPUT_DIR"
