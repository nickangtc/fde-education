import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { cursorTo, clearScreenDown } from "node:readline";
import {
  formatFixtureMenu,
  getFixtureById,
  ORCHESTRATOR_MODEL,
  WORKERS,
  WORKER_MODEL,
  runOrchestratorWorkersWorkflow,
} from "./lib/orchestrator-workers-substack-workflow.js";

const SPINNER_FRAMES = ["-", "\\", "|", "/"];

function printUsage() {
  console.log("Usage: node orchestrator-workers-substack-workflow-cli.js");
  console.log("");
  console.log("Choose one of three Substack post fixtures, let an orchestrator pick the worker tasks, then watch the results flow back into the orchestrator for the final output.");
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortText(text, maxLength = 58) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

async function promptForSelection() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("Select a Substack post for the orchestrator-workers demo:");
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
    planning: {
      status: "queued",
      durationMs: null,
      tasks: [],
      reason: null,
    },
    workers: Object.fromEntries(
      WORKERS.map((worker) => [
        worker.id,
        {
          label: worker.label,
          status: "idle",
          durationMs: null,
          summary: null,
        },
      ]),
    ),
    finalPass: {
      status: "queued",
      durationMs: null,
      editorNote: null,
    },
    frame: 0,
  };
}

function applyUpdate(state, update) {
  switch (update.type) {
    case "input_ready":
      state.articleWordCount = update.article.split(/\s+/u).filter(Boolean).length;
      break;
    case "orchestrator_planning_started":
      state.planning.status = "running";
      break;
    case "orchestrator_planning_completed":
      state.planning.status = "done";
      state.planning.durationMs = update.durationMs;
      state.planning.tasks = update.output.tasks;
      state.planning.reason = update.output.reason;
      for (const worker of WORKERS) {
        state.workers[worker.id].status = update.output.tasks.includes(worker.id)
          ? "queued"
          : "skipped";
      }
      break;
    case "worker_started":
      state.workers[update.workerId].status = "running";
      break;
    case "worker_completed":
      state.workers[update.workerId].status = "done";
      state.workers[update.workerId].durationMs = update.durationMs;
      state.workers[update.workerId].summary =
        update.workerId === "summarize"
          ? update.output.bullets.join(" | ")
          : update.output.recommended_headline;
      break;
    case "orchestrator_final_started":
      state.finalPass.status = "running";
      break;
    case "orchestrator_final_completed":
      state.finalPass.status = "done";
      state.finalPass.durationMs = update.durationMs;
      state.finalPass.editorNote = update.output.editor_note;
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

  if (status === "skipped") {
    return "[skip]";
  }

  if (status === "queued") {
    return "[wait]";
  }

  return "[idle]";
}

function renderDiagram(state) {
  const lines = [];

  lines.push("=== Minimal Orchestrator-Workers Workflow ===");
  lines.push("");
  lines.push(`[Input] ${shortText(state.fixture.title, 42)}`);
  lines.push(`        ${state.fixture.publishedAt} · ${state.articleWordCount || "?"} words`);
  lines.push("");
  lines.push(
    `[Orchestrator: plan] ${statusBadge(state.planning.status, state.frame)}${
      state.planning.durationMs ? ` ${formatDuration(state.planning.durationMs)}` : ""
    }${
      state.planning.tasks.length > 0
        ? ` · selected ${state.planning.tasks.join(", ")}`
        : state.planning.status === "done"
          ? " · selected no workers"
          : ""
    }`,
  );

  if (state.planning.reason) {
    lines.push(`  reason: ${shortText(state.planning.reason, 88)}`);
  }

  lines.push("");
  WORKERS.forEach((worker, index) => {
    const connector = index === WORKERS.length - 1 ? "└" : "├";
    const workerState = state.workers[worker.id];
    lines.push(
      `[Orchestrator] ${connector}──► [${worker.label}] ${statusBadge(workerState.status, state.frame)}${
        workerState.durationMs ? ` ${formatDuration(workerState.durationMs)}` : ""
      }${
        workerState.summary ? ` · ${shortText(workerState.summary, 62)}` : ""
      }`,
    );
  });

  lines.push("");
  lines.push("                     workers return to orchestrator");
  lines.push("                                   ▼");
  lines.push(
    `[Orchestrator: final] ${statusBadge(state.finalPass.status, state.frame)}${
      state.finalPass.durationMs ? ` ${formatDuration(state.finalPass.durationMs)}` : ""
    }${
      state.finalPass.editorNote ? ` · ${shortText(state.finalPass.editorNote, 58)}` : ""
    }`,
  );
  lines.push("");
  lines.push(`Orchestrator model: ${ORCHESTRATOR_MODEL}`);
  lines.push(`Worker model: ${WORKER_MODEL}`);

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
  console.log(`Selected tasks: ${result.finalOutput.selected_tasks.join(", ") || "none"}`);
  console.log("");
  console.log(result.finalOutput.editor_note);
  console.log("");
  console.log(`What the post is about: ${result.finalOutput.what_the_post_is_about}`);
  console.log(`Headline recommendation: ${result.finalOutput.headline_recommendation}`);
  console.log("");
  console.log("Summary preview:");
  for (const item of result.finalOutput.summary_preview) {
    console.log(`- ${item}`);
  }
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

  const result = await runOrchestratorWorkersWorkflow({
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
    console.error("Orchestrator-workers workflow failed:", error.message);
  }

  process.exit(1);
}
