---
name: add-learning
description: Add or refine an entry in the repo-root learnings.md using the project's established format. Use when the user asks to add a learning, capture an insight, or update learnings from a workflow experiment in this repo.
---

# Add Learning

Add new learnings to [`learnings.md`](../../../learnings.md) in the same shape and voice the repo already uses. Bear in mind that this repo is about learning the fundamentals of LLMs that a FDE would need to do their job well. It's not a production system.

## When To Use

Use this skill when the user asks to:

- add a learning
- capture an insight
- write something into `learnings.md`
- refine or rewrite an existing learning entry

## Goal

Keep `learnings.md` compact, high-signal, and grounded in a specific implementation moment from this repo.

## Existing Shape To Follow

Read [`learnings.md`](../../../learnings.md) first and match its style.

Current entries generally follow this pattern:

1. A short, concrete `##` heading.
2. One short paragraph describing the implementation moment or surprise.
3. One short paragraph explaining the takeaway.
4. Optional flat bullets only when they materially clarify the design change, tradeoff, or resulting rule.

## Writing Rules

- Write only durable insights, not session chatter.
- Anchor the learning to a concrete workflow, file, or design choice from this repo when possible.
- Prefer specific tradeoffs over generic advice.
- Keep entries short; aim for two short paragraphs unless bullets add real value.
- Do not add a heading if the same learning already exists. Update the existing entry instead.
- Preserve the file's tone: practical, reflective, and implementation-focused.

## Update Process

1. Read the full `learnings.md`.
2. Check whether the insight already exists in substance.
3. If it exists, tighten or expand the existing section instead of duplicating it.
4. If it is new, append a new `##` section at the end unless it clearly belongs inside an existing section.
5. If the user mentions a specific workflow or file, include a markdown link when it helps clarify the context.

## Good Learning Shapes

Good:

- a concrete workflow surprise and the resulting design lesson
- a prompting or orchestration tradeoff that changed output quality
- a tool or API behavior that meaningfully affects how demos in this repo should be built

Avoid:

- temporary status updates
- broad principles with no repo context
- duplicate entries that restate an existing heading
