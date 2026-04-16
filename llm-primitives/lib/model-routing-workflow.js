import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SMALL_MODEL = "gpt-5.4-mini";
export const MAIN_MODEL = "gpt-5.4";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in your environment or .env file.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const CUSTOMER_SUPPORT_EXAMPLES = [
  {
    id: 1,
    expectedRoute: "small",
    title: "Reset password",
    message:
      "Hi, I forgot my password and I am locked out of my account. How do I reset it?",
  },
  {
    id: 2,
    expectedRoute: "small",
    title: "Find invoice",
    message:
      "Where can I download my latest invoice for the Pro plan? I need it for expenses.",
  },
  {
    id: 3,
    expectedRoute: "small",
    title: "Cancel subscription",
    message:
      "I want to cancel my subscription before the next billing date. What are the steps?",
  },
  {
    id: 4,
    expectedRoute: "main",
    title: "Refund after downgrade confusion",
    message:
      "I downgraded from Team to Starter last week, but my card was still charged the higher amount today. I also lost access to a few shared workspaces and I am not sure whether that is related. Can you explain what happened and whether I should get a partial refund?",
  },
  {
    id: 5,
    expectedRoute: "main",
    title: "Possible data loss after import",
    message:
      "After importing our CSV, some customer notes appear duplicated, some records are missing, and two teammates say they saw different totals in the dashboard. We are about to present this data to leadership. Can you help me figure out what might have happened and what we should verify first?",
  },
  {
    id: 6,
    expectedRoute: "main",
    title: "Security and compliance questionnaire",
    message:
      "Our procurement team is reviewing your product for a possible rollout in healthcare. Can you explain how you handle SSO, audit logs, data retention, role-based access, and whether you support regional data residency? A concise but trustworthy answer would help.",
  },
];

export function formatMenu() {
  return CUSTOMER_SUPPORT_EXAMPLES.map(
    (example) => `${example.id}. ${example.title} (${example.expectedRoute} model path)`,
  ).join("\n");
}

export function getExampleById(id) {
  return CUSTOMER_SUPPORT_EXAMPLES.find((example) => example.id === id) ?? null;
}

export function buildClassificationInput(message) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are a routing classifier for a customer support workflow.",
            "Route simple, common, low-risk questions to the small model.",
            "Route ambiguous, multi-issue, high-stakes, or nuanced questions to the main model.",
            "Small-model cases usually involve straightforward account actions, billing lookup, or common FAQ guidance.",
            "Main-model cases usually involve multiple interacting issues, risk of misunderstanding, trust-sensitive explanations, data concerns, or compliance/security nuance.",
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
          text: `Classify this customer support message for routing:\n\n${message}`,
        },
      ],
    },
  ];
}

export function buildSupportReplyInput(message) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are a customer support assistant for a SaaS product.",
            "Write a helpful reply that is clear, calm, and practical.",
            "Do not invent specific company policies, refunds, or security certifications.",
            "If details are missing, explain the likely path and what should be checked next.",
            "Keep the tone human and concise.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Reply to this customer support message:\n\n${message}`,
        },
      ],
    },
  ];
}

function ensureClassificationShape(result) {
  if (!["small", "main"].includes(result.route)) {
    throw new Error(`Unexpected route "${result.route}" returned by classifier.`);
  }

  if (![SMALL_MODEL, MAIN_MODEL].includes(result.model)) {
    throw new Error(`Unexpected model "${result.model}" returned by classifier.`);
  }
}

export async function classifySupportMessage(message) {
  const input = buildClassificationInput(message);
  const response = await client.responses.create({
    model: SMALL_MODEL,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "support_model_routing_decision",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            route: {
              type: "string",
              enum: ["small", "main"],
            },
            model: {
              type: "string",
              enum: [SMALL_MODEL, MAIN_MODEL],
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
          required: ["route", "model", "confidence", "rationale"],
        },
      },
    },
  });

  const decision = JSON.parse(response.output_text);
  ensureClassificationShape(decision);
  return decision;
}

export async function writeSupportReply(message, model) {
  const response = await client.responses.create({
    model,
    input: buildSupportReplyInput(message),
  });

  return response.output_text.trim();
}

export async function runOptimizationRouting({ message } = {}) {
  const decision = await classifySupportMessage(message);
  const reply = await writeSupportReply(message, decision.model);

  return {
    message,
    decision,
    reply,
  };
}
