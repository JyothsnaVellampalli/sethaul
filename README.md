# SetuHaul — AI-Powered Freight Operations Platform

An end-to-end freight dock scheduling and driver assistance system built on **AWS Bedrock AgentCore**. Drivers report en-route issues through a conversational AI agent; operations staff manage shipments, approve ETA changes, and allocate dock slots through an admin dashboard with AI-powered suggestions.

---

## Live Deployment

| Service | URL | Platform |
|---------|-----|----------|
| Frontend (React SPA) | [sethaul.vercel.app](https://sethaul.vercel.app) | Vercel |
| Backend API (FastAPI) | Vercel Serverless Functions | Vercel |
| AI Agent Runtime | AWS Bedrock AgentCore | AWS |
| Database | Supabase (PostgreSQL) | Supabase Cloud |

Both frontend and backend are deployed on **Vercel** for low-latency, zero-config deployments with automatic HTTPS and global CDN.

---

## What It Does

**For Drivers:**
- Chat with an AI agent to report delays, breakdowns, traffic issues, or ETA changes
- Agent extracts structured incident data automatically — no forms to fill
- View shipment status, approved ETAs, and appointment slots in real-time
- Resume conversations across sessions with full message history

**For Operations:**
- **Dock Planner** — visual calendar showing dock occupancy by hour, day, week, or month
- Dashboard showing all shipments, statuses, and driver-reported exceptions
- AI-scored slot suggestions ranked by time proximity, priority, and dock compatibility
- Calendar view for slot assignment with multi-slot selection (1-3 consecutive)
- One-click ETA override with full audit trail
- Status management with automatic facility check-in tracking
- Full shipment detail popup with ETA change history and attribution

---

## Architecture

```
                    Vercel                              Vercel Serverless
               ┌────────────────┐            ┌──────────────────────────────┐
               │   React SPA    │───HTTPS───▶│   FastAPI (api/index.py)     │
               │   Vite + TS    │            │   @vercel/python runtime     │
               │                │            │                              │
               │  /             │            │   ┌────────────────────────┐ │
               │  /admin        │            │   │  server.py (routes)    │ │
               │  /admin/...    │            │   │  db.py (Supabase ORM)  │ │
               └────────────────┘            │   │  agent_invoker.py      │ │
                                             │   └──────────┬─────────────┘ │
                                             └──────────────│───────────────┘
                                                            │
                              ┌──────────────────────────────┼────────────────┐
                              │                              ▼                │
                              │         AWS Bedrock AgentCore Runtime         │
                              │     ┌──────────────────────────────────┐     │
                              │     │  handler.py (Strands Agent)       │     │
                              │     │  + tools.py (record_issue)        │     │
                              │     │  + memory.py (STM)                │     │
                              │     │  + config.py (centralized)        │     │
                              │     └──────────────────┬───────────────┘     │
                              │                        │                      │
                              └────────────────────────│──────────────────────┘
                                                       │
                                                       ▼
                                                ┌─────────────┐
                                                │  Supabase   │
                                                │  (Postgres) │
                                                └─────────────┘
```

---

## Key Features

### Dock Planner (Operations Planning View)

The first tab an admin sees on entering the dashboard — a visual planning tool to understand dock traffic at a glance.

- **Day view** — dock rows x 24 hour columns, color-coded cells (green=available, blue=occupied, red=blocked, grey=closed)
- **Week view** — compact 7-day view with mini occupancy bars per dock per day
- **Month view** — calendar grid with utilization percentages per day (click to drill into day view)
- **Filters** — toggle individual docks, filter by type (STANDARD/REEFER/HEAVY), show/hide shipment info
- **Summary strip** — total slots, occupied, available, blocked, utilization %
- **Slot popup** — click any cell to see dock details, appointment info, and full shipment context (driver name, customer, weight, priority, ETA)

### Agent (AWS Bedrock AgentCore)

- **Model:** Claude Sonnet 4 on Amazon Bedrock
- **Framework:** Strands Agents with `@tool` decorators
- **Memory:** Short-Term Memory (STM) via AgentCore MemorySessionManager
- **Tool:** `record_driver_issue` — extracts and persists driver exceptions to DB
- **Input Validation:** Pydantic models define explicit JSON Schema for tool inputs — enum constraints on `issue_type` and `severity`, typed fields, and descriptions passed via `@tool(inputSchema=Model.model_json_schema())`
- **Deployment:** Containerized on AgentCore Runtime with VPC networking
- **Invocation:** `invoke_agent_runtime` via boto3 from the FastAPI server

### Driver Chat

- Phone-number login (maps to driver record in DB)
- Shipment-scoped sessions — driver selects which shipment they're discussing
- Agent pre-loaded with driver's shipment context (origin, destination, ETA, dock type, priority)
- No ID questions — agent already knows driver_id, vehicle_id, shipment_id from authentication
- Today/tomorrow date resolution injected into context
- Full message history persisted in `chat_messages` table
- Collapsible side panel showing shipment status and ETA approval state

### Admin Dashboard

- **Dock Planner tab** (default) — visual dock occupancy calendar with day/week/month views
- **Exceptions tab** — driver-reported issues with severity, delay, declared ETA, and review actions
- **Shipments tab** — all shipments with inline status dropdown, ETA override, and clickable details
- **Shipment detail popup** — click any shipment ID to see origin/destination, product, driver/vehicle, appointment slot (time, dock, status), and full ETA update history with attribution (driver vs operations vs system)
- **Driver info popup** — click any driver name to see phone, carrier, licence, home city
- **Slot suggestions** — AI-scored available slots ranked by fitness (proximity to ETA, priority, weight headroom)
- **Calendar slot picker** — visual grid organized by dock and hour, multi-slot selection (1-3 consecutive)
- **ETA override modal** — reassign slots with reason (tracked as `OPERATIONS_OVERRIDE`)
- **Slot management** — generate weekly slots, block/unblock individual or bulk slots
- **Shipment creation** — form with cascading dropdowns and automatic appointment + ETA record creation
- **Lazy loading** — dock planner is code-split; dashboard data only loads when switching to those tabs

### Thread Status Lifecycle

```
OPEN → driver reported issue, waiting for operations
RESOLVED → operations approved ETA / assigned slot
CLOSED → shipment completed or cancelled
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend API | Python, FastAPI, Uvicorn |
| AI Agent | Strands Agents, Claude Sonnet 4, AWS Bedrock, Pydantic |
| Agent Runtime | AWS Bedrock AgentCore (HTTP protocol, STM memory) |
| Database | Supabase (PostgreSQL) |
| Deployment | Vercel (frontend + backend), AgentCore (agent) |

---

## Project Structure

```
Sethaul/
├── client/                      # React frontend (Vercel)
│   ├── src/
│   │   ├── components/          # ChatScreen, DockPlannerTab, SlotCalendarPicker,
│   │   │                        # ShipmentDetailPopup, DriverShipmentPanel, ...
│   │   ├── pages/               # AdminDashboard, AdminExceptionDetail,
│   │   │                        # AdminCreateShipment, AdminSlotManager
│   │   ├── services/            # api.ts, adminApi.ts, session.ts
│   │   ├── styles/              # index.css
│   │   └── types/               # chat.ts
│   ├── vercel.json              # SPA routing config
│   └── package.json
│
├── server/                      # FastAPI backend (Vercel Serverless)
│   ├── api/
│   │   └── index.py             # Vercel entry point (imports FastAPI app)
│   ├── server.py                # Main API server — all routes
│   ├── agent_invoker.py         # Invokes agent via AgentCore or HTTP
│   ├── db.py                    # Full Supabase operations layer
│   ├── generate_slots.py        # Weekly slot generation utility
│   ├── vercel.json              # Backend routing config
│   │
│   └── agentcore/               # Deployed to AWS AgentCore Runtime
│       ├── handler.py           # Agent entrypoint (Strands + BedrockAgentCoreApp)
│       ├── tools.py             # @tool: record_driver_issue
│       ├── memory.py            # STM load/persist helpers
│       ├── config.py            # Centralized config + logger
│       ├── db.py                # Minimal DB client (only what tools need)
│       ├── agent_deploy.py      # Deployment script
│       └── requirements.txt     # Agent dependencies
│
└── README.md
```

---

## Database Schema

18 tables covering the full freight operations lifecycle:

| Domain | Tables |
|--------|--------|
| Identity | `carriers`, `drivers`, `vehicles`, `vehicle_types` |
| Facilities | `facilities`, `docks`, `facility_contacts`, `facility_rules` |
| Shipments | `shipments`, `eta_updates` |
| Scheduling | `appointment_slots`, `appointments`, `dock_status_events` |
| Operations | `facility_checkins` |
| Conversations | `chat_threads`, `chat_messages`, `driver_exceptions`, `operational_messages` |

4 views: `v_latest_eta`, `v_slot_availability`, `v_inbound_operational_state`, `v_current_facility_queue`

### Recommended Indexes

```sql
-- Dock planner (fast date-range slot queries)
CREATE INDEX idx_appointment_slots_facility_start ON appointment_slots(facility_id, slot_start_ts);
CREATE INDEX idx_appointments_current_status ON appointments(is_current, appointment_status);
CREATE INDEX idx_appointments_slot_id ON appointments(slot_id);

-- Dashboard (shipments + exceptions filtering)
CREATE INDEX idx_shipments_latest_eta ON shipments(latest_eta_ts);
CREATE INDEX idx_shipments_facility_status ON shipments(destination_facility_id, current_status);
CREATE INDEX idx_driver_exceptions_status ON driver_exceptions(exception_status, reported_at DESC);

-- ETA history
CREATE INDEX idx_eta_updates_shipment ON eta_updates(shipment_id, created_at DESC);
```

---

## Vercel Deployment

Both the frontend and backend are deployed to Vercel as separate projects in the same repo.

### Frontend (`/client`)

```bash
cd client
vercel --prod
```

- **Framework:** Vite (auto-detected)
- **Build:** `npm run build` → outputs to `dist/`
- **Routing:** SPA fallback via `vercel.json` rewrites
- **Env vars:** `VITE_API_URL` pointing to the backend Vercel URL

### Backend (`/server`)

```bash
cd server
vercel --prod
```

- **Runtime:** `@vercel/python` serverless functions
- **Entry:** `api/index.py` imports the FastAPI `app` from `server.py`
- **Routing:** All requests routed to `api/index.py` via `vercel.json`
- **Env vars:** `SUPABASE_URL`, `SUPABASE_KEY`, `AGENT_ARN`, `AWS_REGION`, `MEMORY_ID`

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_API_URL` | Client (Vercel) | Backend API URL (e.g. `https://sethaul-api.vercel.app`) |
| `SUPABASE_URL` | Server (Vercel) | Supabase project URL |
| `SUPABASE_KEY` | Server (Vercel) | Supabase anon/service key |
| `AGENT_ARN` | Server (Vercel) | AgentCore runtime ARN |
| `AWS_REGION` | Server (Vercel) | AWS region for Bedrock |
| `MEMORY_ID` | Server (Vercel) | AgentCore STM memory ID |
| `CORS_ORIGINS` | Server (Vercel) | Comma-separated allowed origins |

---

## Running Locally

```bash
# 1. Agent (port 8080) — optional, only needed for chat
cd server/agentcore
python handler.py

# 2. Backend API (port 8000)
cd server
python server.py

# 3. Frontend (port 5173)
cd client
npm install
npm run dev
```

Create a `.env` file in the project root:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
AWS_REGION=us-east-1
MEMORY_ID=your-memory-id
AGENT_ARN=arn:aws:bedrock-agentcore:us-east-1:123456:runtime/your-agent
```

And `client/.env`:
```env
VITE_API_URL=http://localhost:8000
```

---

## Agent Invocation Modes

The system supports two invocation modes controlled by a single env var:

```bash
# Production: AgentCore Runtime (set AGENT_ARN)
AGENT_ARN=arn:aws:bedrock-agentcore:us-east-1:123456:runtime/agent-id

# Local development: Direct HTTP (unset AGENT_ARN)
# Falls back to http://localhost:8080/invocations
```

No code changes needed to switch between modes.

---

## Tool Input Schema (Pydantic Validation)

Agent tools use **Pydantic v2 models** to define explicit input schemas that get passed to the LLM as JSON Schema. This gives the model structured constraints on what values are acceptable.

```python
# server/agentcore/tools.py

class RecordDriverIssueInput(BaseModel):
    shipment_id: str = Field(..., description="The shipment ID (e.g. SHP1014)")
    issue_type: Literal["DELAY", "BREAKDOWN", "TRAFFIC", "WEATHER",
                        "EARLY_ARRIVAL", "DOCK_UNAVAILABLE", "UNKNOWN"] = Field(...)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = Field(...)
    delay_minutes: int = Field(..., description="Minutes late vs original plan")
    constraints: Optional[str] = Field(None, description="Optional constraints")
    # ... other fields

@tool(inputSchema=RecordDriverIssueInput.model_json_schema())
def record_driver_issue(...) -> dict:
    ...
```

**What `model_json_schema()` does:** Converts the Pydantic model into a standard JSON Schema dict that the Strands `@tool` decorator sends to Claude as the tool specification. The LLM sees enum values, types, required fields, and descriptions — producing more accurate tool calls with fewer hallucinated values.

**Benefits over docstring-only inference:**
- `Literal` types become `enum` arrays — model only generates valid values
- `Optional[str]` with `None` default — model knows it can omit the field
- `int` type enforcement — model won't pass `"45"` as a string
- Field descriptions appear in the schema alongside type info

---

## Slot Suggestion Scoring

When an operations person reviews a driver exception, the system scores available slots (0-100):

| Factor | Impact |
|--------|--------|
| Time proximity to driver's ETA (< 15 min) | +30 |
| Time proximity (15-30 min) | +25 |
| Time proximity (30-60 min) | +15 |
| Slot starts before ETA | -20 |
| CRITICAL/HIGH priority shipment | +10 |
| Weight capacity headroom > 20% | +5 |
| Weight capacity tight < 5% | -10 |

Labels: `HIGHLY_RECOMMENDED` (80+), `RECOMMENDED` (60+), `ACCEPTABLE` (40+), `SUB_OPTIMAL` (20+), `NOT_RECOMMENDED` (<20)

---

## ETA Audit Trail

Every ETA change is recorded in `eta_updates` with source attribution:

| Source | When |
|--------|------|
| `ORIGINAL_PLAN` | Shipment created |
| `DRIVER_DECLARED` | Driver reports via chat agent |
| `OPERATIONS_OVERRIDE` | Operations person manually reassigns |
| `WAREHOUSE_ESTIMATE` | Warehouse provides updated estimate |

The admin can view the complete ETA timeline for any shipment by clicking on its ID in the dashboard — showing who changed it, when, the new ETA, delay reason, and notes.

---

## Performance Optimizations

- **Code splitting** — DockPlannerTab is lazy-loaded (only fetched when tab is active)
- **Deferred data loading** — exceptions/shipments data not fetched until user switches to those tabs
- **Single-query backend** — dock planner endpoint does 3 parallel queries + O(1) hashmap join (no N+1)
- **Filters cached** — loaded once and reused across tab switches
- **Memoized grid computations** — `useMemo` throughout to avoid unnecessary re-renders
- **Minimal payloads** — backend returns only fields needed for each view
