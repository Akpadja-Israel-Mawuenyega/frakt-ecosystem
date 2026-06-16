# Frakt + Cadence Monorepo

A production-grade dual-application monorepo housing two interconnected systems:

- **Frakt Analytic Service** — A sandboxed SVG chart generation API with AI-powered forecasting, multi-tenant authentication, and immutable audit logging.
- **Cadence Study Planner** — An institutional academic scheduler with a genetic algorithm timetable engine, AI study session planning, and a Next.js frontend.

Cadence consumes Frakt as an internal microservice to render analytics charts. Together they form a full-stack platform covering sandboxed code execution, machine learning regression, NP-hard combinatorial optimization, and secure multi-tenant SaaS patterns.

---

## Table of Contents

1. [Repository Layout](#repository-layout)
2. [Frakt Analytic Service](#frakt-analytic-service)
   - [Architecture Overview](#architecture-overview)
   - [IPC Strategy: Unix Domain Sockets vs TCP](#ipc-strategy-unix-domain-sockets-vs-tcp)
   - [Database Layer](#database-layer)
   - [Authentication & Zero-Plaintext Key Storage](#authentication--zero-plaintext-key-storage)
   - [Rate Limiting & Tier Quotas](#rate-limiting--tier-quotas)
   - [API Reference](#api-reference)
   - [Pre-flight Charge & Optimistic Concurrency](#pre-flight-charge--optimistic-concurrency)
   - [SVG Rendering Pipeline](#svg-rendering-pipeline)
   - [Coordinate Mapping Algorithm](#coordinate-mapping-algorithm)
   - [AI Predictive Engine](#ai-predictive-engine)
   - [Sandbox: RestrictedPython & AST Rewriting](#sandbox-restrictedpython--ast-rewriting)
   - [Audit Logging](#audit-logging)
   - [Error Handling](#error-handling)
   - [Logging & Observability](#logging--observability)
3. [Cadence Study Planner](#cadence-study-planner)
   - [Architecture Overview](#cadence-architecture-overview)
   - [Database Models](#cadence-database-models)
   - [Genetic Algorithm Timetable Scheduler](#genetic-algorithm-timetable-scheduler)
   - [NP-Hard Scheduling: Problem Formulation](#np-hard-scheduling-problem-formulation)
   - [AI Study Planning](#ai-study-planning)
4. [Frakt ↔ Cadence Integration](#frakt--cadence-integration)
   - [Full Request Lifecycle](#full-request-lifecycle)
   - [Frakt Client Wrapper](#frakt-client-wrapper)
   - [Chart Templates](#chart-templates)
   - [Setup Script](#setup-script)
5. [Security Architecture](#security-architecture)
6. [Configuration & Environment Variables](#configuration--environment-variables)
7. [Docker & Deployment](#docker--deployment)
8. [Development Setup](#development-setup)

---

## Repository Layout

```
frakt_microservice/
├── frakt_analytic_service/          # Python FastAPI microservice
│   ├── main.py                      # Gateway entry point, lifespan, routing
│   ├── docker-compose.yml           # Gateway + Worker containers
│   ├── app/
│   │   ├── ai/
│   │   │   └── ai_engine.py         # PredictiveEngine (linear/poly/Bayesian)
│   │   ├── audit.py                 # log_event() — immutable audit trail
│   │   ├── configs/
│   │   │   ├── limiter_config.py    # SlowAPI tier-based rate limits
│   │   │   └── logging_config.py    # Rotating file + console logging
│   │   ├── database/
│   │   │   ├── models.py            # SQLAlchemy ORM models
│   │   │   └── session.py           # Engine + session factory
│   │   ├── middleware/
│   │   │   ├── error_handlers.py    # Global exception → HTTP code mapping
│   │   │   └── middleware.py        # API key auth, tier caching
│   │   ├── routers/
│   │   │   ├── generation_router.py # /v1/generate, /v1/generate-predictive
│   │   │   ├── template_router.py   # /v1/templates/* CRUD
│   │   │   ├── customer_router.py   # /v1/customers/* account management
│   │   │   └── utils.py             # SVG asset stamping, coordinate math
│   │   └── schemas/                 # Pydantic request/response models
│   ├── worker/
│   │   ├── worker.py                # Worker FastAPI service (UDS/TCP)
│   │   └── generator.py             # RestrictedPython sandbox executor
│   └── scripts/
│       └── setup_cadence_integration.py  # Provisions Cadence as a Frakt customer
│
└── cadence_study_planner/           # Next.js 16 full-stack app
    ├── app/                         # Next.js App Router pages + API routes
    ├── components/                  # React UI components
    ├── lib/
    │   ├── scheduler/
    │   │   └── geneticScheduler.js  # Genetic algorithm timetable engine
    │   ├── frakt/
    │   │   └── client.js            # Frakt API client wrapper
    │   ├── ai/
    │   │   └── index.js             # Groq-powered study session generator
    │   └── mongodb.js               # Mongoose connection utility
    ├── models/                      # Mongoose schemas
    │   ├── User.js
    │   ├── StudentProfile.js
    │   ├── Timetable.js
    │   ├── StudySession.js
    │   ├── CourseDemand.js
    │   └── AuditLog.js
    └── .env.example
```

---

## Frakt Analytic Service

### Architecture Overview

Frakt is a **two-tier microservice** split across a **Gateway** and a **Worker**. This separation is a deliberate security boundary: the Worker runs untrusted template code in a sandboxed subprocess, and the Gateway handles authentication, billing, and routing without ever executing user code directly.

```
Internet
   │  HTTPS (port 8000)
   ▼
┌──────────────────────────────────┐
│         Gateway (FastAPI)        │
│  - CORS, rate limiting           │
│  - API key auth (SHA-256 hash)   │
│  - Pre-flight quota charge       │
│  - AI forecasting (in-process)   │
│  - SVG asset stamping            │
└────────────┬─────────────────────┘
             │  RPC over UDS or TCP
             ▼
┌──────────────────────────────────┐
│         Worker (FastAPI)         │
│  - Receives template_code +      │
│    params from Gateway           │
│  - Spawns OS subprocess          │
│  - RestrictedPython sandbox      │
│  - Returns SVG string            │
└──────────────────────────────────┘
```

The Gateway is the only process with database credentials. The Worker knows nothing about customers, quotas, or keys — it receives a blob of template code and parameters, executes them inside a restricted environment, and returns a string.

### IPC Strategy: Unix Domain Sockets vs TCP

The Gateway and Worker communicate over a shared IPC channel whose transport adapts to the runtime environment:

| Environment       | Transport                          | Why                                                       |
|-------------------|------------------------------------|-----------------------------------------------------------|
| Linux / Docker    | Unix Domain Socket (`/tmp/sockets/worker.sock`) | Lower latency than TCP, no network stack overhead, kernel-enforced file permissions |
| Windows (dev)     | TCP loopback (`127.0.0.1:8008`)    | Python's `asyncio` on Windows does not implement UDS (`NotImplementedError`) |

On Linux, both containers share a `tmpfs` volume mounted at `/tmp/sockets`. The socket file appears in the Worker container's filesystem but is owned by the Gateway process (uid 1001), and the Worker (uid 1002) is in the same group. This means no external process can connect to the Worker socket even if it somehow reaches the host.

Gateway uses `httpx.AsyncClient` with the transport set at startup:

```python
# Linux path
transport = httpx.AsyncHTTPTransport(uds="/tmp/sockets/worker.sock")
client = httpx.AsyncClient(transport=transport, base_url="http://worker")

# Windows path
client = httpx.AsyncClient(base_url="http://127.0.0.1:8008")
```

The correct transport is selected via `sys.platform` check during the lifespan context manager, so no environment variable is required for basic usage.

### Database Layer

Frakt uses **MySQL** (InnoDB) with **SQLAlchemy 2.0** ORM. The connection pool is configured for production workloads:

- `pool_size = 10` (persistent connections)
- `max_overflow = 20` (burst headroom)
- `pool_pre_ping = True` (recycles stale connections after MySQL's `wait_timeout`)

**Models:**

#### `Customer`

```
id              UUID (string, MySQL-compatible)   PK
hashed_api_key  VARCHAR(64)                       SHA-256 hex, UNIQUE, NOT NULL
tier            ENUM(free, pro, enterprise)       DEFAULT free
usage_count     INTEGER                           Atomic counter, DEFAULT 0
quota           INTEGER                           Set per tier on registration
is_active       BOOLEAN                           Soft-delete flag
created_at      DATETIME                          Auto-set
```

Relationships: `logs` (one-to-many `AuditLog`), `templates` (one-to-many `SVGTemplate`).

The UUID primary key is stored as a `VARCHAR(36)` rather than a native `BINARY(16)` to avoid byte-ordering issues across MySQL versions. `uuid4()` is called in Python, not delegated to the DB, so the Gateway always knows the `id` before the INSERT commits.

#### `SVGTemplate`

```
id              UUID (string)     PK
owner_id        UUID              FK → Customer.id, NOT NULL
template_name   VARCHAR(128)      NOT NULL
template_code   TEXT              RestrictedPython source
required_params JSON              Parameter schema
created_at      DATETIME
updated_at      DATETIME          Auto-updated on PATCH
```

A **unique constraint on `(owner_id, template_name)`** enforces per-customer namespace isolation. Two different customers can each have a template named `"line_chart"` without conflict.

#### `AuditLog`

```
id          UUID        PK
customer_id UUID        FK → Customer.id (nullable — pre-auth events)
action      VARCHAR     e.g. "SVG_RENDER_SUCCESS"
severity    ENUM        INFO | WARNING | ERROR | CRITICAL
endpoint    VARCHAR     e.g. "/v1/generate"
status_code INTEGER     HTTP response code
ip_address  VARCHAR     Requestor IP (X-Forwarded-For aware)
user_agent  TEXT        Raw User-Agent string
created_at  DATETIME    Immutable timestamp
```

`AuditLog` rows are never updated or deleted. The schema has no `updated_at` column, making immutability self-documenting.

### Authentication & Zero-Plaintext Key Storage

Frakt uses a single shared-secret scheme: a per-customer **API key** passed via the `x-api-key` request header.

**Key format:** `frakt_live_<43-character-urlsafe-base64-token>`

The prefix `frakt_live_` provides an unambiguous signal to secret-scanning tools (GitHub's secret scanning, truffleHog, etc.) that a leaked string is a Frakt production key.

**Storage:** Only `SHA-256(raw_key)` is persisted in the `customers.hashed_api_key` column. The raw key is returned **once** at registration or rotation and is never recoverable from the database. This is identical to how GitHub personal access tokens and Stripe secret keys work.

**Validation flow:**

```
Request arrives with x-api-key: frakt_live_abc...
        │
        ▼
SHA-256(key) → hash string
        │
        ▼
SELECT * FROM customers WHERE hashed_api_key = ? AND is_active = true
        │
    ┌───┴────────┐
  found        not found
    │               │
inject Customer    401 Unauthorized
into request
```

**Tier caching:** After a successful lookup, the `(hash → tier)` mapping is cached in an in-process dict with a **60-second TTL**. This prevents a DB round-trip on every request for high-frequency callers while keeping tier changes (e.g., an upgrade to Pro) visible within one minute.

### Rate Limiting & Tier Quotas

Rate limiting uses **SlowAPI** (a Starlette wrapper around `limits`). Requests are bucketed by the SHA-256 hash of the API key, so even if two customers share the same IP (e.g., behind a corporate NAT), their limits are isolated.

| Tier       | Per-Minute Limit | Monthly Quota |
|------------|-----------------|---------------|
| Free       | 5 req/min       | 100           |
| Pro        | 50 req/min      | 5,000         |
| Enterprise | 200 req/min     | 100,000       |

**Per-minute limiting** is enforced by SlowAPI as HTTP middleware and returns `429 Too Many Requests` with a `Retry-After` header.

**Monthly quota** is enforced by the pre-flight charge inside the generation endpoints (described below). These are two independent mechanisms: a burst spike hits the per-minute limit first; a sustained high-volume caller runs into the monthly quota second.

### API Reference

All endpoints are under the `/v1` prefix. All endpoints except `/v1/customers/register` require `x-api-key`.

#### Generation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/generate` | Render SVG from a stored template (1 credit) |
| `POST` | `/v1/generate-predictive` | Render SVG with AI forecast overlay (2 credits) |

**POST /v1/generate — request body:**
```json
{
  "template_name": "cadence_line_forecast_v1",
  "params": {
    "data_points": [12, 34, 55, 70, 68],
    "x_labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "title": "Study Hours"
  }
}
```

**POST /v1/generate-predictive — request body:**
```json
{
  "template_name": "cadence_line_forecast_v1",
  "params": { ... },
  "ai_method": "auto"
}
```

`ai_method` values: `"none"` | `"auto"` | `"linear"` | `"polynomial"` | `"seasonal"`

**Response headers on predictive:**
```
X-AI-Model:       polynomial
X-AI-Confidence:  0.87
X-AI-Is-Growth:   true
X-Usage-Charged:  2
Content-Type:     image/svg+xml
Cache-Control:    no-cache, no-store
```

#### Templates

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/templates/` | Create a new SVG template |
| `GET` | `/v1/templates/` | List all templates for the authenticated customer |
| `GET` | `/v1/templates/{id}` | Retrieve a single template |
| `PATCH` | `/v1/templates/{id}` | Partial update (nullable fields) |
| `DELETE` | `/v1/templates/{id}` | Soft-delete with WARNING audit log |

#### Customers

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/customers/register` | Create account, receive raw API key (one-time) |
| `GET` | `/v1/customers/me` | Usage telemetry (count, quota, tier) |
| `POST` | `/v1/customers/rotate-key` | Invalidate current key, receive new one |
| `DELETE` | `/v1/customers/me` | Soft-delete account, revoke all access |

### Pre-flight Charge & Optimistic Concurrency

The billing logic is the most nuanced part of the generation endpoints. The core challenge is: how do you atomically charge a credit and enforce a quota without holding a database lock across a network call to the Worker (which may take up to 2 seconds)?

**The pattern used is a conditional UPDATE with row-count inspection:**

```sql
UPDATE customers
SET usage_count = usage_count + 1
WHERE id = :customer_id
  AND usage_count < quota
```

If `rowcount == 0`, the customer's `usage_count` was already at or above `quota`, and the request is rejected with `402 Payment Required`. If `rowcount == 1`, the charge succeeded atomically — no separate SELECT is needed.

**Why commit before calling the Worker:**

The charge is committed to the database *before* the RPC to the Worker is sent. This is counterintuitive but correct:

- If the charge were committed *after* a successful Worker response, an attacker could abort the connection at exactly the right moment (after Worker responds but before the Gateway commits) to get free renders.
- With the charge committed first, a Worker failure triggers a **refund** (a compensating `usage_count -= 1` UPDATE) and logs a CRITICAL audit event.

This is an application-level implementation of the **saga pattern**: charge is the forward action, refund is the compensating transaction.

**Predictive endpoint charges 2 credits** and runs the AI engine *before* the charge. The AI computation is the most expensive part, so validating and running it first avoids charging a customer for a malformed request.

### SVG Rendering Pipeline

After the Worker executes a template and returns a raw SVG string, the Gateway **stamps additional assets** onto it before returning the response. This keeps template code minimal — a template only draws the chart's core geometry; the Gateway handles axes, labels, and forecast boundaries.

**`append_svg_assets()` pipeline:**

1. Parse the SVG string to extract `viewBox` dimensions.
2. **Y-axis scale** — inject right-aligned text labels at 0, 100, 200, 300 (or configured steps).
3. **Data point circles** — for each `(x, y)` coordinate pair, append a `<circle>` with a `<title>` tooltip.
4. **X-axis labels** — append `<text>` elements centered below each data point column.
5. **Forecast boundary** — a vertical dashed `<line>` with a "Forecast →" label at the boundary between historical and predicted data.
6. Replace the closing `</svg>` tag with all accumulated asset groups, then close.

The viewBox is never modified — asset coordinates are calculated to fit within the existing canvas.

### Coordinate Mapping Algorithm

All pixel math lives in `app/routers/utils.py`. The Y-axis uses a **fixed 0–300 domain** regardless of the actual data range. This is intentional: it makes charts from different time periods directly visually comparable without the perceptual distortion of auto-scaling axes.

```python
# Y-axis: fixed domain, linear mapping with top/bottom padding
CANVAS_HEIGHT = 300   # px (from template viewBox)
Y_MIN = 0
Y_MAX = 300
Y_RANGE = 300
PADDING = 20          # px from top and bottom edges

def map_y_to_pixel(value):
    usable_height = CANVAS_HEIGHT - (2 * PADDING)
    relative_pos = (value - Y_MIN) / Y_RANGE
    return CANVAS_HEIGHT - (PADDING + relative_pos * usable_height)
    # value=0   → pixel 280  (near bottom)
    # value=150 → pixel 150  (center)
    # value=300 → pixel 20   (near top)
```

```python
# X-axis: evenly spaced across the draw width
CANVAS_WIDTH = 800    # px
MARGIN_LEFT  = 50     # px  (space for Y-axis labels)
MARGIN_RIGHT = 20     # px
DRAW_WIDTH   = CANVAS_WIDTH - MARGIN_LEFT - MARGIN_RIGHT  # 730 px

def map_x_to_pixel(index, total_points):
    if total_points == 1:
        return MARGIN_LEFT
    x_step = DRAW_WIDTH / (total_points - 1)
    return MARGIN_LEFT + (index * x_step)
```

The Y-axis labels generated by `calculate_clean_scale()` always use the fixed steps `[0, 100, 200, 300]`. Templates that render values in different units (dollars, percentages, study-hours) are expected to apply their own scaling before writing `svg_output` — the Gateway's coordinate system is unit-agnostic.

### AI Predictive Engine

The `PredictiveEngine` class (`app/ai/ai_engine.py`) extends historical data with a short forecast using scikit-learn supervised models. It runs **in-process in the Gateway** (not in the sandbox), so it has full access to NumPy and scikit-learn.

**Input formats accepted:**

```python
[12, 34, 55, 70, 68]               # Sequential y-values; x inferred as 0,1,2,...
[[0,12], [1,34], [2,55], ...]       # Explicit (x, y) coordinate pairs
```

Input is validated to have between 5 and 500 data points. Constant data (zero variance) is rejected early — fitting a model on flat data produces division-by-zero or degenerate results.

**Model auto-selection heuristic:**

```
n_points < 8
    → "linear" (Ridge)
        Reason: polynomial features on tiny datasets overfit catastrophically.
        Ridge regression's regularization is sufficient.

std(data) < 0.05 * mean(data)   [i.e., coefficient of variation < 5%]
    → "seasonal" (Bayesian Ridge)
        Reason: very smooth data → small prediction intervals → Bayesian
        uncertainty estimates are meaningful rather than noise-dominated.

otherwise
    → "polynomial" (degree-2 Pipeline)
        Reason: captures acceleration and momentum common in study/usage data.
```

**Recency weighting:**

All models are fit with `sample_weight` to emphasize recent observations:

```python
n = len(y)
weights = np.exp(0.1 * np.arange(n))
weights /= weights.max()
# weights[0]   ≈ 0.37  (oldest point, 1/e weighting)
# weights[-1]  = 1.00  (most recent point, full weight)
```

The `0.1` decay constant means a data point from ~10 periods ago has roughly `e^{-1} ≈ 37%` the influence of the most recent point. This makes the forecast react quickly to recent trend changes without being destabilized by short-term noise.

**Guardrails on predicted values:**

```python
floor   = 0.0                        # No negative predictions
ceiling = max(historical) * 1.5      # Hard growth cap
predicted = np.clip(raw, floor, ceiling)
predicted = np.round(predicted, 2)
```

The growth cap prevents the polynomial model from predicting exponential runaway on short, steeply-rising input sequences.

**Forecast horizon:** Fixed at 3 steps. The caller receives the full extended data series (historical + 3 predicted) and the index at which the forecast begins. The Gateway uses this boundary index to place the vertical forecast divider line.

**Confidence score (Bayesian model only):**

```python
# BayesianRidge.predict() returns (mean, std) when return_std=True
mean_pred, std_pred = model.predict(x_future, return_std=True)
confidence = float(1.0 / (1.0 + np.mean(std_pred)))
# std ≈ 0   → confidence ≈ 1.0
# std ≈ 10  → confidence ≈ 0.09
```

For linear and polynomial models, confidence is computed post-hoc from the R² score of the training fit.

### Sandbox: RestrictedPython & AST Rewriting

Template code is **user-authored Python** stored in the database and executed at request time. This is the highest-risk component in the system. Defense is layered:

#### Layer 1 — Compile-Time AST Rewriting (RestrictedPython)

RestrictedPython's `compile_restricted()` function rewrites the template's AST before compilation, injecting hook calls that block dangerous patterns at bytecode level:

| Dangerous pattern | Blocked by |
|---|---|
| `obj.__class__` | `_getattr_` hook → rejects dunder attributes |
| `obj.__bases__[0].__subclasses__()` | Same; prevents object hierarchy traversal |
| `for x in iterable` | Requires `_getiter_` to be present in globals |
| `x[0]`, `x["key"]` | Requires `_getitem_` in globals |
| `a, b = pair` | Requires `_unpack_sequence_` in globals |
| `x += 1` | Requires `_inplacevar_` in globals |

The Worker's sandbox deliberately **omits** `_getiter_`, `_getitem_`, `_unpack_sequence_`, and `_inplacevar_` from the restricted globals. This means template code cannot use for-loops, list indexing, destructuring, or augmented assignment. Templates must write SVG using string concatenation, `.join()`, `.append()`, f-strings, and plain assignment only.

This is not a bug or limitation that will be lifted — it is the security surface. Restricting the language keeps the template attack surface well-defined.

#### Layer 2 — Runtime Whitelist

The restricted globals dict is constructed explicitly:

```python
ALLOWED_BUILTINS = {
    "str", "int", "float", "bool", "dict", "list", "tuple",
    "len", "min", "max", "range", "sum", "round",
    "enumerate", "zip", "abs", "sorted", "reversed",
    "isinstance", "hasattr", "getattr",
    "True", "False", "None",
}

SAFE_MODULES = {
    "json": json,   # json.dumps / json.loads for param marshalling
    "math": math,   # math.sqrt, math.pi, etc.
}

restricted_globals = {
    **safe_globals,                  # RestrictedPython base
    "__builtins__": {k: __builtins__[k] for k in ALLOWED_BUILTINS},
    **SAFE_MODULES,
    "_print_": PrintCollector,       # Capture print() output (not stdout)
    "_write_": lambda x: x,         # Allow string writes
}
```

Anything not in this dict does not exist from the template's perspective. `import`, `open`, `exec`, `eval`, `compile`, `__import__`, `os`, `sys`, `socket` — none of these are reachable.

#### Layer 3 — Process Isolation (ProcessPoolExecutor)

The actual `exec()` call happens inside a `ProcessPoolExecutor` worker process, not in the Gateway or Worker's main process. This provides OS-level memory isolation: even if a template somehow escaped the RestrictedPython sandbox (a bug in the AST rewriter), it would be running in a subprocess with no shared memory with the parent.

```python
loop = asyncio.get_event_loop()
with ProcessPoolExecutor(max_workers=4) as pool:
    future = loop.run_in_executor(
        pool,
        _worker_execute,
        template_code,
        params,
        metadata
    )
    result = await asyncio.wait_for(future, timeout=2.0)
```

The Worker pre-warms the `ProcessPoolExecutor` during its startup lifespan so that the first request does not pay the process-spawn latency.

#### Layer 4 — Time-Boxing

`asyncio.wait_for(..., timeout=2.0)` enforces a hard 2-second execution budget. This prevents:

- Infinite loops (`while True: ...` — note: `while` is not blocked by RestrictedPython, but the timeout kills it)
- Deeply recursive functions
- "Zip bomb" style inputs that generate enormous strings before returning

On timeout, the Worker returns `504 Gateway Timeout` and the Gateway issues a refund.

#### Layer 5 — Type Enforcement

After execution, the sandbox checks that `execution_scope["svg_output"]` is a non-empty `str`. A template that produces `None`, an integer, or raises an exception at assignment time fails validation and returns `400 Bad Request`. This prevents accidentally valid-looking but semantically broken SVG from reaching the Gateway.

#### What template code looks like

```python
# A valid Frakt template
width = 800
height = 300
points = params.get("data_points")
stroke = params.get("stroke_color", "#4f46e5")

paths = []
n = len(points)
i = 0
while i < n:
    x = 50 + i * (730 / (n - 1))
    y = 280 - (points[i] / 300) * 260
    paths.append(str(round(x, 1)) + "," + str(round(y, 1)))
    i = i + 1

svg_output = (
    '<svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg">'
    '<polyline points="' + " ".join(paths) + '" '
    'fill="none" stroke="' + stroke + '" stroke-width="2"/>'
    '</svg>'
)
```

### Audit Logging

Every significant action calls `log_event()` in `app/audit.py`. The function extracts metadata from the active FastAPI `Request` object and writes an `AuditLog` row synchronously before returning to the caller.

**Actions logged:**

| Action | Severity | Trigger |
|---|---|---|
| `CUSTOMER_REGISTERED` | INFO | Successful `/register` |
| `API_KEY_ROTATED` | WARNING | Successful `/rotate-key` |
| `ACCOUNT_DEACTIVATED` | WARNING | Successful `DELETE /me` |
| `TEMPLATE_CREATED` | INFO | Successful template POST |
| `TEMPLATE_UPDATED` | INFO | Successful template PATCH |
| `TEMPLATE_DELETED` | WARNING | Successful template DELETE |
| `SVG_RENDER_SUCCESS` | INFO | Successful `/generate` |
| `AI_PREDICTION_SUCCESS` | INFO | Successful `/generate-predictive` |
| `AI_PREDICTION_FAILED` | ERROR | AI engine raised exception |
| `SANDBOX_EXECUTION_CRASH` | CRITICAL | Worker returned 5xx |
| `QUOTA_EXCEEDED` | WARNING | Pre-flight charge rejected |
| `RATE_LIMIT_EXCEEDED` | WARNING | SlowAPI rejected request |

CRITICAL events are visually flagged in the file log with a `================` separator so they stand out in `tail -f` sessions.

The middleware layer also logs every authenticated request as a background task (after the response is sent), capturing the endpoint, status code, latency, and IP for general traffic analysis without blocking the response.

### Error Handling

Global exception handlers in `app/middleware/error_handlers.py` translate exceptions to HTTP status codes:

| Exception | HTTP Code | Meaning |
|---|---|---|
| `sqlalchemy.exc.IntegrityError` | 409 Conflict | Duplicate `(owner_id, template_name)` |
| `sqlalchemy.exc.SQLAlchemyError` | 503 Service Unavailable | DB connection failure |
| `httpx.HTTPStatusError` | 502 Bad Gateway | Worker returned an error |
| `httpx.TimeoutException` | 504 Gateway Timeout | Worker exceeded 2s timeout |
| `Exception` (catch-all) | 500 Internal Server Error | Unhandled exception |

All handlers return a JSON body `{ "detail": "..." }` consistent with FastAPI's default error schema.

### Logging & Observability

Frakt uses Python's standard `logging` module configured in `app/configs/logging_config.py`:

- **Console handler**: Real-time stdout (useful in Docker with `docker logs -f`)
- **Rotating file handler**: `LOG_DIR/GATEWAY_LOG_FILE`, max 5 MB per file, 5 rotating backups
- **Format**: `%(asctime)s | %(levelname)-8s | %(name)s - %(message)s`
- **SQLAlchemy echo**: Suppressed to WARNING to prevent per-query SQL spam drowning application logs

---

## Cadence Study Planner

### Cadence Architecture Overview

Cadence is a **Next.js 16 App Router** application with server-side API routes acting as a BFF (Backend For Frontend). MongoDB is the primary store for all Cadence-owned data. Frakt is consumed as an external service for chart generation.

```
Browser
   │  HTTP
   ▼
Next.js App Router
   ├── /app/api/*          Server-side API routes (Node.js runtime)
   │       │
   │       ├── MongoDB (Mongoose)    — Users, Profiles, Timetables, Sessions
   │       ├── Groq API              — AI study session generation
   │       └── Frakt HTTP API        — SVG chart rendering
   │
   └── /app/(pages)/*      React Server + Client Components
           │
           └── TailwindCSS, NextAuth session
```

Authentication is handled by **NextAuth 4.24** with both Google OAuth and email/password credentials providers. Sessions are JWT-based.

### Cadence Database Models

All models live in `cadence_study_planner/models/` as Mongoose schemas targeting MongoDB Atlas.

#### `User`

Standard NextAuth-compatible user document: `email`, `name`, `image`, `emailVerified`. Extended with `hashedPassword` for the credentials provider. The `_id` is a MongoDB ObjectId used as the `userId` foreign key across all other collections.

#### `StudentProfile`

One-to-one extension of `User` for academic-specific data:

```
studentId         String           Institutional ID (e.g., "10837421")
cohort            String           e.g., "Level 300 CS A"
enrolledCourses   CourseReference[]
  └── courseCode  String
  └── courseName  String
learningResources Resource[]
  ├── type        "url" | "text" | "scholar_paper"
  ├── value       String
  └── metadata    Object
preferences       Object           Freeform AI hints (study hours/day, focus style)
```

`learningResources` is passed verbatim to the Groq AI prompt when generating study sessions, letting the AI suggest sessions that reference specific reading materials.

#### `Timetable`

The institution-wide class schedule document. A single timetable covers one academic year + semester combination.

```
academicYear     String           "2025/2026"
semester         Number           1 or 2
scheduleMatrix   Map<String, TimeSlotGroup[]>
  Key: day name  "Monday" .. "Friday"
  Value: array of TimeSlotGroup
    └── slotLabel    String       "08:30 - 11:30"
    └── assignments  Assignment[]
          ├── cohort      String
          ├── lecturer    String
          ├── courseCode  String
          ├── courseName  String
          └── room        String (optional)
```

The `scheduleMatrix` is stored as a MongoDB `Map` type. This nested structure is what the genetic scheduler outputs and what the frontend renders as a timetable grid.

#### `StudySession`

Individual blocks of study time belonging to a student:

```
userId       ObjectId (ref User)
course       { code, name }
title        String
description  String
date         Date
duration     Number (minutes)
priority     "low" | "medium" | "high"
completed    Boolean (default false)
source       "manual" | "ai_generated"
```

`source: "ai_generated"` marks sessions created by the Groq planning endpoint, letting the UI distinguish AI suggestions from the student's own manual entries.

#### `CourseDemand`

Input data to the genetic scheduler — what needs to be scheduled:

```
cohort                String   "Level 300 CS A"
lecturer              String   "Dr. Mensah"
courseCode            String   "CS 301"
courseName            String   "Algorithms"
weeklySlotsRequired   Number   1 | 2 | 3
```

A collection of `CourseDemand` documents is the complete input to `geneticScheduler.js`. The scheduler expands each demand into `weeklySlotsRequired` individual sessions, then assigns each session to a time slot.

### Genetic Algorithm Timetable Scheduler

`lib/scheduler/geneticScheduler.js` implements a **Genetic Algorithm (GA)** to solve the class timetabling problem. The scheduler is invoked server-side in an API route when an administrator triggers timetable generation.

**Time slot universe:**

The scheduler works with a fixed universe of 15 time slots (5 days × 3 periods/day):

```
Index  Day        Time
0      Monday     08:30 – 11:30
1      Monday     11:30 – 14:30
2      Monday     14:30 – 17:30
3      Tuesday    08:30 – 11:30
...
14     Friday     14:30 – 17:30
```

Each slot index maps deterministically to a `(day, slotLabel)` pair.

**Chromosome representation:**

A chromosome is a flat array of integers, one per session to be scheduled:

```
Sessions: [CS301-A, CS301-B, MATH101-A, MATH101-B, PHYS201-A]
Chromosome: [3, 7, 0, 12, 5]
           CS301-A assigned slot 3 (Tuesday 08:30)
           CS301-B assigned slot 7 (Wednesday 11:30)
           ...
```

The chromosome length equals the total number of session instances across all `CourseDemand` records. The gene domain is `[0, 14]`.

**Fitness function:**

Fitness is the **negative total penalty** — higher (less negative) is better:

```javascript
function computeFitness(chromosome, sessions) {
    let penalty = 0;

    // Hard constraints: penalty 50 each violation
    // Lecturer conflict: same lecturer in same slot twice
    // Cohort conflict: same cohort in same slot twice

    // Soft constraints:
    // Same course repeats for cohort on same day       → penalty 8
    // Cohort booked in all 3 slots on same day         → penalty 4
    // Cohort has idle gap between booked slots          → penalty 3
    // Lecturer has idle gap between sessions            → penalty 1
    // Cohort booked in all 5 days this week            → penalty 2
    // Week imbalance (std of day-load > threshold)     → penalty 1

    return -penalty;
}
```

Hard constraints use a 50× penalty multiplier rather than strict infeasibility rejection. This allows the GA to cross infeasible regions of the search space during early generations, which prevents premature convergence to a local minimum that satisfies all hard constraints but has poor soft-constraint scores.

**GA lifecycle:**

```
1. Initialize
   └── Generate 80 random chromosomes

2. For each of 200 generations:
   a. Evaluate fitness for all chromosomes
   b. Sort by fitness (descending)
   c. Carry elite[0..3] directly to next generation
   d. Fill remaining 76 slots:
      i.  Tournament select 2 parents (size-3 tournaments)
      ii. 85% chance: uniform crossover (each gene from parent1 or parent2 with p=0.5)
          15% chance: copy parent1 directly
      iii. For each gene: 4% chance flip to random slot in [0,14]
   e. Replace population with new generation

3. Hill-climbing refinement (3 passes):
   └── For each gene in best chromosome:
       └── Try all 14 alternative slots, keep if improvement
```

**Tournament selection** picks the best individual from a random subset of 3, repeated per slot in the breeding pool. This balances selection pressure — pure fitness-proportional selection collapses diversity quickly; pure random selection makes no progress.

**Uniform crossover** at 85% rate means most pairs of parents produce a child that is a random 50/50 mix of their genes, not a contiguous prefix/suffix split (single-point crossover). Uniform crossover is preferred here because slot assignments for different sessions are largely independent — there is no spatial locality in the chromosome that single-point crossover could exploit.

**Hill-climbing refinement** is a local search post-processing step. After the GA terminates, the best chromosome is polished by exhaustively testing slot alternatives for each session. This is cheap (linear scan, 15 options per gene) and consistently improves the final schedule quality by catching easy wins the GA's stochastic search may have missed.

### NP-Hard Scheduling: Problem Formulation

Class timetabling is a member of the **NP-hard** complexity class. Specifically, it is a generalization of **graph coloring** (itself NP-complete): sessions are vertices, conflicts between sessions that cannot share a slot are edges, and slot assignments are colors. Finding a coloring with zero hard-constraint violations is equivalent to finding a proper graph coloring with 15 colors.

**Why NP-hard?**

A polynomial-time exact algorithm is not known to exist (and is not expected to — P ≠ NP is widely believed). The number of possible timetables for a problem with `S` sessions and `T` slots is `T^S`. With 30 sessions and 15 slots, that is `15^30 ≈ 1.9 × 10^35` candidates — exhaustive search is computationally infeasible.

**Why GA instead of ILP or constraint programming?**

- **Integer Linear Programming (ILP)** solvers (e.g., GLPK, CPLEX) can find provably optimal solutions but require the problem to be fully formalized as linear inequalities. The soft constraints here (gap penalties, day-balance) are non-linear and hard to express cleanly without many auxiliary variables. Solver setup cost for a JavaScript runtime is also high.
- **Constraint Programming** (e.g., Google OR-Tools) is excellent but requires a Python or Java runtime, complicating the Next.js server-side deployment.
- **Genetic Algorithm** trades optimality for practicality: it runs in pure JavaScript in the same Next.js process, requires no external solver, produces good-enough schedules within a deterministic time budget (200 generations × 80 population is a fixed-cost loop), and is easy to tune by adjusting penalty weights.

**Completeness caveat:** The GA is not complete — it cannot prove that the returned schedule is optimal, and may not find the global optimum. For production use with very tight constraints (e.g., a lecturer teaching 14 of 15 slots), the hard-constraint penalties may not fully converge to zero. In practice, with realistic university data, the schedule produced has zero hard-constraint violations in the vast majority of runs.

### AI Study Planning

`lib/ai/index.js` calls the **Groq API** (OpenAI-compatible endpoint) with a structured prompt that includes:

- The student's enrolled courses and course codes
- Their attached learning resources (URLs, reading notes, paper references)
- The current academic year and semester
- Their personal preferences (preferred study hours per day, focus style)
- The current date (for scheduling sessions in the near future)

The model is asked to return a JSON array of `StudySession`-shaped objects. The API route validates the shape, sets `source: "ai_generated"`, and bulk-inserts into MongoDB.

---

## Frakt ↔ Cadence Integration

This is how the two applications are wired together.

### Full Request Lifecycle

A user opens the Cadence dashboard and views their study analytics chart. Here is the complete path:

```
1. Browser loads Cadence dashboard React component

2. Component calls Cadence API route: GET /api/analytics/charts

3. Next.js API route:
   a. Authenticates user via NextAuth session
   b. Queries MongoDB for user's StudySessions (last 30 days)
   c. Aggregates daily totals → data_points array
   d. Calls lib/frakt/client.js → generatePredictiveChart()

4. Frakt client sends:
   POST http://127.0.0.1:8000/v1/generate-predictive
   Headers:
     x-api-key: frakt_live_<Cadence's API key>
     Content-Type: application/json
   Body:
     {
       "template_name": "cadence_line_forecast_v1",
       "params": {
         "data_points": [2.5, 3.1, 4.0, 3.8, 5.2],
         "x_labels": ["Jun 10", "Jun 11", ..., "Jun 14"],
         "stroke_color": "#6366f1"
       },
       "ai_method": "auto"
     }

5. Frakt Gateway:
   a. Validates x-api-key → looks up Cadence customer record
   b. Checks rate limit (Cadence is on Pro tier)
   c. Pre-charges 2 credits (atomic UPDATE)
   d. Runs PredictiveEngine → extends data_points with 3 forecast values
   e. Sends ExecutionRequest to Worker via UDS:
      POST http://worker/execute
      { "template_code": "<stored RestrictedPython>", "params": {...} }

6. Worker:
   a. Compiles template_code with RestrictedPython (AST rewrite)
   b. Submits to ProcessPoolExecutor subprocess
   c. subprocess executes in restricted globals → returns svg_output string
   d. Worker returns { "output": "<svg ...>...</svg>" }

7. Frakt Gateway:
   a. Receives SVG string from Worker
   b. Stamps axis labels, data point circles, forecast boundary line
   c. Constructs response:
      Content-Type: image/svg+xml
      X-AI-Model: polynomial
      X-AI-Confidence: 0.84
      X-AI-Is-Growth: true
      X-Usage-Charged: 2
      Body: <full SVG>

8. Cadence API route receives SVG + headers:
   {
     configured: true,
     svg: "<svg...>",
     aiModel: "polynomial",
     confidence: 0.84,
     isGrowth: true,
     usageCharged: 2
   }

9. Cadence API route returns JSON to browser

10. React component renders SVG inline with dangerouslySetInnerHTML
    (SVG is sanitized server-side; it comes from Frakt's controlled sandbox)
```

### Frakt Client Wrapper

`lib/frakt/client.js` is a thin wrapper that handles the HTTP call and normalizes responses:

```javascript
export async function generatePredictiveChart({ points, labels, title, strokeColor, aiMethod = "auto" }) {
    if (!isFraktConfigured()) return { configured: false };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);  // 8s client timeout

    try {
        const res = await fetch(`${process.env.FRAKT_API_URL}/v1/generate-predictive`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.FRAKT_API_KEY,
            },
            body: JSON.stringify({
                template_name: process.env.FRAKT_CHART_TEMPLATE,
                params: { data_points: points, x_labels: labels, title, stroke_color: strokeColor },
                ai_method: aiMethod,
            }),
            signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Frakt error: ${res.status}`);

        const svg = await res.text();
        return {
            configured: true,
            svg,
            aiModel:      res.headers.get("X-AI-Model"),
            confidence:   parseFloat(res.headers.get("X-AI-Confidence") || "0"),
            isGrowth:     res.headers.get("X-AI-Is-Growth") === "true",
            usageCharged: parseInt(res.headers.get("X-Usage-Charged") || "0"),
        };
    } catch (err) {
        return { configured: true, svg: null, error: err.message };
    } finally {
        clearTimeout(timeout);
    }
}
```

The **8-second client timeout** is intentionally larger than Frakt's internal 2-second sandbox timeout. This gives the Gateway time to handle the Worker timeout, issue the refund, and return a `504` response to the client gracefully rather than the client timing out mid-flight.

**Graceful degradation:** If `FRAKT_API_URL` or `FRAKT_API_KEY` are not set in Cadence's environment, `isFraktConfigured()` returns `false` and the client returns `{ configured: false }` without throwing. Cadence's frontend components check this flag and render a placeholder instead of crashing.

### Chart Templates

The chart template used by Cadence is `cadence_line_forecast_v1`. It is created in Frakt's database by the setup script and owned by Cadence's customer account.

The template is a RestrictedPython program that generates a base SVG polyline. It receives:

| Param | Type | Description |
|---|---|---|
| `data_points` | `list[float]` | Y-values (historical + forecast, after AI extension) |
| `x_labels` | `list[str]` | Date strings for X-axis (optional) |
| `title` | `str` | Chart title text |
| `stroke_color` | `str` | Hex color for the line (default `#6366f1`) |

The Gateway appends the axis scale, point circles, tooltips, and forecast boundary after the template executes.

### Setup Script

`frakt_analytic_service/scripts/setup_cadence_integration.py` is a one-time provisioning script that:

1. Connects to Frakt's MySQL database directly.
2. Creates a new `Customer` record for Cadence (tier: `pro`).
3. Generates a raw API key, stores only its SHA-256 hash.
4. Creates the `cadence_line_forecast_v1` `SVGTemplate` owned by that customer.
5. Prints the generated `FRAKT_API_KEY` and `FRAKT_CHART_TEMPLATE` values for copying into Cadence's `.env.local`.

This script is idempotent — re-running it detects the existing customer by a well-known identifier and skips re-creation, only reprinting the stored credentials (though the raw key is unrecoverable after first run — a new key must be rotated if lost).

---

## Security Architecture

### API Key Security

| Concern | Mitigation |
|---|---|
| Key compromise via DB breach | SHA-256 hash only; raw key unrecoverable |
| Key reuse after account compromise | `POST /rotate-key` immediately invalidates old hash |
| Leaked key detection | `frakt_live_` prefix detected by secret scanners |
| Timing attacks on hash comparison | Python's `hmac.compare_digest()` used for constant-time comparison |

### Multi-Tenancy Isolation

Every database query in Frakt's routers is filtered by `WHERE owner_id = current_customer.id`. A customer cannot access, modify, or delete another customer's templates or audit logs, even with a valid API key. There is no admin bypass endpoint exposed in the public API — admin operations require direct database access.

### Sandbox Escape Mitigations

The sandbox is designed with defense-in-depth because RestrictedPython's AST rewriting alone has historically had bypasses:

1. **RestrictedPython AST rewriting** — compile-time, blocks common patterns
2. **Whitelist-only builtins** — removes the entire standard library from scope
3. **Process isolation** — OS-level memory separation
4. **2-second timeout** — kills runaway execution
5. **Type enforcement** — rejects anything that isn't a non-empty string

### CORS Policy

The Gateway's CORS middleware is configured to allow only `http://localhost:3000` in development. In production, this should be updated to Cadence's actual deployment domain. The current configuration will block browser-direct calls from any other origin.

---

## Configuration & Environment Variables

### Frakt (`frakt_analytic_service/.env`)

| Variable | Description | Example |
|---|---|---|
| `LOCAL_DATABASE_URL` | SQLAlchemy URL for local dev | `mysql+pymysql://user:pass@127.0.0.1:3306/frakt_db` |
| `DOCKER_DATABASE_URL` | SQLAlchemy URL inside Docker | `mysql+pymysql://user:pass@host.docker.internal:3306/frakt_db` |
| `LOG_DIR` | Directory for rotating log files | `logs` |
| `GATEWAY_LOG_FILE` | Log filename | `frakt_gateway.log` |
| `WORKER_URL` | Override Worker base URL (optional) | `http://127.0.0.1:8008` |
| `WORKER_SOCKET_PATH` | Override UDS path (optional) | `/tmp/sockets/worker.sock` |

### Cadence (`cadence_study_planner/.env.local`)

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/cadence` |
| `NEXTAUTH_URL` | Canonical base URL for NextAuth | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | JWT signing secret | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | — |
| `AI_PROVIDER` | AI backend for study planning | `groq` |
| `GROQ_API_KEY` | Groq API key | `gsk_...` |
| `ACADEMIC_YEAR` | Current academic year | `2025/2026` |
| `SEMESTER` | Current semester | `2` |
| `FRAKT_API_URL` | Frakt Gateway base URL | `http://127.0.0.1:8000` |
| `FRAKT_API_KEY` | Cadence's Frakt API key | `frakt_live_...` |
| `FRAKT_CHART_TEMPLATE` | Template name to use for charts | `cadence_line_forecast_v1` |

---

## Docker & Deployment

Frakt ships with a `docker-compose.yml` that runs two containers sharing a `tmpfs` volume for the Unix Domain Socket:

```yaml
services:
  gateway:
    build: .
    user: "1001:1001"
    ports:
      - "127.0.0.1:8000:8000"   # Only loopback-exposed
    volumes:
      - sockets:/tmp/sockets
      - ./logs:/app/logs
    environment:
      - DATABASE_URL=${DOCKER_DATABASE_URL}

  worker:
    build: ./worker
    user: "1002:1001"            # Same group as gateway for socket access
    volumes:
      - sockets:/tmp/sockets    # Shared tmpfs
    # No port exposure — only reachable via UDS

volumes:
  sockets:
    driver_opts:
      type: tmpfs               # In-memory, not persisted to disk
      device: tmpfs
```

**Security notes:**
- Gateway binds to `127.0.0.1:8000` only (no `0.0.0.0`). A reverse proxy (nginx, Caddy) should be placed in front for TLS termination and public exposure.
- Worker has no published port — it is unreachable from outside the Docker network.
- Both containers run as non-root users. The shared group (gid 1001) grants mutual socket access without world-readable permissions.
- The `tmpfs` socket volume is never written to disk, preventing socket file persistence after container shutdown.

---

## Development Setup

### Frakt

```bash
cd frakt_analytic_service

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your MySQL credentials

# Initialize database tables
python -c "from app.database.models import Base; from app.database.session import engine; Base.metadata.create_all(engine)"

# Start gateway (port 8000)
python main.py

# Start worker in a separate terminal (port 8008 on Windows)
cd worker && python worker.py

# Provision Cadence integration (after both services are running)
python -m scripts.setup_cadence_integration
```

### Cadence

```bash
cd cadence_study_planner

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with MongoDB URI, Google OAuth, Groq key, and Frakt credentials

# Start development server
npm run dev
# → http://localhost:3000
```

### Verifying the Integration

With both Frakt and Cadence running locally:

1. Register a Cadence account at `http://localhost:3000`
2. Complete your student profile and enroll in courses
3. Log some study sessions manually
4. Open the analytics dashboard — a chart should render (SVG served from Frakt)
5. Check `frakt_analytic_service/logs/frakt_gateway.log` for the request log entry
6. Visit `GET http://localhost:8000/v1/customers/me` with your API key to see usage count increment
