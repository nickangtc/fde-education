# llm-primitives

Terminal-first playground for learning LLM primitives with observable step-by-step
CLI runs.

## Working pattern

For this package, the terminal is the interface. Environment variables stay local,
and each chain prints its request and response steps directly in the CLI.

## Prompt chaining demo

This demo uses the OpenAI Responses API with `gpt-5.4-mini` for two linked steps:

1. Generate marketing copy for the fictional Album app from a brief.
2. Translate that copy into another language.
3. Print each request and response as observable terminal output.

The script includes a small gate between steps to ensure each response still
contains `Headline`, `Body`, and `CTA`.

## Run locally

Install dependencies:

```bash
npm install
```

Run the prompt chain:

```bash
npm run prompt-chain
```

The script reads `OPENAI_API_KEY` from the repo root `.env` file and prints the
observable chain directly in the terminal.

You can also pass a custom brief and target language:

```bash
node prompt-chain-cli.js "Album helps close friends share private family memories." "French"
```
