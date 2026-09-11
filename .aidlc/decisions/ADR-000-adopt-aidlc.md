# ADR-000: Adopt AIDLC

Date: {{DATE}}
Status: accepted

## Decision
This project runs the AIDLC gates from Ringzero787/aidlc on every PR and release.

## Consequences
- Every feature gets a registry id (F-###) and a spec before code.
- Blocking gates: hygiene, build, security (high-confidence), IP/license, release.
- Waivers are recorded in `.aidlc/waivers.yaml` with a reason.
