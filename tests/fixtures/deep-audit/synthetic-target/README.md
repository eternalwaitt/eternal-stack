# Synthetic Deep Audit Target

This fixture is a deterministic target for deep-audit report authoring tests.

Required row types:

- `route_matrix`: proves route, status, cold latency, warm latency, bytes, auth fixture, and dynamic fixture rows can be authored.
- `auth_blocker`: proves missing authenticated evidence remains source-limited.
- `not_applicable`: proves stack-inapplicable checks do not become false findings.
- `CONFIRMED_CLEAN`: proves clean checks are explicit.
- `CHECKS_SKIPPED`: proves skipped checks include check id, worklist id, and reason.
