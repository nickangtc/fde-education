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

export const ORCHESTRATOR_MODEL = "gpt-5.4";
export const WORKER_MODEL = "gpt-5.4-mini";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in your environment or .env file.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export { SUBSTACK_REVIEW_FIXTURES, formatFixtureMenu, getFixtureById, readFixtureContent };

export const WORKERS = [
  {
    id: "summarize",
    label: "Summarize",
    goal: "Capture the post in exactly three clear bullet points.",
  },
  {
    id: "improve_headline",
    label: "Improve Headline",
    goal: "Suggest three stronger publishable headline alternatives and recommend one.",
  },
];

function getWorkerById(id) {
  return WORKERS.find((worker) => worker.id === id) ?? null;
}

export function buildPlanningInput({ fixture, article }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are the orchestrator in a minimal orchestrator-workers workflow.",
            "Your job is to inspect a Substack draft and decide which worker tasks are needed.",
            "You may choose zero, one, or two tasks.",
            "Allowed tasks:",
            "- summarize",
            "- improve_headline",
            "Choose only the tasks that add real value for this draft.",
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
            `Draft title: ${fixture.title}`,
            "",
            article,
          ].join("\n"),
        },
      ],
    },
  ];
}

export function buildSummaryWorkerInput({ fixture, article }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are a worker in an orchestrator-workers workflow.",
            "Task: summarize.",
            "Write exactly three concise bullet points that capture the main idea, the tension, and the takeaway.",
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
            `Draft title: ${fixture.title}`,
            "",
            article,
          ].join("\n"),
        },
      ],
    },
  ];
}

export function buildHeadlineWorkerInput({ fixture, article }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are a worker in an orchestrator-workers workflow.",
            "Task: improve_headline.",
            "Suggest three publishable headline alternatives for the draft.",
            "Keep them truthful, specific, and slightly curiosity-inducing without clickbait.",
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
            `Current title: ${fixture.title}`,
            "",
            article,
          ].join("\n"),
        },
      ],
    },
  ];
}

export function buildFinalOrchestratorInput({ fixture, article, plan, workerOutputs }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are the orchestrator returning for the final step in a minimal orchestrator-workers workflow.",
            "You already decided which workers to run.",
            "Now synthesize their outputs into one simple editor note.",
            "Do not invent extra worker tasks.",
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
            `Draft title: ${fixture.title}`,
            "",
            "Draft:",
            article,
            "",
            "Original orchestrator plan:",
            JSON.stringify(plan, null, 2),
            "",
            "Worker outputs:",
            JSON.stringify(workerOutputs, null, 2),
          ].join("\n"),
        },
      ],
    },
  ];
}

function getPlanningSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "string",
          enum: WORKERS.map((worker) => worker.id),
        },
        maxItems: WORKERS.length,
      },
      reason: { type: "string" },
    },
    required: ["tasks", "reason"],
  };
}

function getSummarySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      task: {
        type: "string",
        const: "summarize",
      },
      bullets: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
      },
    },
    required: ["task", "bullets"],
  };
}

function getHeadlineSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      task: {
        type: "string",
        const: "improve_headline",
      },
      recommended_headline: { type: "string" },
      alternatives: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
      },
      rationale: { type: "string" },
    },
    required: ["task", "recommended_headline", "alternatives", "rationale"],
  };
}

function getFinalSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      editor_note: { type: "string" },
      selected_tasks: {
        type: "array",
        items: {
          type: "string",
          enum: WORKERS.map((worker) => worker.id),
        },
        maxItems: WORKERS.length,
      },
      what_the_post_is_about: { type: "string" },
      headline_recommendation: { type: "string" },
      summary_preview: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "string" },
      },
    },
    required: [
      "editor_note",
      "selected_tasks",
      "what_the_post_is_about",
      "headline_recommendation",
      "summary_preview",
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

async function runWorker({ workerId, fixture, article }) {
  if (workerId === "summarize") {
    return createJsonResponse({
      model: WORKER_MODEL,
      input: buildSummaryWorkerInput({ fixture, article }),
      name: "orchestrator_worker_summarize",
      schema: getSummarySchema(),
    });
  }

  if (workerId === "improve_headline") {
    return createJsonResponse({
      model: WORKER_MODEL,
      input: buildHeadlineWorkerInput({ fixture, article }),
      name: "orchestrator_worker_improve_headline",
      schema: getHeadlineSchema(),
    });
  }

  throw new Error(`Unsupported worker "${workerId}" requested by orchestrator.`);
}

export async function runOrchestratorWorkersWorkflow({ fixture, onUpdate } = {}) {
  const article = readFixtureContent(fixture);

  onUpdate?.({
    type: "input_ready",
    fixture,
    article,
  });

  onUpdate?.({
    type: "orchestrator_planning_started",
  });

  const planningStartedAt = Date.now();
  const plan = await createJsonResponse({
    model: ORCHESTRATOR_MODEL,
    input: buildPlanningInput({ fixture, article }),
    name: "orchestrator_worker_plan",
    schema: getPlanningSchema(),
  });

  onUpdate?.({
    type: "orchestrator_planning_completed",
    durationMs: Date.now() - planningStartedAt,
    output: plan,
  });

  const workerOutputs = [];

  for (const workerId of plan.tasks) {
    const worker = getWorkerById(workerId);
    if (!worker) {
      throw new Error(`Orchestrator selected unknown worker "${workerId}".`);
    }

    onUpdate?.({
      type: "worker_started",
      workerId,
    });

    const startedAt = Date.now();
    const output = await runWorker({ workerId, fixture, article });
    const result = {
      worker,
      output,
    };
    workerOutputs.push(result);

    onUpdate?.({
      type: "worker_completed",
      workerId,
      durationMs: Date.now() - startedAt,
      output,
    });
  }

  onUpdate?.({
    type: "orchestrator_final_started",
  });

  const finalStartedAt = Date.now();
  const finalOutput = await createJsonResponse({
    model: ORCHESTRATOR_MODEL,
    input: buildFinalOrchestratorInput({
      fixture,
      article,
      plan,
      workerOutputs: workerOutputs.map((item) => item.output),
    }),
    name: "orchestrator_worker_final",
    schema: getFinalSchema(),
  });

  onUpdate?.({
    type: "orchestrator_final_completed",
    durationMs: Date.now() - finalStartedAt,
    output: finalOutput,
  });

  return {
    fixture,
    article,
    plan,
    workerOutputs,
    finalOutput,
  };
}
