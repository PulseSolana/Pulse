# Contributing

## Local Setup

```bash
bun install
cp .env.example .env
bun run dev
```

## Contribution Rules

- keep flow-model changes separate from presentation and prompt changes
- update tests when pulse score or regime behavior changes
- keep visuals readable as product screens, not abstract diagrams

## Pull Request Notes

- explain which pulse component or regime rule changed
- include a sample output block when ranking behavior changes
- update the runbook if the operator workflow changed
