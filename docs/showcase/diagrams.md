# Showcase diagrams

Draft diagrams for the showcase presentation. Mermaid sources, so GitHub renders them here and a
reviewer can correct the source rather than an image.

Three are drawn. Two more are candidates and are listed at the end.

---

## 1. The data model, both scopes

**Every user gets their own database.** That is the architectural claim of the backend, so the ERD is
two diagrams rather than one: a single central directory, and one private database per account whose
shape is repeated for every user.

**The relationship lines are logical, not enforced.** Neither schema declares a foreign key anywhere,
deliberately, because the Turso engine has `PRAGMA foreign_keys` off per connection and a declared
constraint would be decorative. Mermaid draws relationships as though they were constraints, so read
every line below as "the application maintains this", not "the database enforces it".

Every table also carries `deleted_at` and tombstones instead of deleting, which is why the row counts
a query returns depend on remembering to filter it.

### Central database: the user directory

One database, shared by everybody. It holds an email, a pointer to that person's own database, and the
two credentials that are checked before anything knows which database to open.

```mermaid
erDiagram
    users {
        text id PK
        text email UK
        text db_name "pointer to this user's own database"
        text db_url
        text db_auth_token
        text onboarding_payload "held until the account is verified"
        int  deleted_at
    }
    login_links {
        text id PK
        text user_id FK
        text token_hash "SHA-256 of the emailed token"
        int  expires_at
        int  used_at "set on click, single use"
        int  superseded_at "set when a newer link is issued"
        int  deleted_at
    }
    sessions {
        text id PK
        text user_id FK
        text token_hash "SHA-256 of the cookie value"
        int  expires_at "absolute, not sliding"
        int  deleted_at
    }
    colour_templates {
        text id PK
        text token "a daisyUI semantic colour"
        text label
        int  sort_order
        bool enabled
    }
    icon_templates {
        text id PK
        text name "a lucide icon name"
        text label
        int  sort_order
        bool enabled
    }
    category_templates {
        text id PK
        text name
        text colour_id FK
        text icon_id FK
        text description
        int  sort_order
        bool enabled
    }

    users ||--o{ login_links : "requests"
    users ||--o{ sessions : "holds"
    colour_templates ||--o{ category_templates : "colours"
    icon_templates ||--o{ category_templates : "marks"
```

The three `*_templates` tables are the exception to "central holds only an email and a pointer": they
carry which starter categories onboarding offers and which colours and icons a category may take, as
the first step toward a super-admin panel.

### Per-user database: one of these per account

```mermaid
erDiagram
    profile {
        text id PK
        text full_name
        text currency
        int  deleted_at
    }
    period_rules {
        text id PK
        text effective_from "append-only history"
        int  month_start_day "the pay day"
        text transition_start "set on a stretched transition period"
        int  deleted_at
    }
    budget_history {
        text id PK
        text effective_from "append-only history"
        int  budget_cents
        int  deleted_at
    }
    categories {
        text id PK
        text name
        text color "a daisyUI semantic token"
        text icon "a lucide icon name"
        text description
        bool is_fallback "exactly one row, Uncategorized"
        int  deleted_at
    }
    category_cap_history {
        text id PK
        text category_id FK
        text effective_from "append-only history"
        int  cap_cents "null means uncapped"
        int  deleted_at
    }
    transactions {
        text id PK
        text merchant
        text category_id FK
        int  amount_cents
        text date "YYYY-MM-DD, text to dodge timezones"
        text note
        int  deleted_at
    }
    insight_sets {
        text id PK
        text status
        text month_label
        text summary_headline
        text summary_body
        int  generated_at
        int  deleted_at
    }
    insights {
        text id PK
        text set_id FK
        text tone
        text title
        text body
        int  sort_order
        int  deleted_at
    }
    assistant_sessions {
        text id PK
        text title "derived from the first message"
        int  last_message_at
        int  deleted_at
    }
    assistant_messages {
        text id PK
        text session_id FK
        text role
        text content
        int  sort_order
        int  deleted_at
    }

    categories ||--o{ transactions : "classifies"
    categories ||--o{ category_cap_history : "is capped by"
    insight_sets ||--o{ insights : "contains"
    assistant_sessions ||--o{ assistant_messages : "contains"
```

**The three `*_history` tables are the shape worth pointing at.** Budget, category caps and the day a
period starts on are append-only and effective-dated, resolved on read. A change applies from a date
and never backwards, which is what stops raising the budget in 2026 from silently re-pricing every
month of 2025.

---

## 2. Deployment and infrastructure

Five hosted services and one API key, each doing exactly one job.

```mermaid
flowchart TB
    subgraph client["Browser"]
        B["www.spendifico.eu"]
    end

    subgraph vercel["Vercel"]
        FE["Next.js frontend<br/>App Router, port 4200 in dev"]
    end

    subgraph fly["Fly.io"]
        API["NestJS API<br/>api.spendifico.eu"]
        VOL[("Volume<br/>local sync replicas")]
    end

    subgraph turso["Turso Cloud"]
        CDB[("spendifico-app<br/>central directory")]
        UDB[("spendifico-user-UUID<br/>one per account")]
    end

    MP["MailPace<br/>login@spendifico.eu"]
    INBOX["spendifico@gmail.com<br/>replies and forwards"]
    GEM["Google Gemini<br/>receipt scanning + assistant"]
    PB["Porkbun<br/>DNS for spendifico.eu"]

    subgraph ci["GitHub Actions"]
        CI["ci.yml<br/>on every PR"]
        DEP["deploy<br/>manual dispatch only"]
    end

    B --> FE
    FE -->|"the only caller"| API
    API --> CDB
    API --> UDB
    API --- VOL
    API -->|"login links"| MP
    MP --> INBOX
    API -->|"scan + chat"| GEM
    PB -.->|"resolves"| B
    PB -.->|"resolves"| API
    DEP -->|"flyctl deploy"| API
    CI -.->|"gates the merge"| DEP
```

Three things on it are decisions rather than topology:

- **The frontend is the only thing that calls the API.** No other client exists, which is what lets the
  HTTP contract be generated from the backend and committed.
- **`main` does not auto-deploy the backend.** The deploy is workflow-dispatch only, so an endpoint can
  be merged and absent from production, which has happened.
- **The Fly volume holds sync replicas, not the source of truth.** Turso Cloud is authoritative, and a
  replica that disagrees is repaired by deleting it and letting it re-bootstrap.

---

## 3. Passwordless login

There is no password field anywhere in the app. Access is an emailed single-use link.

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend (Vercel)
    participant API as API (Fly.io)
    participant DB as Central database
    participant MP as MailPace
    participant IN as Inbox

    U->>FE: enters an email address
    FE->>API: POST /api/auth/login-link
    API->>DB: find the user by email

    rect rgb(240, 240, 245)
    note over API,DB: issue() - one transaction
    API->>DB: supersede EVERY unused link for this user
    API->>DB: insert one row: SHA-256 hash, expires in 15 minutes
    end

    API->>MP: send the mail carrying the RAW token
    API-->>FE: 202, always empty
    note over API,FE: identical whether or not the account exists,<br/>so the response enumerates nobody
    MP->>IN: delivers

    U->>IN: opens the mail
    U->>FE: clicks /auth/verify?token=RAW
    FE->>API: POST /api/auth/verify

    rect rgb(240, 240, 245)
    note over API,DB: consume() - one conditional UPDATE
    API->>DB: set used_at WHERE hash matches<br/>AND unused AND unsuperseded AND unexpired
    end

    alt the row matched
        API->>DB: create a session: SHA-256 hash, 30 days, absolute expiry
        API-->>FE: sets the session cookie
        FE-->>U: lands on the dashboard
    else a newer link was issued
        API-->>FE: superseded
        FE-->>U: "open the most recent email"
    else unknown, spent or expired
        API-->>FE: invalid
        FE-->>U: "request a new link"
    end
```

Four details on it are the ones people ask about:

- **The raw token is never stored.** Only its SHA-256 goes in the row, and the hash is the lookup key
  rather than a secret to compare, so verification has no timing-sensitive branch in it.
- **A link is single use**, by one conditional UPDATE rather than a read followed by a write. Whichever
  of two concurrent clicks runs second matches zero rows.
- **Only the newest link ever works.** Requesting a link supersedes every unused one for that account,
  so a resend cannot leave two doors open.
- **"Superseded" is told apart from "invalid"** because it is the one rejection a user can act on, and
  disclosing it enumerates nobody: it is only ever returned to somebody holding a token that was
  genuinely emailed to the account owner.

---

## Candidates not yet drawn

- **One database per user**, from registration through to first open: what happens at the moment an
  account is verified, and where the per-database credentials come from.
- **Cancelling an AI request**, the three-hop abort chain from the composer to Gemini. There is already
  a plain-language write-up of it in `docs/explainers/cancelling-an-ai-request.md` to draw from.
