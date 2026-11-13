# LifeOps Design System v1

**Product positioning:** A connected household operations workspace.

**Competitive reference points:** ServiceNow for structured work and governance; Slack for approachable collaboration and fast interaction. LifeOps should not imitate either product's interface. It should combine operational rigor with a lighter, more personal interaction model.

## 1. Product promise

LifeOps connects the work that keeps a household running:

- Incidents and their resolution history
- Tasks, ownership, dependencies and recurrence
- Service catalogue, approvals and fulfillment
- Assets and preventive maintenance
- Knowledge and protected household information

The product experience should make three things obvious:
1. What needs attention?
2. Who owns the next action?
3. What happened, and what happens next?

## 2. Brand relationship

LifeOps shares the wider Maity visual family: warm neutrals, charcoal, sage and restrained tomato-red signals. The portfolio is expressive and editorial; LifeOps is structured, calm and operational.

| Attribute | Portfolio | LifeOps |
|---|---|---|
| Personality | Editorial, expressive | Confident, clear, dependable |
| Layout | Asymmetric, spacious | Grid-based, task-oriented |
| Typography | Display-led | UI-led, highly legible |
| Colour | Cream, charcoal, sage, tomato | Neutral surfaces, sage actions, semantic status colours |
| Motion | Expressive | Functional and restrained |
| Primary goal | Communicate identity | Complete work accurately |

## 3. Design tokens

The implementation lives in `frontend/src/index.css`.

### Surfaces
- `--bg`: application canvas
- `--surface`: cards, menus and primary panels
- `--surface-2`: inputs, nested panels and hover surfaces
- `--surface-3`: elevated or selected surface
- `--line`: dividers and borders

### Brand
- `--accent`: sage action colour
- `--accent-hover`: hover state
- `--accent-fg`: foreground on accent surfaces
- `--sage-soft`: low-emphasis selection surface

### Semantic status
- `--success`: completed / healthy
- `--warning`: due soon / waiting / attention
- `--danger`: critical / failed / destructive
- `--info`: informational / neutral workflow state

Do not use the brand accent as a substitute for priority or state. Status must remain semantic and consistent.

### Shape and motion
- Small radius: 6px
- Standard control radius: 9px
- Card radius: 13px
- Large surface radius: 18px
- Fast interaction: 120ms
- Standard transition: 180ms
- Larger surface transition: 260ms

Avoid pill-shaped everything, excessive shadows, and decorative glass effects. Use elevation to communicate hierarchy, not decoration.

## 4. Typography

- UI: Inter/system sans stack
- Record IDs, timestamps and compact metadata: JetBrains Mono/system monospace
- Page title: 24–30px, semibold
- Section title: 14–16px, semibold
- Body: 13–14px, regular
- Metadata: 11–12px
- Dense table content: 12–13px

Use sentence case. Avoid all-caps labels except compact metadata and record identifiers.

## 5. Navigation and information architecture

Keep the existing domain navigation:
- Overview
- My Work
- Incidents
- Service Catalog
- Requests
- Tasks
- Assets
- Maintenance
- Knowledge Base
- Activity (when implemented)
- Administration

Recommended hierarchy:
- **Workspace:** Overview, My Work
- **Work management:** Incidents, Requests, Tasks
- **Household operations:** Assets, Maintenance, Knowledge Base
- **Governance:** Activity, Administration

Do not hide core workflows behind a Slack-style channel list. Navigation should remain predictable and domain-based.

## 6. Core interaction patterns

### Record list
- Search and filters stay visible near the list.
- Filters should be shareable through URL query parameters.
- Dense desktop table; responsive card/list presentation on narrow screens.
- Bulk actions appear only after selection.
- Empty, loading and error states must be explicit.

### Record detail
- Primary record information first.
- Current state, priority and owner visible without scrolling.
- Activity history and comments in chronological order.
- Available transitions must reflect backend workflow rules.
- Destructive actions require clear confirmation.

### Collaboration
- Comments and work notes are contextual to a record.
- Notifications should deep-link to the affected record.
- Activity history is the audit source of truth; do not confuse chat messages with immutable audit events.
- If household-wide messaging is added, keep it distinct from work notes and record comments.

### Command/search
- Ctrl/Cmd+K should eventually search records and navigate.
- Search results should be grouped by record type and show status, owner and identifier.
- Quick create should expose only the user's permitted actions.

## 7. Product experience principles

1. **Action clarity:** each screen should make the next useful action obvious.
2. **Operational continuity:** a request should connect to its approval, fulfillment tasks and completion confirmation.
3. **Traceability:** meaningful changes should retain actor, timestamp and before/after context.
4. **Low cognitive load:** progressive disclosure for advanced configuration.
5. **Household-aware permissions:** personal and shared records must be clearly distinguished.
6. **Responsive by design:** core actions must work on phones, not merely fit on them.
7. **Accessible states:** never communicate priority or state by colour alone.

## 8. Competitive strategy

### Learn from ServiceNow
- Explicit lifecycle and state transitions
- Configurable service catalogue and approvals
- Asset relationships and maintenance
- Auditability and ownership

### Learn from Slack
- Fast navigation and command search
- Notifications that lead directly to context
- Lightweight collaboration
- Clear presence and ownership cues

### LifeOps differentiation
- Household context rather than enterprise departments
- One connected model for incidents, tasks, requests, assets and maintenance
- Fewer administrative layers
- A smaller, understandable workflow surface
- Self-hostable, privacy-conscious architecture

Do not claim feature parity with ServiceNow or Slack. Current implementation should be described accurately; collaboration, global record search and live activity should be treated as capabilities to validate or build, not assumed complete.

## 9. Delivery sequence

### Foundation (this release)
- Apply brand and semantic tokens
- Preserve existing light/dark preference mechanism
- Establish typography, surfaces, shape and focus standards

### Experience consistency
- Update shared controls and cards
- Normalize list, detail, modal and empty-state patterns
- Improve mobile navigation and record layouts

### Collaboration and intelligence
- Verify and complete notification feed
- Implement global record search
- Deliver activity stream and contextual comments
- Add presence/household collaboration only where it improves real workflows

## 10. Non-goals for v1

- Rebuilding the backend
- Replacing existing incident/task/request workflows
- Adding a general-purpose Slack clone
- Adding decorative dashboards that do not support a decision
- Claiming enterprise-grade feature parity without validation
