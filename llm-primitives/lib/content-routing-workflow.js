import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL = "gpt-5.4-mini";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in your environment or .env file.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const OPENAI_MODEL = MODEL;

export const TECHNICAL_SUBSTACK_POST = `Title: Durable systems are a UX feature

Most product teams treat reliability like an invisible backend concern, but users experience it directly. The moment a sync pauses, a notification arrives late, or an export times out, the product stops feeling trustworthy.

In practice, reliability comes from a stack of technical choices: idempotent job design, backpressure-aware queues, time-bounded retries, durable checkpoints, and careful failure-mode testing. These systems decisions do not just improve infrastructure dashboards. They change whether a customer believes your product is safe to depend on.

One useful framing is to treat operational resilience as part of interface design. A calm loading state, a clear replay path after failure, and a consistent recovery story are just as important as the visual design of the screen itself.

The teams that internalize this stop asking whether reliability work is visible to users. They start asking how to make the benefits legible.`;

export const NON_TECHNICAL_SUBSTACK_POST = `Title: The quiet advantage of consistency

Most people overestimate the value of one big breakthrough and underestimate the compounding effect of showing up every week. Audiences rarely trust a single flash of insight. They trust a pattern.

The same is true inside teams. A calm weekly update, a thoughtful follow-up after a meeting, or a habit of shipping small improvements on schedule creates a sense of momentum that strategy decks alone cannot produce. Consistency lowers the cognitive load for everyone around you.

What looks unremarkable in the moment often becomes your reputation over time. People start to associate you with reliability, clarity, and follow-through. That opens doors long before a headline achievement appears.

The challenge is that consistency feels boring when you are inside it. But from the outside, it is often the thing that makes other people pause and pay attention.`;

export const ROUTING_WORKFLOW_EXAMPLES = [
  {
    id: 1,
    title: "Technical reliability post",
    expectedRoute: "twitter_tech",
    post: TECHNICAL_SUBSTACK_POST,
  },
  {
    id: 2,
    title: "Non-technical thought leadership post",
    expectedRoute: "linkedin_thought_leadership",
    post: NON_TECHNICAL_SUBSTACK_POST,
  },
];

export const DEFAULT_SUBSTACK_POST = TECHNICAL_SUBSTACK_POST;

export function formatRoutingMenu() {
  return ROUTING_WORKFLOW_EXAMPLES.map(
    (example) => `${example.id}. ${example.title} (${example.expectedRoute})`,
  ).join("\n");
}

export function getRoutingExampleById(id) {
  return ROUTING_WORKFLOW_EXAMPLES.find((example) => example.id === id) ?? null;
}

export function readSubstackInput(source) {
  if (!source) {
    return DEFAULT_SUBSTACK_POST;
  }

  const maybePath = path.resolve(process.cwd(), source);
  if (fs.existsSync(maybePath) && fs.statSync(maybePath).isFile()) {
    return fs.readFileSync(maybePath, "utf8");
  }

  return source;
}

export function buildParseInput(post) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You analyze Substack posts for downstream content workflows.",
            "Extract the key ideas in a compact, practical format.",
            "Return plain text with exactly these labels:",
            "Title:",
            "Audience:",
            "Summary:",
            "Key Points:",
            "Technical Signals:",
            "Keep Summary to 2-3 sentences.",
            "Keep Key Points to 3 bullet lines starting with '- '.",
            "Keep Technical Signals to 3 bullet lines starting with '- '.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Parse and understand this Substack post:\n\n${post}`,
        },
      ],
    },
  ];
}

export function buildClassificationInput(parsedPost) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are a routing classifier in a content workflow.",
            "Decide whether a post is very technical or not technical for the purpose of social post generation.",
            "Very technical means the post substantially relies on implementation detail, engineering mechanisms, architecture, code-level concepts, or specialized technical vocabulary.",
            "Not technical means the post is better framed as a general business, creator, product, leadership, cultural, or broad-audience idea.",
            "Return valid JSON only.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Classify this parsed post for routing:\n\n${parsedPost}`,
        },
      ],
    },
  ];
}

export function buildTwitterInput(parsedPost) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You write for tech Twitter.",
            "Write one concise post that sounds sharp, clear, and native to technical founders, engineers, and product builders.",
            "Summarize the article's core insight without sounding corporate.",
            "Use plain text only.",
            "Do not use hashtags.",
            "Do not mention LinkedIn.",
            "Keep it under 280 characters.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Write a Twitter post from this parsed Substack analysis:\n\n${parsedPost}`,
        },
      ],
    },
  ];
}

export function buildLinkedInInput(parsedPost) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You write thoughtful LinkedIn posts for a broad professional audience.",
            "Write one post that turns the article into a pause-and-think insight.",
            "Make it reflective, clear, and leadership-oriented rather than deeply technical.",
            "Use plain text only.",
            "No hashtags.",
            "No bullet lists.",
            "Keep it to 4 short paragraphs max.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Write a LinkedIn post from this parsed Substack analysis:\n\n${parsedPost}`,
        },
      ],
    },
  ];
}

function ensureParsedShape(text) {
  const requiredSections = [
    "Title:",
    "Audience:",
    "Summary:",
    "Key Points:",
    "Technical Signals:",
  ];
  const missingSections = requiredSections.filter((section) => !text.includes(section));

  if (missingSections.length > 0) {
    throw new Error(`Parsed post is missing required sections: ${missingSections.join(", ")}`);
  }
}

function ensureClassificationShape(result) {
  const allowedRoutes = new Set(["twitter_tech", "linkedin_thought_leadership"]);

  if (!allowedRoutes.has(result.route)) {
    throw new Error(`Unexpected route "${result.route}" returned by classifier.`);
  }

  if (!["very_technical", "not_technical"].includes(result.classification)) {
    throw new Error(
      `Unexpected classification "${result.classification}" returned by classifier.`,
    );
  }
}

async function createTextResponse(input, options = {}) {
  const response = await client.responses.create({
    model: MODEL,
    input,
    ...options,
  });

  return response.output_text.trim();
}

export async function parseSubstackPost(post) {
  const input = buildParseInput(post);
  const parsedPost = await createTextResponse(input);
  ensureParsedShape(parsedPost);
  return parsedPost;
}

export async function classifySubstackPost(parsedPost) {
  const input = buildClassificationInput(parsedPost);
  const response = await client.responses.create({
    model: MODEL,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "substack_routing_decision",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            classification: {
              type: "string",
              enum: ["very_technical", "not_technical"],
            },
            route: {
              type: "string",
              enum: ["twitter_tech", "linkedin_thought_leadership"],
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
            },
            rationale: {
              type: "string",
            },
          },
          required: ["classification", "route", "confidence", "rationale"],
        },
      },
    },
  });

  const classification = JSON.parse(response.output_text);
  ensureClassificationShape(classification);
  return classification;
}

export async function writeTwitterPost(parsedPost) {
  return createTextResponse(buildTwitterInput(parsedPost));
}

export async function writeLinkedInPost(parsedPost) {
  return createTextResponse(buildLinkedInInput(parsedPost));
}

export async function runRoutingWorkflow({ post = DEFAULT_SUBSTACK_POST } = {}) {
  const parsedPost = await parseSubstackPost(post);
  const decision = await classifySubstackPost(parsedPost);

  let output;
  if (decision.route === "twitter_tech") {
    output = await writeTwitterPost(parsedPost);
  } else {
    output = await writeLinkedInPost(parsedPost);
  }

  return {
    model: MODEL,
    post,
    parsedPost,
    decision,
    output,
  };
}
