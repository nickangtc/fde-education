# rag-lab

Synthetic knowledge-base data for a small to medium-sized dental clinic RAG
demo.

The dataset is fictional and contains no real patient information. It is meant
to simulate the mix of documents a practice owner and staff might maintain for
answering patient questions about oral health, appointments, costs, insurance,
and day-to-day operations.

## Files

- `dental_clinic_kb.jsonl` contains one knowledge-base record per line.
- `sample_queries.md` contains example patient and staff questions for retrieval
  testing.
- `server.mjs` runs a minimal customer-facing RAG chatbot.
- `public/` contains the small browser UI for trying the chatbot and inspecting
  retrieved sources.

## Record schema

Each JSONL record has:

- `id`: stable document identifier
- `title`: short human-readable document title
- `category`: broad retrieval category
- `source_type`: simulated source format
- `audience`: intended primary reader
- `author_role`: fictional role that would have written or owned the content
- `last_reviewed`: synthetic review date
- `tags`: keywords useful for filtering and retrieval
- `text`: document body

## Suggested RAG uses

Use this dataset to test:

- patient-facing FAQ retrieval
- appointment and scheduling policy lookup
- post-op instruction retrieval
- insurance and payment explanation retrieval
- emergency triage routing
- tone differences between patient-facing and internal staff guidance

The material is intentionally realistic but not clinical advice. A demo app
should include a guardrail that directs patients to call the clinic or emergency
services for urgent symptoms, severe pain, swelling, trauma, allergic reactions,
or other high-risk situations.

## Minimal RAG chatbot

This prototype uses:

- OpenAI embeddings with `text-embedding-3-small`
- hybrid retrieval: cosine vector search plus keyword scoring
- metadata filters: `audience`, `category`, and `tag`
- filesystem persistence in `.rag-index.json`
- OpenAI Responses API for the patient-facing chatbot

Run it from this folder:

```bash
export OPENAI_API_KEY="..."
npm start
```

Then open `http://localhost:8787`.

To rebuild embeddings from scratch on restart:

```bash
npm run start:reset
```

Defaults can be changed with environment variables:

```bash
CHAT_MODEL=gpt-5.4-mini EMBEDDING_MODEL=text-embedding-3-small PORT=8787 npm start
```

OpenAI's March 17, 2026 announcement and model docs list `gpt-5.4-mini` as a
faster, efficient GPT-5.4-family model for high-volume workloads. If another
model is enabled on your account, set `CHAT_MODEL` to that exact model id.

## RAG engineering insights

### Retrieval is product behavior

RAG quality depends as much on retrieval decisions as model choice. Chunking,
metadata filters, top-k, hybrid weights, query rewriting, and citation handling
all decide what the model is allowed to know on a turn. If an answer is bad, the
model may not be the root cause. The retrieved context may be missing, stale,
too broad, too narrow, or phrased for the wrong audience.

### Metadata filtering trades relevance for control

The customer-facing chatbot defaults to `audience=patients`, which excludes
staff documents before retrieval. That is safer for tone and confidentiality,
but it can hide operationally useful facts that only exist in staff SOPs.

A production design might separate access from citation:

```text
patient docs = directly citeable
staff docs = internal policy context, rewritten into patient-facing language
```

This prototype uses hard filtering because it makes the safety tradeoff easy to
see.

### Chunking is schema design

This dataset is already made of short, focused records, so each JSONL record is
treated as one chunk. That keeps the prototype simple and preserves the natural
unit of meaning: title, category, audience, tags, review date, and text.

In larger systems, chunking should preserve answerable units rather than only
split by token count. A good chunk usually carries enough metadata and context
to stand on its own.

### Second-turn RAG needs query rewriting

Follow-up messages are often bad retrieval queries:

```text
Can I use glue?
```

The rewrite step uses recent chat history to turn that into a standalone search
query:

```text
Can a patient use glue when a temporary crown came off after dinner?
```

The system then retrieves fresh documents for the rewritten query. It does not
reuse old retrieved documents from previous turns. That keeps each turn grounded
in current retrieval while still resolving conversational references.

### Debuggability is part of the product

The Debug tab exposes the request path:

```text
user question
recent conversation history
metadata filters
query rewrite prompt and output
retrieval candidates and scores
final LLM input
generation timing
rendered sources
```

This matters because the final LLM input is the source of truth. Debugging RAG
by guessing what was sent to the model is unreliable.

### Citations should become deterministic

This prototype asks the model to cite knowledge-base titles it used. That is
fine for teaching, but production citations should usually be validated by code.
For example, the model can emit `[1]` and `[2]`, then the UI can render those
markers against the actual retrieved documents.

### Hybrid search is a tuning surface

The current hybrid score blends semantic and keyword signals:

```text
0.68 * vector score + 0.32 * keyword score
```

This is not a universal value. Keyword search helps with exact terms, procedure
names, codes, and rare phrases. Vector search helps with paraphrases and fuzzy
intent. The right blend should be tuned against real queries and failure cases.

### Top-k is risk management

The chatbot passes the top 5 retrieved documents to the answer model. Too few
documents can omit needed context. Too many documents can pollute the prompt
with weakly related or conflicting information. Production systems often
retrieve more candidates, optionally rerank, then pass fewer documents to the
answer model.

## Why the simple design is valid here

This lab intentionally uses a minimal design because the goal is to make RAG
mechanics visible.

### No vector database

There are only 38 documents, so brute-force cosine similarity over all
metadata-filtered candidates is fast and easier to inspect. A vector database or
ANN index would add operational complexity without teaching much at this size.

At larger scale, this would become:

```text
vector index / vector database -> top N dense candidates
```

### No inverted index

The keyword side stores per-document token lists and global document-frequency
counts, then scans candidate docs at query time. It does not store a true
inverted index like:

```text
term -> doc_id -> term_count
```

That is acceptable for 38 documents because brute-force keyword scoring is
cheap. It also keeps the code easy to read while teaching term frequency and
inverse document frequency. A real inverted index would matter once lexical
retrieval needs to avoid scanning many documents.

### No BM25

The lexical score is TF-IDF-style, not full BM25. It uses repeated term matches
and inverse document frequency, but it does not include BM25's length
normalization or saturation parameters.

That is valid for the lab because the documents are similarly sized and the
point is to show how lexical and semantic retrieval combine. Real production
search would usually use BM25 or a managed search engine for the sparse side.

### No reranker

The current system ranks by the hybrid score and sends the top 5 documents. A
reranker would add a second stage:

```text
hybrid retrieve top N -> rerank -> answer with top K
```

Skipping reranking keeps latency and implementation cost low. It is a good next
step when the top 5 contain plausible but poorly ordered documents.

### Filesystem persistence

The generated `.rag-index.json` stores embeddings, token lists, and lexical
stats. It can be deleted or rebuilt with `npm run start:reset`. This is enough
for a touchable prototype and keeps the ingestion lifecycle obvious.

Production systems need stronger lifecycle controls: index versioning,
background ingestion, stale-content detection, rollback, and evaluation.

### One record equals one chunk

The JSONL records are already concise clinic knowledge units, so one record per
chunk is reasonable. If the source material became long policies, PDFs, or web
pages, chunking would need to become more deliberate.

### Small model for query rewrite

The query rewrite step is a bounded transformation task. A low-latency model is
appropriate because the goal is only to resolve references and create a better
retrieval query, not to answer the patient.
