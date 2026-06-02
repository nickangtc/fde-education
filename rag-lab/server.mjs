import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat, unlink } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = join(__dirname, "dental_clinic_kb.jsonl");
const INDEX_PATH = join(__dirname, ".rag-index.json");
const PUBLIC_DIR = join(__dirname, "public");

const PORT = Number(process.env.PORT || 8787);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-5.4-mini";
const HYBRID_VECTOR_WEIGHT = 0.68;
const HYBRID_KEYWORD_WEIGHT = 0.32;
const args = new Set(process.argv.slice(2));

let index = null;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function cosine(a, b) {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }

  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag) || 1);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function openai(path, body) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required. Export it, then run `npm start` from rag-lab."
    );
  }

  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload;
}

async function embed(input) {
  const response = await openai("embeddings", {
    model: EMBEDDING_MODEL,
    input
  });

  return response.data.map((item) => item.embedding);
}

async function loadDataset() {
  const raw = await readFile(DATASET_PATH, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function buildLexicalStats(docs) {
  const documentFrequency = new Map();

  for (const doc of docs) {
    const uniqueTerms = new Set(tokenize(`${doc.title} ${doc.tags.join(" ")} ${doc.text}`));
    for (const term of uniqueTerms) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  return Object.fromEntries(documentFrequency);
}

async function buildIndex() {
  const docs = await loadDataset();
  const embeddingInputs = docs.map((doc) => {
    return [
      `Title: ${doc.title}`,
      `Category: ${doc.category}`,
      `Audience: ${doc.audience}`,
      `Tags: ${doc.tags.join(", ")}`,
      doc.text
    ].join("\n");
  });
  const embeddings = await embed(embeddingInputs);

  const indexedDocs = docs.map((doc, i) => ({
    ...doc,
    embedding: embeddings[i],
    terms: tokenize(`${doc.title} ${doc.category} ${doc.tags.join(" ")} ${doc.text}`)
  }));

  const nextIndex = {
    created_at: new Date().toISOString(),
    dataset_path: DATASET_PATH,
    dataset_mtime_ms: (await stat(DATASET_PATH)).mtimeMs,
    embedding_model: EMBEDDING_MODEL,
    lexical_document_frequency: buildLexicalStats(docs),
    docs: indexedDocs
  };

  await writeFile(INDEX_PATH, JSON.stringify(nextIndex, null, 2));
  return nextIndex;
}

async function loadIndex() {
  if (args.has("--reset")) {
    await unlink(INDEX_PATH).catch(() => {});
  }

  const datasetStat = await stat(DATASET_PATH);
  const existing = await readFile(INDEX_PATH, "utf8")
    .then(JSON.parse)
    .catch(() => null);

  if (
    existing &&
    existing.embedding_model === EMBEDDING_MODEL &&
    existing.dataset_mtime_ms === datasetStat.mtimeMs
  ) {
    return existing;
  }

  return buildIndex();
}

function applyFilters(docs, filters = {}) {
  return docs.filter((doc) => {
    if (filters.audience && doc.audience !== filters.audience) return false;
    if (filters.category && doc.category !== filters.category) return false;
    if (filters.tag && !doc.tags.includes(filters.tag)) return false;
    return true;
  });
}

function keywordScore(doc, queryTerms, documentFrequency, totalDocs) {
  const termCounts = new Map();
  for (const term of doc.terms) termCounts.set(term, (termCounts.get(term) || 0) + 1);

  return queryTerms.reduce((score, term) => {
    const tf = termCounts.get(term) || 0;
    if (!tf) return score;

    const idf = Math.log((1 + totalDocs) / (1 + (documentFrequency[term] || 0))) + 1;
    return score + Math.sqrt(tf) * idf;
  }, 0);
}

async function search(query, filters = {}, limit = 5, options = {}) {
  const startedAt = performance.now();
  const queryTerms = tokenize(query);
  const embeddingStartedAt = performance.now();
  const [queryEmbedding] = await embed(query);
  const embeddingMs = performance.now() - embeddingStartedAt;
  const candidates = applyFilters(index.docs, filters);
  const raw = candidates.map((doc) => {
    const vector = cosine(queryEmbedding, doc.embedding);
    const keyword = keywordScore(
      doc,
      queryTerms,
      index.lexical_document_frequency,
      index.docs.length
    );

    return { doc, vector, keyword };
  });

  const maxKeyword = Math.max(...raw.map((item) => item.keyword), 0.001);
  const scored = raw
    .map((item) => {
      const vectorScore = (item.vector + 1) / 2;
      const keywordScoreNormalized = item.keyword / maxKeyword;
      const score =
        HYBRID_VECTOR_WEIGHT * vectorScore + HYBRID_KEYWORD_WEIGHT * keywordScoreNormalized;

      return {
        id: item.doc.id,
        title: item.doc.title,
        category: item.doc.category,
        audience: item.doc.audience,
        tags: item.doc.tags,
        source_type: item.doc.source_type,
        last_reviewed: item.doc.last_reviewed,
        text: item.doc.text,
        score,
        vector_score: vectorScore,
        keyword_score: keywordScoreNormalized
      };
    })
    .sort((a, b) => b.score - a.score);

  const results = scored.slice(0, limit);
  if (!options.debug) return results;

  return {
    results,
    debug: {
      query_terms: queryTerms,
      requested_limit: limit,
      documents_in_index: index.docs.length,
      documents_after_filters: candidates.length,
      embedding_ms: Math.round(embeddingMs),
      retrieval_ms: Math.round(performance.now() - startedAt),
      scoring: {
        vector_weight: HYBRID_VECTOR_WEIGHT,
        keyword_weight: HYBRID_KEYWORD_WEIGHT,
        keyword_style: "sqrt(term frequency) * inverse document frequency"
      },
      candidates: scored.map((doc) => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        audience: doc.audience,
        score: doc.score,
        vector_score: doc.vector_score,
        keyword_score: doc.keyword_score
      }))
    }
  };
}

function buildContext(results) {
  return results
    .map((doc, i) => {
      return [
        `[${i + 1}] ${doc.title}`,
        `id: ${doc.id}`,
        `category: ${doc.category}`,
        `audience: ${doc.audience}`,
        `tags: ${doc.tags.join(", ")}`,
        `text: ${doc.text}`
      ].join("\n");
    })
    .join("\n\n");
}

function normalizeHistory(history = []) {
  return history
    .filter((item) => item && ["user", "assistant"].includes(item.role) && item.content)
    .slice(-6)
    .map((item) => ({
      role: item.role,
      content: String(item.content).slice(0, 1200)
    }));
}

function extractOutputText(payload) {
  if (payload.output_text) return payload.output_text;

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

const QUERY_REWRITE_PROMPT = [
  "You rewrite follow-up messages for a dental clinic RAG chatbot into standalone retrieval queries.",
  "Use the recent conversation only to resolve references, missing subjects, and implied constraints.",
  "Preserve clinically relevant symptoms, timing, procedure names, billing or scheduling intent, and safety details.",
  "When the latest message is a short follow-up, explicitly include the subject from recent history.",
  "Do not answer the patient. Do not add advice. Do not cite sources.",
  "If the latest user message is already standalone, return it unchanged.",
  "Return exactly one concise search query.",
  "Example: history says a temporary crown came off, latest says 'Can I use glue?' -> 'Can a patient use household glue or temporary dental cement when a temporary crown came off after hours?'",
  "Example: history asks about swelling near a back tooth, latest says 'Can I wait?' -> 'Can a patient wait to be seen for swelling near a back tooth?'"
].join(" ");

async function rewriteQuery(question, history = []) {
  const cleanHistory = normalizeHistory(history);
  if (!cleanHistory.length) {
    return {
      query: question,
      debug: {
        skipped: true,
        reason: "No prior conversation history was provided.",
        prompt: QUERY_REWRITE_PROMPT,
        history: cleanHistory,
        original_question: question,
        rewritten_query: question,
        rewrite_ms: 0
      }
    };
  }

  const startedAt = performance.now();
  const response = await openai("responses", {
    model: CHAT_MODEL,
    input: [
      {
        role: "system",
        content: QUERY_REWRITE_PROMPT
      },
      {
        role: "user",
        content: [
          "Recent conversation:",
          JSON.stringify(cleanHistory, null, 2),
          "",
          "Latest user message:",
          question
        ].join("\n")
      }
    ],
    max_output_tokens: 120
  });

  const rewritten = extractOutputText(response).trim() || question;
  return {
    query: rewritten,
    debug: {
      skipped: false,
      prompt: QUERY_REWRITE_PROMPT,
      history: cleanHistory,
      original_question: question,
      rewritten_query: rewritten,
      rewrite_ms: Math.round(performance.now() - startedAt)
    }
  };
}

async function chat(question, filters = {}, history = []) {
  const startedAt = performance.now();
  const chatFilters = { audience: "patients", ...filters };
  const rewrite = await rewriteQuery(question, history);
  const retrieval = await search(rewrite.query, chatFilters, 5, { debug: true });
  const results = retrieval.results;
  const context = buildContext(results);
  const cleanHistory = normalizeHistory(history);
  const answerInput = [
    {
      role: "system",
      content:
        "You are Brightside Family Dental's patient-facing chatbot. Be warm, concise, and plainspoken. Use only the provided clinic knowledge. Do not diagnose, promise insurance payment, prescribe medication, or replace a dentist's evaluation. For trouble breathing, trouble swallowing, rapidly spreading swelling, severe allergic symptoms, uncontrolled bleeding, chest pain, loss of consciousness, or severe trauma, tell the patient to seek emergency medical care now. For urgent dental symptoms, tell them to call the clinic for the soonest evaluation. Cite the knowledge-base titles you used."
    },
    {
      role: "user",
      content: [
        `Recent conversation:\n${JSON.stringify(cleanHistory, null, 2)}`,
        "",
        `Latest patient question:\n${question}`,
        "",
        `Standalone retrieval query used:\n${rewrite.query}`,
        "",
        `Retrieved clinic knowledge:\n${context}`
      ].join("\n")
    }
  ];
  const generationStartedAt = performance.now();
  const response = await openai("responses", {
    model: CHAT_MODEL,
    input: answerInput,
    max_output_tokens: 500
  });
  const generationMs = performance.now() - generationStartedAt;
  const answer = extractOutputText(response);

  return {
    answer,
    results,
    debug: {
      submitted_at: new Date().toISOString(),
      total_ms: Math.round(performance.now() - startedAt),
      generation_ms: Math.round(generationMs),
      requested_filters: filters,
      effective_filters: chatFilters,
      chat_model: CHAT_MODEL,
      embedding_model: EMBEDDING_MODEL,
      query_rewrite: rewrite.debug,
      retrieved_context: context,
      final_answer_input: answerInput,
      final_answer_input_summary: {
        history_turns: cleanHistory.length,
        retrieved_documents: results.map((doc, index) => ({
          rank: index + 1,
          id: doc.id,
          title: doc.title,
          score: doc.score
        })),
        context_character_count: context.length
      },
      answer_character_count: answer.length,
      retrieval: retrieval.debug
    }
  };
}

function metadata() {
  const docs = index.docs;
  const unique = (values) => [...new Set(values)].sort();
  return {
    chat_model: CHAT_MODEL,
    embedding_model: EMBEDDING_MODEL,
    documents: docs.length,
    index_created_at: index.created_at,
    audiences: unique(docs.map((doc) => doc.audience)),
    categories: unique(docs.map((doc) => doc.category)),
    tags: unique(docs.flatMap((doc) => doc.tags))
  };
}

function publicDoc(doc) {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    audience: doc.audience,
    tags: doc.tags,
    source_type: doc.source_type,
    author_role: doc.author_role,
    last_reviewed: doc.last_reviewed,
    text: doc.text
  };
}

async function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(PUBLIC_DIR, `.${safePath}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const file = await readFile(filePath).catch(() => null);
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const contentTypes = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript"
  };

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
  });
  response.end(file);
}

async function handle(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/metadata") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(metadata()));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/docs") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ docs: index.docs.map(publicDoc) }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/search") {
      const body = await readJsonBody(request);
      const results = await search(body.question || body.query || "", body.filters || {}, 5);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ results }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJsonBody(request);
      const result = await chat(body.question || "", body.filters || {}, body.history || []);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "GET") {
      await serveStatic(url.pathname, response);
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

async function smoke() {
  const docs = await loadDataset();
  const required = ["id", "title", "category", "audience", "tags", "text"];
  for (const doc of docs) {
    for (const key of required) {
      if (!(key in doc)) throw new Error(`${doc.id || "unknown"} missing ${key}`);
    }
  }
  console.log(`Validated ${docs.length} JSONL records.`);
}

if (args.has("--smoke")) {
  await smoke();
} else {
  await mkdir(PUBLIC_DIR, { recursive: true });
  console.log("Loading RAG index...");
  index = await loadIndex();
  console.log(`Indexed ${index.docs.length} docs with ${EMBEDDING_MODEL}.`);
  createServer(handle).listen(PORT, () => {
    console.log(`Brightside RAG chatbot: http://localhost:${PORT}`);
    console.log(`Chat model: ${CHAT_MODEL}`);
  });
}
