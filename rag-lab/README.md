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
