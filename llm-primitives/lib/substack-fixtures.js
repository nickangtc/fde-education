import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDirectory = path.resolve(__dirname, "../data/substack-posts");

export const SUBSTACK_REVIEW_FIXTURES = [
  {
    id: 1,
    slug: "to-claw-or-not-to-claw",
    title: "To Claw or not to Claw?",
    publishedAt: "2026-04-13",
    filePath: path.join(fixturesDirectory, "2026-04-13-to-claw-or-not-to-claw.md"),
  },
  {
    id: 2,
    slug: "how-instagram-became-my-unexpected-growth-engine",
    title: "How Instagram became my unexpected growth engine",
    publishedAt: "2026-04-06",
    filePath: path.join(
      fixturesDirectory,
      "2026-04-06-how-instagram-became-my-unexpected-growth-engine.md",
    ),
  },
  {
    id: 3,
    slug: "god-i-love-mondays",
    title: "God I love mondays",
    publishedAt: "2026-03-31",
    filePath: path.join(fixturesDirectory, "2026-03-31-god-i-love-mondays.md"),
  },
];

export function formatFixtureMenu() {
  return SUBSTACK_REVIEW_FIXTURES.map(
    (fixture) => `${fixture.id}. ${fixture.title} (${fixture.publishedAt})`,
  ).join("\n");
}

export function getFixtureById(id) {
  return SUBSTACK_REVIEW_FIXTURES.find((fixture) => fixture.id === id) ?? null;
}

export function readFixtureContent(fixture) {
  return fs.readFileSync(fixture.filePath, "utf8");
}
