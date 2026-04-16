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

## More Context Is Not Automatically Better In Orchestrator Workflows

While discussing the minimal orchestrator-workers Substack demo in [`llm-primitives/`](./llm-primitives/README.md), one subtle but important design point came into focus: the first orchestrator call and the final synthesis-style orchestrator call do not have to be linked as one continuous LLM conversation.

It is tempting to assume that carrying forward more model context is always better. In practice, splitting the planning call and the final call into separate, self-contained requests can be a feature rather than a limitation.

The benefits of keeping them separate are:

- less anchoring on the orchestrator's first plan, which makes it easier for the final step to reason from the worker outputs in front of it
- easier debugging, because an odd final answer can usually be traced to one self-contained step instead of hidden carry-over state
- clearer program boundaries, since the code must explicitly pass the plan and worker outputs back into the final step

The tradeoff is that a linked conversation can sometimes improve continuity, especially in longer agentic loops. But for a small teaching workflow like the minimal orchestrator-workers example, explicit handoff between separate calls can make the behavior easier to understand, inspect, and trust.
