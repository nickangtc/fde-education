# fde-education

## Project Conventions

- Prefer terminal-first flows for demos and experiments in this repo unless the user explicitly asks for a browser UI.
- When showing LLM behavior, favor observable step-by-step terminal output over building extra interface layers.
- When adding multiple examples of the same primitive, use consistent workflow naming across scripts, files, and docs so the demos read as a matched set.
- For routing demos intended for teaching, prefer small interactive menus with hard-coded examples so different branches can be exercised predictably from the terminal.
- For CLI-based demos, add a proper `--help` path instead of letting help flags fall through as example input.
- Capture reusable design insights from workflow experiments in the repo-root `learnings.md`, especially when a prompting or orchestration detail changes output quality.
- Keep shared external references in the repo-root `resources.md`, and link to that file from sub-READMEs instead of repeating raw source links in multiple places.

## Pre-Commit

- Before every `git commit`, run the `compound-learnings` workflow and create `.codex/compound-learnings.ok`.
- Do not stage or commit `.codex/compound-learnings.ok`.
