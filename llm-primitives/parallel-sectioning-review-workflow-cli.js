import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { cursorTo, clearScreenDown } from "node:readline";
import {
  formatFixtureMenu,
  getFixtureById,
} from "./lib/substack-fixtures.js";
import {
  AGGREGATOR_MODEL,
  REVIEWERS,
  REVIEW_MODEL,
  runParallelReviewWorkflow,
} from "./lib/parallel-sectioning-review-workflow.js";

const SPINNER_FRAMES = ["-", "\\", "|", "/"];

function printUsage() {
  console.log("Usage: node parallel-sectioning-review-workflow-cli.js");
  console.log("");
  console.log("Choose one of three Substack post fixtures, then watch four review tasks run in parallel.");
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortText(text, maxLength = 48) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

async function promptForSelection() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("Select a Substack post to review in parallel:");
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
    reviewers: Object.fromEntries(
      REVIEWERS.map((reviewer) => [
        reviewer.id,
        {
          label: reviewer.label,
          status: "queued",
          durationMs: null,
          verdict: null,
        },
      ]),
    ),
    aggregator: {
      status: "queued",
      durationMs: null,
      recommendation: null,
    },
    frame: 0,
  };
}

function applyUpdate(state, update) {
  switch (update.type) {
    case "input_ready":
      state.articleWordCount = update.article.split(/\s+/u).filter(Boolean).length;
      break;
    case "reviewer_started":
      state.reviewers[update.reviewerId].status = "running";
      break;
    case "reviewer_completed":
      state.reviewers[update.reviewerId].status = "done";
      state.reviewers[update.reviewerId].durationMs = update.durationMs;
      state.reviewers[update.reviewerId].verdict = update.output.verdict;
      break;
    case "aggregator_started":
      state.aggregator.status = "running";
      break;
    case "aggregator_completed":
      state.aggregator.status = "done";
      state.aggregator.durationMs = update.durationMs;
      state.aggregator.recommendation = update.output.publish_recommendation;
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
  const inputLabel = shortText(state.fixture.title, 36);

  lines.push("=== Parallel Sectioning Review Workflow ===");
  lines.push("");
  lines.push(`[Input] ${inputLabel}`);
  lines.push(`        ${state.fixture.publishedAt} · ${state.articleWordCount || "?"} words`);
  lines.push("");

  REVIEWERS.forEach((reviewer, index) => {
    const reviewerState = state.reviewers[reviewer.id];
    const connector = index === REVIEWERS.length - 1 ? "└" : "├";
    const badge = statusBadge(reviewerState.status, state.frame);
    const duration = reviewerState.durationMs ? ` ${formatDuration(reviewerState.durationMs)}` : "";
    const verdict = reviewerState.verdict
      ? ` · ${shortText(reviewerState.verdict, 58)}`
      : "";
    lines.push(
      `[Input] ${connector}──► [${reviewer.label}] ${badge}${duration}${verdict}`,
    );
  });

  lines.push("");
  lines.push("                    └──────────────┬──────────────┘");
  lines.push("                                   ▼");
  lines.push(
    `[Aggregator] ${statusBadge(state.aggregator.status, state.frame)}${
      state.aggregator.durationMs ? ` ${formatDuration(state.aggregator.durationMs)}` : ""
    }${
      state.aggregator.recommendation
        ? ` · ${state.aggregator.recommendation}`
        : ""
    }`,
  );
  lines.push("");
  lines.push(`Reviewer model: ${REVIEW_MODEL}`);
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

function printFinalReport(result) {
  console.log("\n=== Final Output ===");
  console.log(`Title: ${result.fixture.title}`);
  console.log(`Recommendation: ${result.finalReport.publish_recommendation}`);
  console.log("");
  console.log(result.finalReport.overall_assessment);
  console.log("");
  console.log("Key strengths:");
  for (const item of result.finalReport.key_strengths) {
    console.log(`- ${item}`);
  }
  console.log("");
  console.log("Main issues:");
  for (const item of result.finalReport.main_issues) {
    console.log(`- ${item}`);
  }
  console.log("");
  console.log("Revision plan:");
  for (const item of result.finalReport.revision_plan) {
    console.log(`- ${item}`);
  }
  console.log("");
  console.log(`Strongest line: ${result.finalReport.strongest_line}`);
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

  const result = await runParallelReviewWorkflow({
    fixture,
    onUpdate(update) {
      applyUpdate(state, update);
      draw(state);
    },
  });

  clearInterval(timer);
  state.frame += 1;
  draw(state);
  printFinalReport(result);
} catch (error) {
  if (error?.status === 401) {
    console.error(
      "OpenAI rejected the API key from ../.env. Double-check OPENAI_API_KEY and try again.",
    );
  } else {
    console.error("Parallel sectioning review workflow failed:", error.message);
  }

  process.exit(1);
}
