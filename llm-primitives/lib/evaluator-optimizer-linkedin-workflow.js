import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import fs from "node:fs";
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

export const FULL_MODEL = "gpt-5.4";
export const MINI_MODEL = "gpt-5.4-mini";
export const DEFAULT_GENERATOR_MODEL = MINI_MODEL;
export const DEFAULT_EVALUATOR_MODEL = FULL_MODEL;
export const MAX_ITERATIONS = 5;

const RUBRIC_PATH = path.resolve(__dirname, "../data/nickang-linkedin-voice-rubric.md");
const LINKEDIN_VOICE_RUBRIC = fs.readFileSync(RUBRIC_PATH, "utf8");

loadEnv({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in your environment or .env file.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export { SUBSTACK_REVIEW_FIXTURES, formatFixtureMenu, getFixtureById, readFixtureContent };

function buildGeneratorInput({
  fixture,
  article,
  previousDraft,
  feedback,
  bestIteration,
  iteration,
}) {
  const instructions = [
    "You are the generator inside an evaluator-optimizer workflow.",
    "Your job is to write one LinkedIn post adapted from a Substack-style source article.",
    "The target is Nick Ang's recent writing voice as described in the rubric below.",
    "Write plain text only.",
    "Return valid JSON only.",
    "Constraints:",
    "- 3 to 6 short paragraphs.",
    "- One core idea.",
    "- No hashtags.",
    "- No bullet lists unless absolutely necessary.",
    "- Keep it tight enough to read in under a minute.",
    "- Sound like a person building and thinking in public, not like corporate thought leadership.",
  ];

  if (iteration > 1) {
    instructions.push("This is a revision round.");
    instructions.push(
      "Use the highest-scoring draft so far as your base and improve it using the latest evaluator feedback.",
    );
    instructions.push(
      "Do not throw away strengths that the evaluator praised unless a revision instruction directly requires it.",
    );
    instructions.push(
      "Aim to raise the score, not to rewrite the post from scratch into a different voice.",
    );
  }

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: instructions.join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            `Source article title: ${fixture.title}`,
            "",
            "Voice rubric:",
            LINKEDIN_VOICE_RUBRIC,
            "",
            "Source article:",
            article,
            "",
            bestIteration
              ? `Best-scoring draft so far (score ${bestIteration.evaluation.score}):\n${bestIteration.draft}`
              : "Best-scoring draft so far: none yet",
            "",
            bestIteration
              ? `What the evaluator liked most about the best draft:\n${JSON.stringify(bestIteration.evaluation.what_matches, null, 2)}`
              : "What the evaluator liked most about the best draft: none yet",
            "",
            previousDraft
              ? `Most recent draft:\n${previousDraft}`
              : "Previous draft: none (this is the first draft)",
            "",
            feedback
              ? `Latest evaluator feedback:\n${JSON.stringify(feedback, null, 2)}`
              : "Evaluator feedback from the previous round: none",
          ].join("\n"),
        },
      ],
    },
  ];
}

function buildEvaluatorInput({ fixture, article, draft, iteration }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are the evaluator inside an evaluator-optimizer workflow.",
            "Evaluate whether the LinkedIn draft matches Nick Ang's recent writing voice using the rubric provided.",
            "Be strict about generic LinkedIn language, fake polish, and lack of lived specificity.",
            "Use the full scoring rubric and return valid JSON only.",
            "If the draft is strong enough to stop iterating, set should_continue to false.",
            `This is evaluation round ${iteration}.`,
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
            `Source article title: ${fixture.title}`,
            "",
            "Voice rubric:",
            LINKEDIN_VOICE_RUBRIC,
            "",
            "Original article for context:",
            article,
            "",
            "LinkedIn draft to evaluate:",
            draft,
          ].join("\n"),
        },
      ],
    },
  ];
}

function getGeneratorSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      linkedin_post: { type: "string" },
      intent: { type: "string" },
    },
    required: ["linkedin_post", "intent"],
  };
}

function getEvaluatorSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
      },
      verdict: { type: "string" },
      dimension_scores: {
        type: "array",
        minItems: 8,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            dimension: { type: "string" },
            score: {
              type: "integer",
              minimum: 1,
              maximum: 5,
            },
            rationale: { type: "string" },
          },
          required: ["dimension", "score", "rationale"],
        },
      },
      what_matches: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: { type: "string" },
      },
      what_breaks_voice: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: { type: "string" },
      },
      revision_instructions: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: { type: "string" },
      },
      should_continue: { type: "boolean" },
    },
    required: [
      "score",
      "verdict",
      "dimension_scores",
      "what_matches",
      "what_breaks_voice",
      "revision_instructions",
      "should_continue",
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

export async function runEvaluatorOptimizerLinkedInWorkflow({
  fixture,
  maxIterations = MAX_ITERATIONS,
  generatorModel = DEFAULT_GENERATOR_MODEL,
  evaluatorModel = DEFAULT_EVALUATOR_MODEL,
  onUpdate,
} = {}) {
  const article = readFixtureContent(fixture);
  const iterations = [];
  let previousDraft = null;
  let previousFeedback = null;
  let bestIteration = null;
  let finalIteration = null;

  onUpdate?.({
    type: "input_ready",
    fixture,
    article,
    maxIterations,
  });

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    onUpdate?.({
      type: "generator_started",
      iteration,
    });

    const generatorStartedAt = Date.now();
    const generatorOutput = await createJsonResponse({
      model: generatorModel,
      input: buildGeneratorInput({
        fixture,
        article,
        previousDraft,
        feedback: previousFeedback,
        bestIteration,
        iteration,
      }),
      name: `linkedin_generator_round_${iteration}`,
      schema: getGeneratorSchema(),
    });

    onUpdate?.({
      type: "generator_completed",
      iteration,
      durationMs: Date.now() - generatorStartedAt,
      output: generatorOutput,
    });

    onUpdate?.({
      type: "evaluator_started",
      iteration,
    });

    const evaluatorStartedAt = Date.now();
    const evaluatorOutput = await createJsonResponse({
      model: evaluatorModel,
      input: buildEvaluatorInput({
        fixture,
        article,
        draft: generatorOutput.linkedin_post,
        iteration,
      }),
      name: `linkedin_evaluator_round_${iteration}`,
      schema: getEvaluatorSchema(),
    });

    onUpdate?.({
      type: "evaluator_completed",
      iteration,
      durationMs: Date.now() - evaluatorStartedAt,
      output: evaluatorOutput,
    });

    const currentIteration = {
      iteration,
      draft: generatorOutput.linkedin_post.trim(),
      generatorIntent: generatorOutput.intent,
      evaluation: evaluatorOutput,
    };

    iterations.push(currentIteration);
    finalIteration = currentIteration;
    if (!bestIteration || currentIteration.evaluation.score > bestIteration.evaluation.score) {
      bestIteration = currentIteration;
    }
    previousDraft = currentIteration.draft;
    previousFeedback = evaluatorOutput;

    const shouldStop = evaluatorOutput.score >= 90 || evaluatorOutput.should_continue === false;

    onUpdate?.({
      type: "iteration_completed",
      iteration,
      output: currentIteration,
      bestIteration,
      stopped: shouldStop,
    });

    if (shouldStop) {
      break;
    }
  }

  onUpdate?.({
    type: "workflow_completed",
    iterations,
    finalIteration,
  });

  return {
    fixture,
    article,
    maxIterations,
    modelSummary: {
      generator: generatorModel,
      evaluator: evaluatorModel,
    },
    iterations,
    bestIteration,
    finalIteration,
  };
}
