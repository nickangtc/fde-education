import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  buildClassificationInput,
  buildSupportReplyInput,
  classifySupportMessage,
  formatMenu,
  getExampleById,
  MAIN_MODEL,
  SMALL_MODEL,
  writeSupportReply,
} from "./lib/model-routing-workflow.js";

function printSection(title, body) {
  console.log(`\n=== ${title} ===`);
  console.log(body);
}

function printUsage() {
  console.log("Usage: node model-routing-workflow-cli.js");
  console.log("");
  console.log("Choose one of six hard-coded customer support messages from an interactive menu.");
}

async function promptForSelection() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("Select a customer support message to route:");
    console.log("");
    console.log(formatMenu());
    console.log("");

    const answer = await rl.question("Enter a number (1-6) and press Enter: ");
    const selection = Number.parseInt(answer, 10);

    if (!Number.isInteger(selection)) {
      throw new Error("Please enter a whole number from 1 to 6.");
    }

    const example = getExampleById(selection);
    if (!example) {
      throw new Error("That selection is out of range. Choose a number from 1 to 6.");
    }

    return example;
  } finally {
    rl.close();
  }
}

try {
  const arg = process.argv[2];
  if (arg === "--help" || arg === "-h") {
    printUsage();
    process.exit(0);
  }

  const example = await promptForSelection();

  printSection(
    "Input",
    [
      `Selected example: ${example.id}. ${example.title}`,
      `Expected route for demo design: ${example.expectedRoute}`,
      "",
      example.message,
    ].join("\n"),
  );

  const classificationInput = buildClassificationInput(example.message);
  printSection(
    "Step 1: Request",
    [
      "Endpoint: OpenAI Responses API",
      `Model: ${SMALL_MODEL}`,
      "Action: Route support message to the cost-effective or main model",
      "",
      JSON.stringify(classificationInput, null, 2),
    ].join("\n"),
  );

  console.log("\n... calling model for step 1");
  const decision = await classifySupportMessage(example.message);
  printSection("Step 1: Response", JSON.stringify(decision, null, 2));

  const replyInput = buildSupportReplyInput(example.message);
  printSection(
    "Step 2: Request",
    [
      "Endpoint: OpenAI Responses API",
      `Model: ${decision.model}`,
      `Action: Generate support reply on the ${decision.route} route`,
      "",
      JSON.stringify(replyInput, null, 2),
    ].join("\n"),
  );

  console.log("\n... calling model for step 2");
  const reply = await writeSupportReply(example.message, decision.model);
  printSection("Final Output", reply);
  printSection(
    "Done",
    `Optimization routing completed. The classifier chose ${decision.model}${decision.model === MAIN_MODEL ? " for the higher-capability path." : " for the cost-effective path."}`,
  );
} catch (error) {
  if (error?.status === 401) {
    console.error(
      "OpenAI rejected the API key from ../.env. Double-check OPENAI_API_KEY and try again.",
    );
  } else {
    console.error("Optimization routing failed:", error.message);
  }

  process.exit(1);
}
