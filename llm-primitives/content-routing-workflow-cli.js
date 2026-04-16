import {
  buildClassificationInput,
  buildLinkedInInput,
  buildParseInput,
  buildTwitterInput,
  formatRoutingMenu,
  getRoutingExampleById,
  classifySubstackPost,
  OPENAI_MODEL,
  parseSubstackPost,
  readSubstackInput,
  writeLinkedInPost,
  writeTwitterPost,
} from "./lib/content-routing-workflow.js";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const source = process.argv[2];

if (source === "--help" || source === "-h") {
  console.log("Usage: node content-routing-workflow-cli.js [post-text-or-path]");
  console.log("");
  console.log("Runs a content routing workflow over a Substack-style post.");
  console.log("If no argument is provided, an interactive menu lets you choose a sample post.");
  process.exit(0);
}

function printSection(title, body) {
  console.log(`\n=== ${title} ===`);
  console.log(body);
}

async function promptForSelection() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("Select a Substack-style post to route:");
    console.log("");
    console.log(formatRoutingMenu());
    console.log("");

    const answer = await rl.question("Enter a number (1-2) and press Enter: ");
    const selection = Number.parseInt(answer, 10);

    if (!Number.isInteger(selection)) {
      throw new Error("Please enter either 1 or 2.");
    }

    const example = getRoutingExampleById(selection);
    if (!example) {
      throw new Error("That selection is out of range. Choose 1 or 2.");
    }

    return example;
  } finally {
    rl.close();
  }
}

try {
  const selectedExample = source ? null : await promptForSelection();
  const post = selectedExample ? selectedExample.post : readSubstackInput(source);

  printSection(
    "Input",
    selectedExample
      ? [
          `Selected example: ${selectedExample.id}. ${selectedExample.title}`,
          `Expected route for demo design: ${selectedExample.expectedRoute}`,
          "",
          post,
        ].join("\n")
      : source
        ? `Source: ${source}\n\n${post}`
        : `Source: built-in sample\n\n${post}`,
  );

  const parseInput = buildParseInput(post);
  printSection(
    "Step 1: Request",
    [
      "Endpoint: OpenAI Responses API",
      `Model: ${OPENAI_MODEL}`,
      "Action: Parse and understand the Substack post",
      "",
      JSON.stringify(parseInput, null, 2),
    ].join("\n"),
  );

  console.log("\n... calling model for step 1");
  const parsedPost = await parseSubstackPost(post);
  printSection("Step 1: Response", parsedPost);

  const classificationInput = buildClassificationInput(parsedPost);
  printSection(
    "Step 2: Request",
    [
      "Endpoint: OpenAI Responses API",
      `Model: ${OPENAI_MODEL}`,
      "Action: Classify technicality and choose one route",
      "",
      JSON.stringify(classificationInput, null, 2),
    ].join("\n"),
  );

  console.log("\n... calling model for step 2");
  const decision = await classifySubstackPost(parsedPost);
  printSection("Step 2: Response", JSON.stringify(decision, null, 2));

  const routeLabel =
    decision.route === "twitter_tech"
      ? "Step 3A: Request"
      : "Step 3B: Request";

  const routeAction =
    decision.route === "twitter_tech"
      ? "Write Twitter post for tech Twitter"
      : "Write LinkedIn thought-leadership post";

  const routeInput =
    decision.route === "twitter_tech"
      ? buildTwitterInput(parsedPost)
      : buildLinkedInInput(parsedPost);

  printSection(
    routeLabel,
    [
      "Endpoint: OpenAI Responses API",
      `Model: ${OPENAI_MODEL}`,
      `Action: ${routeAction}`,
      "",
      JSON.stringify(routeInput, null, 2),
    ].join("\n"),
  );

  console.log("\n... calling model for routed step");
  const output =
    decision.route === "twitter_tech"
      ? await writeTwitterPost(parsedPost)
      : await writeLinkedInPost(parsedPost);

  printSection("Final Output", output);
  printSection(
    "Done",
    `Routing workflow completed with ${OPENAI_MODEL}. One route was selected and one final output was produced.`,
  );
} catch (error) {
  if (error?.status === 401) {
    console.error(
      "OpenAI rejected the API key from ../.env. Double-check OPENAI_API_KEY and try again.",
    );
  } else {
    console.error("Routing workflow failed:", error.message);
  }

  process.exit(1);
}
