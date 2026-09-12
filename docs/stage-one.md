# Stage one — architectural project workspaces

## Delivered flows

1. Filter the portfolio by project phase or search by project/client/location; switch between cards and a table.
2. Open a workspace to see task progress, next milestone, pending decisions, budget expenditure, and recent activity.
3. Create/edit/delete tasks with discipline, priority, owner, and deadline; move them by dragging or using the status selector.
4. Plan dated milestones and review them in a timeline.
5. Upload documents, append immutable versions, preview/download files, and visually compare two versions side by side.
6. Create issues from a selected 2D element and return to that element through a project-scoped link.
7. Maintain indicative budget lines with quantities, unit prices, and actual expenditure; optionally prefill a quantity using plan area.
8. Request a local client decision on a specific deliverable version and record approval or requested changes with feedback.

New management collections start empty for newly created projects. The bundled examples are clearly demonstration data. Existing design tools remain within the same workspace navigation.

## UX and technical checks

- Explicit save/cancel, required fields, failure messages, busy states, and delete confirmation.
- Native dialog keyboard behavior; Kanban alternatives for keyboard and touch users.
- Project-scoped loading/error states and lazy screen loading.
- Shared neutral/blue color tokens with dark-mode contrast, responsive cards, and horizontally scrollable tables/navigation.
- English, Spanish, and Portuguese workspace dictionaries loaded over HTTP.
- API integration suite covers persistence, validation, scope isolation, optimistic concurrency, document lineage, approval propagation, costs, and concurrent writes.

## Deliberate boundaries

Validation on 2026-09-10: lint, TypeScript/production build, and the REST integration suite passed. Browser checks covered creating an empty project, task state persistence after reload, decision propagation to a document version, dark-mode English labels, and a 390 px mobile document view. All 210 workspace translation keys match across es/en/pt. Dependency patches updated Next.js to 16.3.3, sharp to 0.35.4, and js-yaml to 4.3.2; the package audit reported zero known vulnerabilities at that time.

This is a local management prototype, not a full construction ERP or secure client portal. It does not send invitations/email, identify users, generate contracts/invoices, synchronize teams, infer engineering quantities, compare drawings automatically, or execute structural analysis. Timeline bars do not implement dependency scheduling. Document comparison is visual, not automated change detection. Budget numbers and seismic visuals must not be treated as certified estimates or engineering conclusions.

Before deployment: add authentication and authorization per workspace, durable relational storage with transactions, blob storage and scanning, pagination, backups, observability, and automated browser regression tests. Review dependency audit findings before publishing.
