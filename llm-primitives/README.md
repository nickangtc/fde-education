# llm-primitives

Sandbox for learning and testing LLM primitives with:
- OpenAI SDK
- Anthropic SDK

Planned areas to explore:
- prompts
- structured outputs
- tool calling
- streaming
- eval-style experiments

## OpenAI JS hello world

Install dependencies:

```bash
npm install
```

Run the first example:

```bash
npm run hello
```

This reads `OPENAI_API_KEY` from the repo root `.env` file and makes a single basic call using the OpenAI JavaScript SDK.
