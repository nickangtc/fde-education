import { config as loadEnv } from "dotenv";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.resolve(__dirname, "../.env") });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in your environment or .env file.");
  process.exit(1);
}

try {
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: "Say hello in one short sentence for a JavaScript SDK demo.",
  });

  console.log(response.output_text);
} catch (error) {
  if (error?.status === 401) {
    console.error(
      "OpenAI rejected the API key from ../.env. Double-check OPENAI_API_KEY and try again.",
    );
  } else {
    console.error("OpenAI request failed:", error.message);
  }

  process.exit(1);
}
