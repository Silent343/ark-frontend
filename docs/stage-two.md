# Stage 2 — coordination and delivery

## Navigation

Choose a project in the portfolio. Work modules are grouped into planning/team, documents/delivery, control/reporting, and design. At narrow widths a labeled module selector replaces the navigation groups.

A client entering a project's root sees their portal, not the internal dashboard. Forbidden direct URLs display a restricted state; forbidden REST requests independently return 403 or 404.

## Roles

| Capability                                 | Owner / architect                              | Collaborator                 | Client                                       |
| ------------------------------------------ | ---------------------------------------------- | ---------------------------- | -------------------------------------------- |
| Team and invitations                       | Manage                                         | View members                 | No                                           |
| Tasks, milestones, documents, issues, plan | Edit                                           | Edit, no destructive deletes | Shared documents and model only              |
| Budget, packages, calendar, dependencies   | Manage                                         | Read                         | Shared packages only                         |
| Reviews                                    | Create and assign; only assigned actor decides | Read                         | Decide own assigned reviews                  |
| Discussions                                | Add; moderate                                  | Add; delete own              | Add shared project/document/element comments |
| Notifications                              | Own inbox                                      | Own inbox                    | Own inbox                                    |
| Change log and reports                     | Read                                           | Read                         | No                                           |

The owner cannot be removed or demoted. Invitations expire after seven days, store only token hashes, and require a signed-in account matching the invited email. Links do not send email or publish projects.

## Collaboration workflow

1. Invite team members or clients from Team, then assign accepted members to tasks/reviews.
2. Add start/end dates and finish-to-start dependencies. Cycles and progression with incomplete predecessors are rejected transactionally.
3. Upload document versions; group explicit version IDs into stage delivery packages.
4. Share a package by moving it from draft to review. A client sees those versions plus files assigned directly to their reviews.
5. Review with the assigned account. The server records the actual author and decision timestamp, and updates that document version.
6. Inspect attributed changes, personal notifications, task delays, workload and supplier costs. Download a paginated PDF report.

## Persistence

PostgreSQL tables live in the private `teluria` schema. Relational columns and foreign keys connect users, projects and dependent resources; validated aggregate data resides in JSONB. Cross-context operations, audit and notifications commit in one transaction. Email and membership uniqueness have database indexes. The old SQLite file is only an import source.

Session/account data and project data are on disk, not browser storage. The shared blueprint preserves the legacy camelCase geometry contract behind its REST envelope. Administration and terrain settings remain local.

## Quality checks

Automated integration suites cover authentication, project isolation, role denials, invitation acceptance, cycles/blockers, calendar validation, client document visibility, assigned decisions, immutable authors, package invariants, notifications, audit, PDF parsing, revision conflicts and logout.

Remaining production work includes verified identity recovery, a transactional outbox if external asynchronous consumers are introduced, document object storage and resource-leveled scheduling. Do not describe this release as real-time co-editing or engineering analysis.
