# llm-primitives

Terminal-first playground for learning LLM primitives with observable step-by-step
CLI runs.

## Working pattern

For this package, the terminal is the interface. Environment variables stay local,
and each chain prints its request and response steps directly in the CLI.

## Prompt chaining workflow demo

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

Run the prompt chaining workflow:

```bash
npm run prompt-chaining-workflow
```

The script reads `OPENAI_API_KEY` from the repo root `.env` file and prints the
observable chain directly in the terminal.

You can also pass a custom brief and target language:

```bash
node prompt-chaining-workflow-cli.js "Album helps close friends share private family memories." "French"
```

## Content routing workflow demo

This demo uses the OpenAI Responses API with `gpt-5.4-mini` for a simple routing
workflow inspired by Anthropic's routing pattern:

1. Parse and understand a Substack-style post.
2. Classify whether it is `very_technical` or `not_technical`.
3. Route to exactly one specialized writer:
   - `very_technical` -> Twitter/X post for tech Twitter
   - `not_technical` -> LinkedIn post with a broader thought-leadership tone
4. Print each request and response as observable terminal output.

This is still a single-output workflow: each input selects one branch and returns
one final post.

Run the content routing workflow and choose between a technical and non-technical sample:

```bash
npm run content-routing-workflow
```

Then enter `1` or `2` to route the selected post.

You can also bypass the menu and pass a file path or raw post text:

```bash
node content-routing-workflow-cli.js ./sample-post.txt
node content-routing-workflow-cli.js "Title: Why distribution matters more than features..."
```

## Model routing workflow demo

This demo shows the other routing pattern from the Anthropic article: sending
easy, common questions to a cheaper model and reserving a stronger model for
messages that are more nuanced or higher stakes.

The flow is:

1. Show an interactive menu of six hard-coded customer-support messages.
2. Classify the selected message for routing.
3. Send straightforward questions to `gpt-5.4-mini`.
4. Send more ambiguous or sensitive questions to `gpt-5.4`.
5. Print the routing decision and final response in the terminal.

Run it with:

```bash
npm run model-routing-workflow
```

Then choose a numbered example and press Enter.

## Parallel sectioning review workflow demo

This demo shows sectioning-style parallelization from the Anthropic article:
one Substack post is reviewed by four independent reviewers at the same time,
and their outputs are then aggregated into one final editorial report.

The flow is:

1. Choose one of three real Substack post fixtures stored as Markdown files.
2. Fan out into four parallel reviews:
   - clarity
   - structure
   - audience fit
   - hook and memorability
3. Wait for all reviewers to complete.
4. Run one aggregator step over the four review outputs.
5. Show the final recommendation and revision plan.

Unlike the other demos, the CLI redraws a simple terminal diagram so you can
watch the workflow progress without interleaved request dumps.

Run it with:

```bash
npm run parallel-sectioning-review-workflow
```

## Parallel voting headline workflow demo

This demo shows voting-style parallelization: one Substack post is used to
generate several candidate headlines, then multiple judges vote on the best
option in parallel before an aggregator picks the winner.

If the judges produce a clear winner, the workflow stops there. The aggregator
only runs on tied results, and in that case it sees the original article so it can break the tie intelligently.

The flow is:

1. Choose one of three real Substack post fixtures.
2. Generate four headline candidates.
3. Fan those candidates out to four parallel judges:
   - curiosity
   - clarity
   - audience fit
   - distinctiveness
4. Aggregate the votes and surface one winning headline.
5. Show the winner, vote summary, and a refinement suggestion.

Run it with:

```bash
npm run parallel-voting-headline-workflow
```
