# 0013 — Grounded answers for Ask AI (code checks every figure)

**Status:** Accepted (task T37)

## Context

Ask AI (T36) answers owners' questions from four read-only tools. The data is right, but a language model can still:
1. **mis-state** a figure the tool returned (₹1,250 becomes ₹1,520),
2. **invent** a figure for something no tool covers ("your profit is about ₹4,800"),
3. **mis-compute** a comparison ("up 40%" when it's 25%).

The owner asked for RAG to fix this. **RAG was considered and rejected for this problem.** RAG retrieves *similar text*. These questions are about structured numbers, and the tools already retrieve them exactly: the assistant is already retrieval-augmented. Similarity search over sales data would make answers less exact, not more. RAG stays an option for text, such as QBite help docs ("how do I add sizes?") or customer feedback once it's collected.

## Decision: the model drafts, code checks (ADR 0009 applied to numbers)

`src/lib/ai/grounding.ts`, pure functions:
- **Extract every figure** in the reply: money, counts and percentages. Dates, clock times and numbered-list markers are skipped, because they're formatting, not figures.
- **Build the allowed set:** every number in the tool results (including digits inside strings like `ORD-0042` and formatted money), the owner's own question ("top 5"), the size and positions of returned lists, **differences** between tool figures, and **percentage changes** between them, recomputed with `pricing.ts`. Sums are deliberately excluded: sums of arbitrary pairs "grounded" made-up small numbers (4 + 5 = 9) in testing.
- **Check:** money must match within ₹0.01 and percentages within 0.6 points.

`runOwnerAssistant`:
- If any figure fails, the answer is **regenerated once**, with the unverified figures named as feedback.
- If it still fails, the reply is returned with `verified: false` and the figures listed. The page shows a warning naming them and linking to Sales reports. **A figure is never shown as checked when it isn't.**

Also:
- **"Based on" sources are built in code** from the calls the answer used (for example "Today's sales · 4 orders" → Sales reports), never from the model's text.
- **The "QBite doesn't track that yet" list is in the prompt:** profit, costs, stock, staff hours, customer details and reviews. The code backs it up: a reply with figures but no tool data fails the check.

## Consequences

- ✅ Mis-stated, invented and mis-computed figures are caught by code, not hoped against in a prompt. 15 unit tests, including the false-alarm cases (lists, dates, order numbers).
- ✅ The owner sees what each answer was based on, one tap from the page that proves it.
- ⚠️ A failed check costs one more model loop, so the route allows 90 s.
- ⚠️ The check covers figures, not claims in words ("sales are growing"). Wording errors are still possible; the sources line is the mitigation.
- ⚠️ A genuinely correct figure the code can't derive (for example a sum the owner asked for) is flagged. That's the safe direction, and the warning tells the owner where to check.
- 📌 Next: an eval set of owner questions on fixed data, to measure the unverified-figure rate before changing the prompt or model.

## Where it lives

- `src/lib/ai/grounding.ts` and `grounding.test.ts`
- `src/lib/ai/owner-assistant.ts` (`runOwnerAssistant`, `buildSources`)
- `src/components/assistant/OwnerAssistantChat.tsx` (`AnswerFooter`)
