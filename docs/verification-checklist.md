# Verification Checklist

Use this checklist before the final submission.

- Valid label returns `APPROVED`.
- Brand/class/producer mismatches return `NEEDS_REVIEW`.
- Case-only fuzzy text differences pass.
- ABV normalization passes for `45%` vs `45% Alc./Vol. (90 Proof)`.
- Net-contents normalization passes for `750 mL` vs `750ml`.
- Country synonym normalization passes for `USA` vs `United States`.
- Missing, wrong-caps, and punctuation-changed government warnings fail.
- Correct government warning passes.
- Misread warning returns the extracted text for manual review.
- Imperfect image returns partial data or a readable error, not a crash.
- Wrong file type returns a readable 4xx error.
- Empty image returns a readable 4xx error.
- Batch summary counts approved, needs-review, and total correctly.
- Single-label deployed latency is under 5 seconds, or the measured bottleneck is documented.

