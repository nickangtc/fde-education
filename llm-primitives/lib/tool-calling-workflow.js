import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUBSTACK_REVIEW_FIXTURES,
  getFixtureById,
  readFixtureContent,
} from "./substack-fixtures.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TOOL_CALLING_MODEL = "gpt-5.4-mini";
export const DEFAULT_USER_PROMPT =
  "List the available Substack fixtures, then inspect fixture 2 as context, and finish with a short 2-3 sentence explanation of what that post is about.";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in your environment or .env file.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function listSubstackFixtures() {
  return SUBSTACK_REVIEW_FIXTURES.map((fixture) => ({
    id: fixture.id,
    slug: fixture.slug,
    title: fixture.title,
    publishedAt: fixture.publishedAt,
  }));
}

export function readSubstackFixture({ id }) {
  const fixture = getFixtureById(id);

  if (!fixture) {
    throw new Error(`Unknown fixture id: ${id}. Expected one of 1, 2, or 3.`);
  }

  return {
    id: fixture.id,
    slug: fixture.slug,
    title: fixture.title,
    publishedAt: fixture.publishedAt,
    content: readFixtureContent(fixture),
  };
}

export function getSubstackFixtureTools() {
  return [
    {
      type: "function",
      name: "list_substack_fixtures",
      description:
        "List the available local Substack post fixtures with their ids, titles, slugs, and publish dates.",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "read_substack_fixture",
      description:
        "Read one local Substack post fixture in full by id, including its Markdown content.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            enum: SUBSTACK_REVIEW_FIXTURES.map((fixture) => fixture.id),
            description: "The fixture id to read in full.",
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  ];
}

function executeToolCall(toolCall) {
  const args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};

  switch (toolCall.name) {
    case "list_substack_fixtures":
      return listSubstackFixtures(args);
    case "read_substack_fixture":
      return readSubstackFixture(args);
    default:
      throw new Error(`Unsupported tool: ${toolCall.name}`);
  }
}

export function buildInitialToolCallingInput(userPrompt) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are a helpful assistant in a tool-calling workflow demo.",
            "Use the available tools when they would help you answer.",
            "Keep your final answer short and concrete.",
            "Do not paste full fixture contents into the final answer unless the user explicitly asks for the full text.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [{ type: "input_text", text: userPrompt }],
    },
  ];
}

export async function runToolCallingSubstackWorkflow({
  userPrompt = DEFAULT_USER_PROMPT,
  model = TOOL_CALLING_MODEL,
  onUpdate,
} = {}) {
  const tools = getSubstackFixtureTools();
  const toolEvents = [];

  let response = await client.responses.create({
    model,
    input: buildInitialToolCallingInput(userPrompt),
    tools,
  });

  while (true) {
    const functionCalls = response.output.filter((item) => item.type === "function_call");

    if (functionCalls.length === 0) {
      break;
    }

    const toolOutputs = [];

    for (const toolCall of functionCalls) {
      const output = executeToolCall(toolCall);
      const event = {
        type: "tool_called",
        name: toolCall.name,
        arguments: toolCall.arguments ? JSON.parse(toolCall.arguments) : {},
        output,
      };

      toolEvents.push(event);
      onUpdate?.(event);

      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(output),
      });
    }

    response = await client.responses.create({
      model,
      previous_response_id: response.id,
      input: toolOutputs,
      tools,
    });
  }

  return {
    model,
    userPrompt,
    toolEvents,
    finalText: response.output_text.trim(),
  };
}
