# Learnings

This file captures small, high-signal nuggets from specific implementation moments in the workflows we build here, especially when a detail from a good reference piece turns into a concrete design or prompting lesson.

## Voting Workflows Need Real Tie-Breaking Logic

While building the parallel voting headline workflow, one interesting issue surfaced immediately: judges can split their votes across different candidates, which means a "winner" is not always obvious from counting alone.

That led to an important realization: if an aggregator LLM is supposed to break ties intelligently, it should not only see the candidate options and the vote outputs. It should also see the original source article. Otherwise it is reasoning second-hand about faithfulness and quality without access to the primary material.

In practice, the improved design became:

- if there is a clear winner, stop and return it
- if there is a tie, run a tie-breaker step
- give that tie-breaker the original article as context

## Food For Thought: Re-Run Instead Of Tie-Break

Another open question worth exploring is whether a tie should always be resolved by a tie-breaker at all.

A different approach would be to treat a tie as a signal that the candidate set was not decisive enough, then re-run candidate generation, re-run judging, or iterate the workflow for another round before selecting a final answer.

That could be especially interesting for creative workflows like headline generation, where multiple passes might produce a better search over the space of options than a single pass plus one final tie-break decision.
