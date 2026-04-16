import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatFixtureMenu,
  getFixtureById,
  readFixtureContent,
  SUBSTACK_REVIEW_FIXTURES,
} from "./substack-fixtures.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REVIEW_MODEL = "gpt-5.4-mini";
export const AGGREGATOR_MODEL = "gpt-5.4";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in your environment or .env file.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const REVIEWERS = [
  {
    id: "clarity",
    label: "Clarity",
    goal: "Assess whether the writing is easy to follow for an intelligent general reader.",
  },
  {
    id: "structure",
    label: "Structure",
    goal: "Assess whether the post is well organised and whether the flow earns the ending.",
  },
  {
    id: "audience",
    label: "Audience Fit",
    goal: "Assess whether the post matches the implied audience and whether the takeaways feel relevant to them.",
  },
  {
    id: "hook",
    label: "Hook & Memorability",
    goal: "Assess whether the opening and strongest lines create curiosity and leave the reader with a memorable point.",
  },
];

export function buildReviewerInput({ reviewer, fixture, article }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are one reviewer inside a parallel editorial-review workflow.",
            "Focus only on your assigned review dimension.",
            "Be specific, concise, and constructive.",
            "Return valid JSON only.",
            `Your assigned dimension: ${reviewer.label}.`,
            reviewer.goal,
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            `Review this Substack draft titled "${fixture.title}".`,
            "",
            article,
          ].join("\n"),
        },
      ],
    },
  ];
}

export function buildAggregatorInput({ fixture, article, reviews }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are the aggregator in a parallel editorial-review workflow.",
            "You receive four independent review outputs and must synthesize them into one final report.",
            "Do not simply concatenate the reviews.",
            "Identify overlap, tension, and the highest-value next edits.",
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
          text: [
            `Article title: ${fixture.title}`,
            "",
            "Article:",
            article,
            "",
            "Parallel review outputs:",
            JSON.stringify(reviews, null, 2),
          ].join("\n"),
        },
      ],
    },
  ];
}

function getReviewerSchema(reviewer) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reviewer: {
        type: "string",
        const: reviewer.label,
      },
      score: {
        type: "integer",
        minimum: 1,
        maximum: 5,
      },
      verdict: {
        type: "string",
      },
      strengths: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 3,
      },
      risks: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 3,
      },
      suggested_edits: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 3,
      },
    },
    required: ["reviewer", "score", "verdict", "strengths", "risks", "suggested_edits"],
  };
}

function getAggregatorSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      overall_assessment: { type: "string" },
      publish_recommendation: {
        type: "string",
        enum: ["publish_now", "revise_then_publish", "major_rewrite"],
      },
      key_strengths: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
      },
      main_issues: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 4,
      },
      revision_plan: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 5,
      },
      strongest_line: { type: "string" },
    },
    required: [
      "overall_assessment",
      "publish_recommendation",
      "key_strengths",
      "main_issues",
      "revision_plan",
      "strongest_line",
    ],
  };
}

async function createJsonResponse({ model, input, name, schema }) {
  const response = await client.responses.create({
    model,
    input,
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema,
      },
    },
  });

  return JSON.parse(response.output_text);
}

export async function runParallelReviewWorkflow({ fixture, onUpdate } = {}) {
  const article = readFixtureContent(fixture);

  onUpdate?.({
    type: "input_ready",
    fixture,
    article,
  });

  const reviewPromises = REVIEWERS.map(async (reviewer) => {
    onUpdate?.({
      type: "reviewer_started",
      reviewerId: reviewer.id,
    });

    const startedAt = Date.now();
    const output = await createJsonResponse({
      model: REVIEW_MODEL,
      input: buildReviewerInput({ reviewer, fixture, article }),
      name: `parallel_review_${reviewer.id}`,
      schema: getReviewerSchema(reviewer),
    });

    onUpdate?.({
      type: "reviewer_completed",
      reviewerId: reviewer.id,
      durationMs: Date.now() - startedAt,
      output,
    });

    return {
      reviewer,
      output,
    };
  });

  const reviews = await Promise.all(reviewPromises);

  onUpdate?.({
    type: "aggregator_started",
  });

  const aggregatorStartedAt = Date.now();
  const finalReport = await createJsonResponse({
    model: AGGREGATOR_MODEL,
    input: buildAggregatorInput({
      fixture,
      article,
      reviews: reviews.map((review) => review.output),
    }),
    name: "parallel_review_aggregator",
    schema: getAggregatorSchema(),
  });

  onUpdate?.({
    type: "aggregator_completed",
    durationMs: Date.now() - aggregatorStartedAt,
    output: finalReport,
  });

  return {
    fixture,
    article,
    reviews,
    finalReport,
  };
}
