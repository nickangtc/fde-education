import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { cursorTo, clearScreenDown } from "node:readline";
import {
  FULL_MODEL,
  formatFixtureMenu,
  getFixtureById,
  MAX_ITERATIONS,
  MINI_MODEL,
  runEvaluatorOptimizerLinkedInWorkflow,
} from "./lib/evaluator-optimizer-linkedin-workflow.js";

const SPINNER_FRAMES = ["-", "\\", "|", "/"];
const MODEL_PAIR_OPTIONS = [
  {
    id: 1,
    label: "Mini + Mini",
    generatorModel: MINI_MODEL,
    evaluatorModel: MINI_MODEL,
  },
  {
    id: 2,
    label: "Mini + Full",
    generatorModel: MINI_MODEL,
    evaluatorModel: FULL_MODEL,
  },
  {
    id: 3,
    label: "Full + Mini",
    generatorModel: FULL_MODEL,
    evaluatorModel: MINI_MODEL,
  },
  {
    id: 4,
    label: "Full + Full",
    generatorModel: FULL_MODEL,
    evaluatorModel: FULL_MODEL,
  },
];

function printUsage() {
  console.log("Usage: node evaluator-optimizer-linkedin-workflow-cli.js");
  console.log("");
  console.log(
    "Choose one of three Substack post fixtures, then choose a generator/evaluator model pair and watch the loop run for up to five rounds.",
  );
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortText(text, maxLength = 64) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

async function promptForSelection() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("Select a Substack post for evaluator-optimizer LinkedIn writing:");
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

function formatModelPairMenu() {
  return MODEL_PAIR_OPTIONS.map(
    (option) =>
      `${option.id}. ${option.label} (${option.generatorModel} generator -> ${option.evaluatorModel} evaluator)`,
  ).join("\n");
}

async function promptForModelPair() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("Select a model pairing:");
    console.log("");
    console.log(formatModelPairMenu());
    console.log("");

    const answer = await rl.question("Enter a number (1-4) and press Enter: ");
    const selection = Number.parseInt(answer, 10);

    if (!Number.isInteger(selection)) {
      throw new Error("Please enter a whole number from 1 to 4.");
    }

    const option = MODEL_PAIR_OPTIONS.find((item) => item.id === selection);
    if (!option) {
      throw new Error("That selection is out of range. Choose a number from 1 to 4.");
    }

    return option;
  } finally {
    rl.close();
  }
}

function createInitialState(fixture, modelPair) {
  return {
    fixture,
    modelPair,
    articleWordCount: 0,
    maxIterations: MAX_ITERATIONS,
    currentIteration: 1,
    completedIterations: [],
    currentGenerator: {
      status: "queued",
      durationMs: null,
      intent: null,
    },
    currentEvaluator: {
      status: "queued",
      durationMs: null,
      score: null,
      verdict: null,
    },
    bestScore: null,
    bestIteration: null,
    finalIteration: null,
    frame: 0,
  };
}

function applyUpdate(state, update) {
  switch (update.type) {
    case "input_ready":
      state.articleWordCount = update.article.split(/\s+/u).filter(Boolean).length;
      state.maxIterations = update.maxIterations;
      break;
    case "generator_started":
      state.currentIteration = update.iteration;
      state.currentGenerator = {
        status: "running",
        durationMs: null,
        intent: null,
      };
      state.currentEvaluator = {
        status: "queued",
        durationMs: null,
        score: null,
        verdict: null,
      };
      break;
    case "generator_completed":
      state.currentGenerator.status = "done";
      state.currentGenerator.durationMs = update.durationMs;
      state.currentGenerator.intent = update.output.intent;
      break;
    case "evaluator_started":
      state.currentEvaluator.status = "running";
      break;
    case "evaluator_completed":
      state.currentEvaluator.status = "done";
      state.currentEvaluator.durationMs = update.durationMs;
      state.currentEvaluator.score = update.output.score;
      state.currentEvaluator.verdict = update.output.verdict;
      break;
    case "iteration_completed":
      state.completedIterations.push({
        iteration: update.iteration,
        score: update.output.evaluation.score,
        verdict: update.output.evaluation.verdict,
        stopped: update.stopped,
      });
      state.bestScore = update.bestIteration.evaluation.score;
      state.bestIteration = update.bestIteration.iteration;
      state.finalIteration = update.output;
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
  const inputLabel = shortText(state.fixture.title, 40);

  lines.push("=== Evaluator-Optimizer LinkedIn Workflow ===");
  lines.push("");
  lines.push(`[Input] ${inputLabel}`);
  lines.push(`        ${state.fixture.publishedAt} · ${state.articleWordCount || "?"} words`);
  lines.push("");
  lines.push(`[Loop] Round ${state.currentIteration} of ${state.maxIterations}`);
  if (state.bestScore !== null) {
    lines.push(`       Best so far: round ${state.bestIteration} · score ${state.bestScore}`);
  }
  lines.push("");
  lines.push(
    `[Generator] ${statusBadge(state.currentGenerator.status, state.frame)}${
      state.currentGenerator.durationMs
        ? ` ${formatDuration(state.currentGenerator.durationMs)}`
        : ""
    }${
      state.currentGenerator.intent
        ? ` · ${shortText(state.currentGenerator.intent, 58)}`
        : ""
    }`,
  );
  lines.push("     │");
  lines.push("     ▼");
  lines.push(
    `[Evaluator] ${statusBadge(state.currentEvaluator.status, state.frame)}${
      state.currentEvaluator.durationMs
        ? ` ${formatDuration(state.currentEvaluator.durationMs)}`
        : ""
    }${
      state.currentEvaluator.score !== null
        ? ` · score ${state.currentEvaluator.score}`
        : ""
    }${
      state.currentEvaluator.verdict
        ? ` · ${shortText(state.currentEvaluator.verdict, 42)}`
        : ""
    }`,
  );
  lines.push("");
  lines.push("Recent rounds:");

  if (state.completedIterations.length === 0) {
    lines.push("  none yet");
  } else {
    for (const item of state.completedIterations.slice(-5)) {
      lines.push(
        `  ${item.iteration}. score ${item.score} · ${shortText(item.verdict, 54)}${
          item.stopped ? " · stop" : ""
        }`,
      );
    }
  }

  lines.push("");
  lines.push(`Model pair: ${state.modelPair.label}`);
  lines.push(`Generator model: ${state.modelPair.generatorModel}`);
  lines.push(`Evaluator model: ${state.modelPair.evaluatorModel}`);
  lines.push(`Max iterations: ${state.maxIterations}`);

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
  const finalDraft = result.bestIteration ?? result.finalIteration;

  console.log("\n=== Final Output ===");
  console.log(`Title: ${result.fixture.title}`);
  console.log(`Model pair: ${result.modelSummary.generator} generator -> ${result.modelSummary.evaluator} evaluator`);
  console.log(`Rounds completed: ${result.iterations.length}`);
  console.log(`Best score: ${finalDraft.evaluation.score}`);
  console.log(`Best round: ${finalDraft.iteration}`);
  console.log(`Verdict: ${finalDraft.evaluation.verdict}`);
  console.log("");
  console.log("Final LinkedIn draft:");
  console.log("");
  console.log(finalDraft.draft);
  console.log("");
  console.log("What matches:");
  for (const item of finalDraft.evaluation.what_matches) {
    console.log(`- ${item}`);
  }
  console.log("");
  console.log("What breaks voice:");
  for (const item of finalDraft.evaluation.what_breaks_voice) {
    console.log(`- ${item}`);
  }
  console.log("");
  console.log("Revision instructions from last evaluation:");
  for (const item of finalDraft.evaluation.revision_instructions) {
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
  const modelPair = await promptForModelPair();
  const state = createInitialState(fixture, modelPair);

  draw(state);

  const timer = setInterval(() => {
    state.frame += 1;
    draw(state);
  }, 120);

  const result = await runEvaluatorOptimizerLinkedInWorkflow({
    fixture,
    maxIterations: MAX_ITERATIONS,
    generatorModel: modelPair.generatorModel,
    evaluatorModel: modelPair.evaluatorModel,
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
    console.error("Evaluator-optimizer LinkedIn workflow failed:", error.message);
  }

  process.exit(1);
}
