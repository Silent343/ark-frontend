# Ark frontend architecture

Ark uses explicit bounded contexts. Clean Architecture layers live **inside** each context instead of being global application folders.

## Stage 2 contexts

| Bounded context           | Responsibility                                                         |
| ------------------------- | ---------------------------------------------------------------------- |
| `identity-access`         | Accounts, password verification, sessions and project-role identity    |
| `team-management`         | Project members, invitations and workload read model                   |
| `project-scheduling`      | Calendar events, finish-to-start dependencies, Gantt and critical path |
| `collaboration`           | Attributed, visibility-scoped discussions and semantic references      |
| `delivery-management`     | Stage packages containing explicit document-version identifiers        |
| `change-control`          | Append-only actor-attributed change read model                         |
| `notification-management` | Recipient-scoped project notifications and read state                  |
| `reporting`               | Project risk/cost read models and paginated PDF output                 |

Read-only frontend contexts use domain/presentation layers without empty repositories or application folders. Server-side authorization, relationship checks and audit orchestration now live in `teluria-backend`.

## Context map

| Bounded context            | Responsibility                                                             | Upstream dependency                     |
| -------------------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| `project-management`       | Project portfolio, creation, metadata, and lifecycle                       | None                                    |
| `task-management`          | Task assignments, priority, discipline, and workflow                       | Project identifier                      |
| `project-planning`         | Milestones, delivery dates, and timeline                                   | Project identifier                      |
| `document-management`      | Uploaded sources, immutable file versions, and review status               | Project identifier                      |
| `issue-management`         | Issues and optional semantic element references                            | Project/element identifiers             |
| `cost-management`          | Indicative quantities, unit costs, and actual expenditure                  | Optional plan area via public contract  |
| `client-approvals`         | Requests and recorded decisions for a specific document version            | Document public contract                |
| `plan-digitization`        | Semantic blueprint, rooms, walls, openings, columns, and 2D correction     | None                                    |
| `spatial-visualization`    | Translation of a semantic blueprint into a navigable 3D scene              | `plan-digitization` public contract     |
| `seismic-simulation`       | Educational excitation scenario, visual response, metrics, and chart       | `spatial-visualization` public contract |
| `workspace-administration` | Professional profile, local preferences, help content, and support tickets | None                                    |

`composition` is not a domain. It is the application shell's orchestration layer. It joins read models from Project Management and Plan Digitization for screens that require both, while keeping those bounded contexts mutually unaware.

`shared` contains technical UI and HTTP primitives only. `kernel` is the explicit shared domain kernel for resource identity, revision timestamps, validation helpers, repository ports, and CRUD application orchestration. Each context owns its fields and invariants; resource types are not interchangeable domain models.

## Internal structure

Contexts that own business state use this layout:

```text
bounded-contexts/<context>/
├── domain/          # Aggregates, entities, value objects, domain rules
├── application/     # Use cases and dependency-inversion ports
├── infrastructure/  # HTTP/browser adapters when needed
├── presentation/    # Context-owned screens, components, and hooks
├── public.ts        # Instantiated application API
└── index.ts         # Public type/module exports
```

## Dependency rules

1. Domain code imports no infrastructure or presentation code.
2. Application code depends on its own domain and ports.
3. Infrastructure implements ports owned by its context.
4. A bounded context must not import another context's internal paths. Cross-context access uses its `index.ts`, `public.ts`, or explicitly exported `presentation.ts` contract.
5. Cross-context result composition belongs under `src/composition`.
6. Next.js page files select context screens. Server routes and domain validation live in `teluria-backend`.

## Current integration boundary

Management uses `/api/v1/projects` and project-scoped REST resources. The frontend keeps transport adapters and DTO mappers; `next.config.ts` forwards API requests to the independent backend via `TELURIA_API_URL`. The backend owns authorization, transactions, audit and PostgreSQL persistence. No Next.js API Route Handlers or SQLite writable store remain in the frontend.

`data/workspace-db.json` and `.data/ark.sqlite` are legacy migration sources, not live databases. Project DTOs map snake_case fields into legacy camelCase design consumers through an explicit anti-corruption mapper.

The existing `public/db.json` remains the seed for independent design and administration adapters:

- `JsonBlueprintRepository` in Plan Digitization reads the semantic plan.
- `JsonWorkspaceAdministrationRepository` reads profile, preferences, and support seeds, then overlays editable state through browser storage.

`WorkspaceProvider` joins management read models and refreshes them after successful mutations. Screens are lazy-loaded, route failures have a retry boundary, and skeletons preserve the layout without moving the page. Forms provide explicit save/cancel, validation feedback, keyboard focus management, and a second confirmation for deletes. Kanban status selectors are the keyboard/touch alternative to dragging.

Translations for this stage live in `public/i18n/workspace/{es,en,pt}.json` and are fetched by the HTTP translation repository. User-entered content is never automatically translated. `workspace.css` uses shared light/dark design tokens and responsive layouts.

Stage 2 translations are loaded from `public/i18n/collaboration/{es,en,pt}.json` through the existing HTTP translation repository. See `stage-two.md` for permissions and limits. Before a public SaaS launch, add verified email/recovery, backups, observability and object storage; the deployment guide in `teluria-backend/docs/deployment.md` covers Render and Supabase.
