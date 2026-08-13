# Teluria frontend architecture

Teluria uses explicit bounded contexts. Clean Architecture layers live **inside** each context instead of being global application folders.

## Context map

| Bounded context | Responsibility | Upstream dependency |
| --- | --- | --- |
| `project-management` | Project portfolio, creation, metadata, and lifecycle | None |
| `plan-digitization` | Semantic blueprint, rooms, walls, openings, columns, and 2D correction | None |
| `spatial-visualization` | Translation of a semantic blueprint into a navigable 3D scene | `plan-digitization` public contract |
| `seismic-simulation` | Educational excitation scenario, visual response, metrics, and chart | `spatial-visualization` public contract |
| `workspace-administration` | Professional profile, local preferences, help content, and support tickets | None |

`composition` is not a domain. It is the application shell's orchestration layer. It joins read models from Project Management and Plan Digitization for screens that require both, while keeping those bounded contexts mutually unaware.

`shared` contains technical UI primitives only. Domain concepts must not be placed there.

## Internal structure

Contexts that own business state use this layout:

```text
bounded-contexts/<context>/
├── domain/          # Aggregates, entities, value objects, domain rules
├── application/     # Use cases and dependency-inversion ports
├── infrastructure/  # JSON/HTTP/browser adapters
├── presentation/    # Context-owned screens, components, and hooks
├── public.ts        # Instantiated application API
└── index.ts         # Public type/module exports
```

## Dependency rules

1. Domain code imports no infrastructure or presentation code.
2. Application code depends on its own domain and ports.
3. Infrastructure implements ports owned by its context.
4. A bounded context must not import another context's internal paths. Cross-context access uses its `index.ts` or `public.ts` contract.
5. Cross-context result composition belongs under `src/composition`.
6. Next.js route files are delivery adapters and only select a context screen.

## Current integration boundary

`public/db.json` is a local prototype data source. It is accessed by two independent adapters:

- `JsonProjectRepository` in Project Management reads project records.
- `JsonBlueprintRepository` in Plan Digitization reads the semantic plan.
- `JsonWorkspaceAdministrationRepository` reads profile, preferences, and support seeds, then overlays editable state through browser storage.

When FastAPI is introduced, each adapter can be replaced independently without changing its domain or use cases.
