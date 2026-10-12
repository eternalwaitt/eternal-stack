# Optional plan review guide

Use when the user requests a review or the stored workflow contract requires independent review. This guide supplies review questions only; the workflow contract determines whether a review is mandatory and how much review work is authorized.

Lead with material findings and tie each to the request, plan text, repository evidence, or a named assumption. Treat those as separate sources of truth.

Check whether:

- Each requested outcome has a task and an observable acceptance result.
- Existing code, scripts, checks, and project conventions have been inspected before proposing new surfaces.
- Dependencies, write ownership, failure modes, verification, rollback, and external effects are concrete where relevant.
- The plan's impact scope matches the actual work and does not quietly narrow the user's request.
- Verification demonstrates the user-visible or system behavior promised by the plan.
- Any assumption that would change the design, authorization, or rollout is surfaced rather than guessed.

Distinguish a defect from a preference, an unavailable tool, and evidence that cannot be obtained from the current checkout. Suggest the smallest correction that resolves the finding. Do not convert optional review lenses or bundled skills into default gates.
