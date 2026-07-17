# Scout human-agent avatars

These five portraits are AI-generated fictional people. They may be used as interface
avatars or representative illustrations, but must not be presented as photographs of
specific real employees.

Regenerate the set from the repository root:

```bash
OPENAI_API_KEY=... bash scripts/generate-human-agent-avatars.sh
```

The generator uses the prompts in
`scripts/human-agent-avatar-prompts.jsonl` and overwrites the five named WebP files.
