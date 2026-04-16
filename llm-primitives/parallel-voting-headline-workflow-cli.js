import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { cursorTo, clearScreenDown } from "node:readline";
import {
  AGGREGATOR_MODEL,
  CANDIDATE_MODEL,
  formatFixtureMenu,
  getFixtureById,
  JUDGES,
  JUDGE_MODEL,
  runHeadlineVotingWorkflow,
} from "./lib/parallel-voting-headline-workflow.js";

const SPINNER_FRAMES = ["-", "\\", "|", "/"];

function printUsage() {
  console.log("Usage: node parallel-voting-headline-workflow-cli.js");
  console.log("");
  console.log("Choose one of three Substack post fixtures, generate headline candidates, and watch parallel judges vote.");
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortText(text, maxLength = 50) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

async function promptForSelection() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("Select a Substack post for headline voting:");
    console.log("");
    console.log(formatFixtureMenu());
    console.log("");

    const answer = await rl.question("Enter a number (1-3) and press Enter: ");
    const selection = Number.parseInt(answer, 10);

    if (!Number.isInteger(selection)) {
      throw new Error("Please enter a whole number from 1 to 3.");
    }

    const fixture = getFixtureById(selection);
    if (!fixture) {
      throw new Error("That selection is out of range. Choose a number from 1 to 3.");
    }

    return fixture;
  } finally {
    rl.close();
  }
}

function createInitialState(fixture) {
  return {
    fixture,
    articleWordCount: 0,
    candidateGeneration: {
      status: "queued",
      durationMs: null,
      candidates: [],
    },
    judges: Object.fromEntries(
      JUDGES.map((judge) => [
        judge.id,
        {
          label: judge.label,
          status: "queued",
          durationMs: null,
          selectedCandidateId: null,
          rationale: null,
        },
      ]),
    ),
    aggregator: {
      status: "queued",
      durationMs: null,
      winner: null,
    },
    frame: 0,
  };
}

function applyUpdate(state, update) {
  switch (update.type) {
    case "input_ready":
      state.articleWordCount = update.article.split(/\s+/u).filter(Boolean).length;
      break;
    case "candidate_generation_started":
      state.candidateGeneration.status = "running";
      break;
    case "candidate_generation_completed":
      state.candidateGeneration.status = "done";
      state.candidateGeneration.durationMs = update.durationMs;
      state.candidateGeneration.candidates = update.candidates;
      break;
    case "judge_started":
      state.judges[update.judgeId].status = "running";
      break;
    case "judge_completed":
      state.judges[update.judgeId].status = "done";
      state.judges[update.judgeId].durationMs = update.durationMs;
      state.judges[update.judgeId].selectedCandidateId = update.output.selected_candidate_id;
      state.judges[update.judgeId].rationale = update.output.rationale;
      break;
    case "aggregator_started":
      state.aggregator.status = "running";
      break;
    case "aggregator_completed":
      state.aggregator.status = "done";
      state.aggregator.durationMs = update.durationMs;
      state.aggregator.winner = update.output.winning_candidate_id;
      break;
    case "clear_winner_selected":
      state.aggregator.status = "done";
      state.aggregator.durationMs = 0;
      state.aggregator.winner = update.output.winning_candidate_id;
      break;
    default:
      break;
  }
}

function statusBadge(status, frame) {
  if (status === "done") {
    return "[done]";
  }

  if (status === "running") {
    return `[${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}]`;
  }

  return "[wait]";
}

function renderDiagram(state) {
  const lines = [];
  const inputLabel = shortText(state.fixture.title, 38);

  lines.push("=== Parallel Voting Headline Workflow ===");
  lines.push("");
  lines.push(`[Input] ${inputLabel}`);
  lines.push(`        ${state.fixture.publishedAt} · ${state.articleWordCount || "?"} words`);
  lines.push("");
  lines.push(
    `[Candidate Generator] ${statusBadge(state.candidateGeneration.status, state.frame)}${
      state.candidateGeneration.durationMs
        ? ` ${formatDuration(state.candidateGeneration.durationMs)}`
        : ""
    }`,
  );

  if (state.candidateGeneration.candidates.length > 0) {
    lines.push("");
    for (const candidate of state.candidateGeneration.candidates) {
      lines.push(`  ${candidate.id}. ${shortText(candidate.headline, 72)}`);
    }
  }

  lines.push("");
  lines.push("                    ├──────────────┬──────────────┤");
  lines.push("                    ▼              ▼              ▼");

  JUDGES.forEach((judge) => {
    const judgeState = state.judges[judge.id];
    lines.push(
      `[${judge.label}] ${statusBadge(judgeState.status, state.frame)}${
        judgeState.durationMs ? ` ${formatDuration(judgeState.durationMs)}` : ""
      }${
        judgeState.selectedCandidateId ? ` · voted ${judgeState.selectedCandidateId}` : ""
      }${
        judgeState.rationale
          ? ` · ${shortText(judgeState.rationale, 52)}`
          : ""
      }`,
    );
  });

  lines.push("");
  lines.push("                    └──────────────┬──────────────┘");
  lines.push("                                   ▼");
  lines.push(
    `[Aggregator] ${statusBadge(state.aggregator.status, state.frame)}${
      state.aggregator.durationMs ? ` ${formatDuration(state.aggregator.durationMs)}` : ""
    }${state.aggregator.winner ? ` · winner ${state.aggregator.winner}` : ""}`,
  );
  lines.push("");
  lines.push(`Candidate model: ${CANDIDATE_MODEL}`);
  lines.push(`Judge model: ${JUDGE_MODEL}`);
  lines.push(`Aggregator model: ${AGGREGATOR_MODEL}`);

  return lines.join("\n");
}

function draw(state) {
  if (!output.isTTY) {
    return;
  }

  cursorTo(output, 0, 0);
  clearScreenDown(output);
  output.write(`${renderDiagram(state)}\n`);
}

function printFinalResult(result) {
  console.log("\n=== Final Output ===");
  console.log(`Title: ${result.fixture.title}`);
  console.log(`Winning candidate: ${result.finalResult.winning_candidate_id}`);
  console.log(`Winning headline: ${result.finalResult.winning_headline}`);
  console.log("");
  console.log(result.finalResult.why_it_won);
  console.log("");
  console.log("Vote summary:");
  for (const item of result.finalResult.vote_summary) {
    console.log(`- ${item.candidate_id}: ${item.votes} vote(s) — ${item.headline}`);
  }
  console.log("");
  console.log(`Optional refinement: ${result.finalResult.optional_refinement}`);
}

try {
  const arg = process.argv[2];
  if (arg === "--help" || arg === "-h") {
    printUsage();
    process.exit(0);
  }

  const fixture = await promptForSelection();
  const state = createInitialState(fixture);

  draw(state);

  const timer = setInterval(() => {
    state.frame += 1;
    draw(state);
  }, 120);

  const result = await runHeadlineVotingWorkflow({
    fixture,
    onUpdate(update) {
      applyUpdate(state, update);
      draw(state);
    },
  });

  clearInterval(timer);
  state.frame += 1;
  draw(state);
  printFinalResult(result);
} catch (error) {
  if (error?.status === 401) {
    console.error(
      "OpenAI rejected the API key from ../.env. Double-check OPENAI_API_KEY and try again.",
    );
  } else {
    console.error("Parallel voting headline workflow failed:", error.message);
  }

  process.exit(1);
}
