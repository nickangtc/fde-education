import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
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

export const DEFAULT_BRIEF =
  "Album is a private photo and video sharing app for your inner circle. Write warm, premium-feeling marketing copy for busy parents who want to share family moments without posting them to social media.";

export const DEFAULT_TARGET_LANGUAGE = "Spanish";
export const OPENAI_MODEL = MODEL;

export function buildGenerateMarketingInput(inputBrief) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are a product marketer writing launch-ready website copy.",
            "Return exactly three labeled sections in plain text:",
            "Headline: one short line.",
            "Body: 2-3 sentences.",
            "CTA: one short call to action.",
            "Keep the tone warm, intimate, premium, and clear.",
            "Do not mention that this is AI-generated.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Write marketing copy for Album from this brief:\n${inputBrief}`,
        },
      ],
    },
  ];
}

export function buildTranslateMarketingInput(copy, language) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are a marketing translator.",
            "Translate the copy naturally for native speakers.",
            "Preserve the three labels Headline, Body, and CTA in English so the structure stays easy to compare.",
            "Translate only the content after each label.",
            "Keep the tone warm, intimate, and premium.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Translate this marketing copy into ${language}:\n\n${copy}`,
        },
      ],
    },
  ];
}

export function ensureMarketingShape(copy) {
  const requiredSections = ["Headline:", "Body:", "CTA:"];
  const missingSections = requiredSections.filter((section) => !copy.includes(section));

  if (missingSections.length > 0) {
    throw new Error(
      `Generated copy is missing required sections: ${missingSections.join(", ")}`,
    );
  }
}

export async function generateMarketingCopy(inputBrief) {
  const input = buildGenerateMarketingInput(inputBrief);
  const response = await client.responses.create({
    model: MODEL,
    input,
  });

  return response.output_text.trim();
}

export async function translateMarketingCopy(copy, language) {
  const input = buildTranslateMarketingInput(copy, language);
  const response = await client.responses.create({
    model: MODEL,
    input,
  });

  return response.output_text.trim();
}

export async function runPromptChain({
  brief = DEFAULT_BRIEF,
  targetLanguage = DEFAULT_TARGET_LANGUAGE,
} = {}) {
  const marketingCopy = await generateMarketingCopy(brief);
  ensureMarketingShape(marketingCopy);

  const translatedCopy = await translateMarketingCopy(marketingCopy, targetLanguage);
  ensureMarketingShape(translatedCopy);

  return {
    brief,
    model: MODEL,
    targetLanguage,
    marketingCopy,
    translatedCopy,
  };
}
