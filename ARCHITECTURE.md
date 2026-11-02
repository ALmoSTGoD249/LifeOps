# LifeOps Architecture

Tagline: Our Dreams. Our life. Under control.

## 1. Existing project check
Greenfield. No prior code, infrastructure or components. Docker is not available in the build sandbox, so Compose files are syntax-reviewed but not run here; backend is verified by tests and an Alembic upgrade/downgrade round trip.

## 2. Architecture
Browser -> Nginx (only published port) -> FastAPI (modular monolith) -> PostgreSQL. Uploads on a named volume.
Backend modules (one router + service per domain): auth, users, incidents, tasks, catalog, requests, assets, maintenance, knowledge, notifications, search, dashboard, activity, admin.
Real-time: Server-Sent Events for the notification bell and live activity feed only (one-way, proxy-friendly, no extra infrastructure). Everything else is request/response with TanStack Query refetching.
Deviation from brief: Nginx serves the built frontend static files directly instead of a separate frontend container (one less moving part; same result).

## 3. Key decisions (ADR summary)
- Sessions, not JWT: server-side session rows (hashed token in HttpOnly SameSite=Lax cookie) so logout, password change and user switching revoke instantly. CSRF via per-session token in X-CSRF-Token header on all mutating calls.
- User switching = authenticate as the other user (new session replaces the current one).
- Passwords: Argon2id. Login throttled in-app (5 per 5 min per IP+email) and in Nginx.
- Human numbers (INC/REQ/RITM/SCTASK/TASK/AST/KB) come from `record_sequences`, row-locked on increment; UUIDs remain the primary keys.
- Audit: append-only `activity_logs` written in the same transaction as the change, with a field-level from/to diff. History is never rebuilt from updated_at.
- JSONB only for catalog form definitions/responses and widget visibility preferences.
- Priority = lookup in an admin-editable impact x urgency matrix table (not hardcoded).
- Knowledge Base secrets (Wi-Fi passwords, etc.) are a field-level `is_sensitive` flag, encrypted at rest with a key derived from SECRET_KEY, and revealed only on explicit request (audited).

## 4. Schema (Phase 1 built; the rest designed)
Built and migrated (0001): roles, users, households, household_members, user_preferences, sessions, record_sequences, activity_logs.

Designed for later phases:
- Incidents: incidents (fk assigned_to, reported_by, asset_id, category_id), incident_comments (kind: comment|work_note), priority_matrix (impact, urgency -> priority).
- Catalog/Requests: catalog_categories, catalog_items (approval_required, default_assignee_id, fulfillment template), catalog_form_fields (type, required, options, sort), fulfillment_templates -> template_tasks, requests (REQ), requested_items (RITM, request_id FK, item_id FK, form_data JSONB), service_tasks (SCTASK, ritm_id FK), approvals (record_type, record_id, approver_id, state).
- Tasks: tasks (parent_type/parent_id polymorphic link plus nullable typed FKs incident_id, ritm_id, maintenance_record_id for referential integrity), task_checklists, task_dependencies (task_id, depends_on_id), recurrence rule columns.
- Assets: assets, asset_categories. Maintenance: maintenance_schedules (frequency, interval, next_due, asset_id, assignee, checklist template), maintenance_records.
- Knowledge: knowledge_articles, knowledge_categories, article_tags.
- Cross-cutting: attachments (record_type/record_id, stored_name, sha256, mime, size), notifications (user_id, kind, record ref, read_at).
All FKs indexed; ON DELETE CASCADE for owned children, RESTRICT for shared references (users, assets).

## 5. API structure (all under /api, OpenAPI at /api/docs)
/auth (login, logout, me, change-password) | /users (+ /me, /me/preferences) | /incidents (+ /{id}/comments, /transition, /bulk) | /catalog/categories, /catalog/items | /requests, /ritms, /sctasks | /tasks | /assets | /maintenance/schedules, /records | /kb/articles | /notifications (+ /stream SSE) | /search?q= | /dashboard/* (aggregates from live queries) | /activity?record_type=&record_id= | /admin (priority matrix, catalog builder, roles)

## 6. UI and design system
Dark-first, tokens as CSS variables: graphite surfaces (#16171A / #1D1F23 / #26282D), off-white text (#E9E7E2), 1px low-contrast borders, single accent (electric periwinkle #7C9CFF). Inter for UI, JetBrains Mono for record numbers. Glass blur only on the command palette and top bar. Radius 8px, not pill-everything. Priority/state shown with small dot + label, not loud colored chips. Cmd/Ctrl-K palette doubles as global search and quick-create. Collapsible sidebar with the 11 required sections; list views are dense tables with saved filters; detail pages are two-column (record + sticky activity stream).

## 7. Risks
1. Dynamic catalog forms: validate submissions server-side against the field definitions, never trust the client schema.
2. Numbering races: handled by row lock; covered by tests.
3. File uploads: extension+magic-byte allowlist, size cap, random stored names, served via authenticated endpoint with attachment disposition.
4. Scope: five phases are a lot; each phase ends with tests green and docs updated.
5. Secrets: KB sensitive fields; key rotation requires re-encryption (documented when built).
6. Plain-HTTP LAN use requires COOKIE_SECURE=false; prefer TLS via your existing reverse proxy/VPN.

## 8. Phases
1 Foundation (this drop: backend, auth, audit, infra; frontend shell next) | 2 Core ITSM | 3 Household ops | 4 Intelligence/experience | 5 Production hardening.
