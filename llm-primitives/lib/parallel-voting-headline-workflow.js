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

export const CANDIDATE_MODEL = "gpt-5.4-mini";
export const JUDGE_MODEL = "gpt-5.4-mini";
export const AGGREGATOR_MODEL = "gpt-5.4";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in your environment or .env file.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export { SUBSTACK_REVIEW_FIXTURES, formatFixtureMenu, getFixtureById, readFixtureContent };

export const CANDIDATE_COUNT = 4;

export const JUDGES = [
  {
    id: "curiosity",
    label: "Curiosity Judge",
    goal: "Vote for the headline most likely to make a reader stop and click without feeling gimmicky.",
  },
  {
    id: "clarity",
    label: "Clarity Judge",
    goal: "Vote for the headline that most clearly communicates the article's value and angle.",
  },
  {
    id: "audience",
    label: "Audience Fit Judge",
    goal: "Vote for the headline that best matches ambitious creators, founders, and thoughtful online builders.",
  },
  {
    id: "distinctiveness",
    label: "Distinctiveness Judge",
    goal: "Vote for the headline that feels freshest and least generic while still being truthful.",
  },
];

export function buildCandidateInput({ fixture, article }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You write strong Substack headline options.",
            "Generate four distinct headline candidates for the same article.",
            "Keep them truthful, specific, and publishable.",
            "Avoid clickbait, but allow curiosity.",
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
            `Article title right now: ${fixture.title}`,
            "",
            article,
          ].join("\n"),
        },
      ],
    },
  ];
}

export function buildJudgeInput({ judge, fixture, article, candidates }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are one judge in a headline voting workflow.",
            "Vote for exactly one headline candidate.",
            "Judge only from your assigned lens.",
            "Return valid JSON only.",
            `Your lens: ${judge.label}.`,
            judge.goal,
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
            "Headline candidates:",
            JSON.stringify(candidates, null, 2),
          ].join("\n"),
        },
      ],
    },
  ];
}

export function buildAggregatorInput({ fixture, article, candidates, votes, tiedCandidateIds }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are the tie-breaker editor in a headline voting workflow.",
            "You are only called when the judge vote ends in a tie.",
            "Use the original article as the source of truth.",
            "Read the tied candidates carefully, decide which one best captures the article while remaining compelling, and explain your decision.",
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
            `Tied candidates: ${tiedCandidateIds.join(", ")}`,
            "",
            "Candidates:",
            JSON.stringify(candidates, null, 2),
            "",
            "Votes:",
            JSON.stringify(votes, null, 2),
          ].join("\n"),
        },
      ],
    },
  ];
}

function getCandidateSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        minItems: CANDIDATE_COUNT,
        maxItems: CANDIDATE_COUNT,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: {
              type: "string",
              enum: ["A", "B", "C", "D"],
            },
            headline: {
              type: "string",
            },
            angle: {
              type: "string",
            },
          },
          required: ["id", "headline", "angle"],
        },
      },
    },
    required: ["candidates"],
  };
}

function getJudgeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      judge: { type: "string" },
      selected_candidate_id: {
        type: "string",
        enum: ["A", "B", "C", "D"],
      },
      rationale: { type: "string" },
      scorecard: {
        type: "array",
        minItems: CANDIDATE_COUNT,
        maxItems: CANDIDATE_COUNT,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            candidate_id: {
              type: "string",
              enum: ["A", "B", "C", "D"],
            },
            score: {
              type: "integer",
              minimum: 1,
              maximum: 5,
            },
            note: { type: "string" },
          },
          required: ["candidate_id", "score", "note"],
        },
      },
    },
    required: ["judge", "selected_candidate_id", "rationale", "scorecard"],
  };
}

function getAggregatorSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      winning_candidate_id: {
        type: "string",
        enum: ["A", "B", "C", "D"],
      },
      winning_headline: { type: "string" },
      why_it_won: { type: "string" },
      vote_summary: {
        type: "array",
        minItems: CANDIDATE_COUNT,
        maxItems: CANDIDATE_COUNT,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            candidate_id: {
              type: "string",
              enum: ["A", "B", "C", "D"],
            },
            votes: {
              type: "integer",
              minimum: 0,
              maximum: JUDGES.length,
            },
            headline: { type: "string" },
          },
          required: ["candidate_id", "votes", "headline"],
        },
      },
      optional_refinement: { type: "string" },
      decision_mode: {
        type: "string",
        enum: ["tiebreaker"],
      },
    },
    required: [
      "winning_candidate_id",
      "winning_headline",
      "why_it_won",
      "vote_summary",
      "optional_refinement",
      "decision_mode",
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

export async function runHeadlineVotingWorkflow({ fixture, onUpdate } = {}) {
  const article = readFixtureContent(fixture);

  onUpdate?.({
    type: "input_ready",
    fixture,
    article,
  });

  onUpdate?.({
    type: "candidate_generation_started",
  });

  const candidateStartedAt = Date.now();
  const candidateOutput = await createJsonResponse({
    model: CANDIDATE_MODEL,
    input: buildCandidateInput({ fixture, article }),
    name: "headline_candidates",
    schema: getCandidateSchema(),
  });
  const candidates = candidateOutput.candidates;

  onUpdate?.({
    type: "candidate_generation_completed",
    durationMs: Date.now() - candidateStartedAt,
    candidates,
  });

  const votePromises = JUDGES.map(async (judge) => {
    onUpdate?.({
      type: "judge_started",
      judgeId: judge.id,
    });

    const startedAt = Date.now();
    const output = await createJsonResponse({
      model: JUDGE_MODEL,
      input: buildJudgeInput({ judge, fixture, article, candidates }),
      name: `headline_vote_${judge.id}`,
      schema: getJudgeSchema(),
    });

    onUpdate?.({
      type: "judge_completed",
      judgeId: judge.id,
      durationMs: Date.now() - startedAt,
      output,
    });

    return {
      judge,
      output,
    };
  });

  const votes = await Promise.all(votePromises);

  const voteCounts = candidates.map((candidate) => ({
    candidate_id: candidate.id,
    votes: votes.filter((vote) => vote.output.selected_candidate_id === candidate.id).length,
    headline: candidate.headline,
  }));

  const highestVoteCount = Math.max(...voteCounts.map((item) => item.votes));
  const leaders = voteCounts.filter((item) => item.votes === highestVoteCount);

  if (leaders.length === 1) {
    const winner = leaders[0];
    const winningVote = votes.find(
      (vote) => vote.output.selected_candidate_id === winner.candidate_id,
    );

    const finalResult = {
      winning_candidate_id: winner.candidate_id,
      winning_headline: winner.headline,
      why_it_won:
        highestVoteCount === 1
          ? `All four judges split their votes, but ${winner.candidate_id} is treated as the winner only when it is the sole top vote-getter.`
          : `${winner.candidate_id} won outright with ${winner.votes} of ${JUDGES.length} votes, so no tie-breaker was needed.`,
      vote_summary: voteCounts,
      optional_refinement:
        winningVote?.output?.rationale ??
        "No extra refinement needed because the judges produced a clear winner.",
      decision_mode: "clear_vote_winner",
    };

    onUpdate?.({
      type: "clear_winner_selected",
      output: finalResult,
    });

    return {
      fixture,
      article,
      candidates,
      votes,
      finalResult,
    };
  }

  onUpdate?.({
    type: "aggregator_started",
  });

  const aggregatorStartedAt = Date.now();
  const finalResult = await createJsonResponse({
    model: AGGREGATOR_MODEL,
    input: buildAggregatorInput({
      fixture,
      article,
      candidates,
      votes: votes.map((vote) => vote.output),
      tiedCandidateIds: leaders.map((leader) => leader.candidate_id),
    }),
    name: "headline_vote_aggregator",
    schema: getAggregatorSchema(),
  });

  onUpdate?.({
    type: "aggregator_completed",
    durationMs: Date.now() - aggregatorStartedAt,
    output: finalResult,
  });

  return {
    fixture,
    article,
    candidates,
    votes,
    finalResult,
  };
}
