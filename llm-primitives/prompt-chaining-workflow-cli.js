import {
  buildGenerateMarketingInput,
  buildTranslateMarketingInput,
  DEFAULT_BRIEF,
  DEFAULT_TARGET_LANGUAGE,
  OPENAI_MODEL,
  ensureMarketingShape,
  generateMarketingCopy,
  translateMarketingCopy,
} from "./lib/prompt-chaining-workflow.js";

const brief = process.argv[2] ?? DEFAULT_BRIEF;
const targetLanguage = process.argv[3] ?? DEFAULT_TARGET_LANGUAGE;

if (process.argv[2] === "--help" || process.argv[2] === "-h") {
  console.log("Usage: node prompt-chaining-workflow-cli.js [brief] [target-language]");
  console.log("");
  console.log("Runs the prompt chaining workflow over a marketing brief.");
  process.exit(0);
}

function printSection(title, body) {
  console.log(`\n=== ${title} ===`);
  console.log(body);
}

try {
  printSection("Input", `Brief: ${brief}\nTarget language: ${targetLanguage}`);

  const step1Input = buildGenerateMarketingInput(brief);
  printSection(
    "Step 1: Request",
    [
      "Endpoint: OpenAI Responses API",
      `Model: ${OPENAI_MODEL}`,
      "Action: Generate marketing copy",
      "",
      JSON.stringify(step1Input, null, 2),
    ].join("\n"),
  );

  console.log("\n... calling model for step 1");
  const marketingCopy = await generateMarketingCopy(brief);
  ensureMarketingShape(marketingCopy);
  printSection("Step 1: Response", marketingCopy);

  const step2Input = buildTranslateMarketingInput(marketingCopy, targetLanguage);
  printSection(
    "Step 2: Request",
    [
      "Endpoint: OpenAI Responses API",
      `Model: ${OPENAI_MODEL}`,
      "Action: Translate marketing copy",
      "",
      JSON.stringify(step2Input, null, 2),
    ].join("\n"),
  );

  console.log("\n... calling model for step 2");
  const translatedCopy = await translateMarketingCopy(marketingCopy, targetLanguage);
  ensureMarketingShape(translatedCopy);
  printSection("Step 2: Response", translatedCopy);

  printSection(
    "Done",
    `Prompt chaining workflow completed with ${OPENAI_MODEL}. Generated copy and translated it into ${targetLanguage}.`,
  );
} catch (error) {
  if (error?.status === 401) {
    console.error(
      "OpenAI rejected the API key from ../.env. Double-check OPENAI_API_KEY and try again.",
    );
  } else {
    console.error("Prompt chaining workflow failed:", error.message);
  }

  process.exit(1);
}
