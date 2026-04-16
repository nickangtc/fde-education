import {
  DEFAULT_USER_PROMPT,
  TOOL_CALLING_MODEL,
  runToolCallingSubstackWorkflow,
} from "./lib/tool-calling-workflow.js";

const userPrompt = process.argv.slice(2).join(" ").trim() || DEFAULT_USER_PROMPT;

function printSection(title, body) {
  console.log(`\n=== ${title} ===`);
  console.log(body);
}

function truncate(text, maxLength = 600) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function formatToolOutputPreview(output) {
  return truncate(JSON.stringify(output, null, 2));
}

if (userPrompt === "--help" || userPrompt === "-h") {
  console.log("Usage: node tool-calling-workflow-cli.js [prompt]");
  console.log("");
  console.log("Runs a small Responses API tool-calling demo over local Substack fixtures.");
  console.log("If no prompt is provided, the demo uses a default prompt that lists fixtures and reads fixture 2.");
  process.exit(0);
}

try {
  printSection(
    "Input",
    [
      "Workflow: Responses API function tools over local Substack fixtures",
      `Model: ${TOOL_CALLING_MODEL}`,
      "",
      userPrompt,
    ].join("\n"),
  );

  const result = await runToolCallingSubstackWorkflow({
    userPrompt,
    onUpdate(event) {
      printSection(
        "Tool Call",
        [
          `Tool: ${event.name}`,
          `Arguments: ${JSON.stringify(event.arguments, null, 2)}`,
          "",
          "Tool output preview:",
          formatToolOutputPreview(event.output),
        ].join("\n"),
      );
    },
  });

  printSection("Final Output", result.finalText);
  printSection(
    "Done",
    `Tool-calling workflow completed with ${result.model}. ${result.toolEvents.length} tool call(s) executed.`,
  );
} catch (error) {
  if (error?.status === 401) {
    console.error(
      "OpenAI rejected the API key from ../.env. Double-check OPENAI_API_KEY and try again.",
    );
  } else {
    console.error("Tool-calling workflow failed:", error.message);
  }

  process.exit(1);
}
