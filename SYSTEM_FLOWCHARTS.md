# DubGrid System Flowcharts

> All diagrams are Mermaid-based. Render in GitHub, VS Code (Mermaid extension), or any Mermaid-compatible viewer.

---

## 1. Authentication Flow

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant LoginPage as Login Page
    participant SupaAuth as Supabase Auth
    participant JWTHook as custom_access_token_hook
    participant DB as PostgreSQL
    participant Middleware as Edge Middleware

    Note over User,Middleware: === ORG LOGIN (e.g., calmhaven.localhost/login) ===

    User->>Browser: Navigate to org.localhost/login
    Browser->>LoginPage: Render DomainSelector (if no subdomain)
    User->>LoginPage: Enter org slug (e.g., "calmhaven")
    LoginPage->>LoginPage: GET /api/validate-domain?slug=calmhaven
    LoginPage-->>Browser: Redirect to calmhaven.localhost/login?verified=1

    User->>LoginPage: Enter email + password
    LoginPage->>SupaAuth: signInWithPassword({ email, password })
    SupaAuth->>SupaAuth: Validate credentials vs auth.users

    Note over SupaAuth,JWTHook: Auth hook fires on every token issuance

    SupaAuth->>JWTHook: event { user_id, claims }
    JWTHook->>DB: Check jwt_refresh_locks for active lock
    alt Lock exists (role change in progress)
        JWTHook-->>SupaAuth: HTTP 403 — "Your session has expired. Please sign in again."
        SupaAuth-->>LoginPage: Error: session expired
        LoginPage-->>User: "Your session has expired. Please sign in again."
    else No lock
        JWTHook->>DB: SELECT platform_role, org_role, org_id, org_slug<br/>FROM profiles JOIN organization_memberships JOIN organizations
        DB-->>JWTHook: { platform_role, org_role, org_id, org_slug }
        JWTHook->>JWTHook: Inject claims at JWT top level
        JWTHook-->>SupaAuth: Modified JWT payload
    end

    SupaAuth-->>LoginPage: Session { access_token, refresh_token }
    LoginPage->>LoginPage: Decode JWT — check org_slug vs URL subdomain

    alt org_slug matches subdomain
        LoginPage-->>Browser: Redirect to /dashboard
    else org_slug mismatch (user belongs to different org)
        LoginPage->>SupaAuth: RPC get_my_organizations()
        SupaAuth-->>LoginPage: List of user's org memberships
        LoginPage->>SupaAuth: RPC switch_org(target_org_id)
        SupaAuth->>DB: UPDATE profiles SET org_id = target_org_id
        LoginPage->>SupaAuth: refreshSession()
        SupaAuth->>JWTHook: Re-issue token with new org context
        JWTHook-->>SupaAuth: Fresh JWT with correct org claims
        SupaAuth-->>LoginPage: New session
        LoginPage-->>Browser: Redirect to /dashboard
    end

    Note over Browser,Middleware: === AUTHENTICATED REQUEST ===

    Browser->>Middleware: GET /dashboard (with cookies)
    Middleware->>Middleware: Extract session from sb-*-auth-token cookies
    Middleware->>Middleware: jwtVerify(access_token, JWT_SECRET)
    Middleware->>Middleware: Extract claims { platform_role, org_role, org_id, org_slug }
    Middleware->>Middleware: Calculate effective role + check route guards
    Middleware->>Middleware: Inject x-dubgrid-role, x-dubgrid-org-id headers
    Middleware-->>Browser: NextResponse.next() — render page

    Note over User,Middleware: === GRIDMASTER LOGIN (separate flow) ===

    User->>LoginPage: Navigate to /gridmaster/login
    User->>LoginPage: Enter gridmaster credentials
    LoginPage->>SupaAuth: signInWithPassword()
    SupaAuth->>JWTHook: Issue token
    JWTHook->>DB: Resolve — platform_role = 'gridmaster', no org context
    JWTHook-->>SupaAuth: JWT { platform_role: "gridmaster", org_role: null, org_id: null }
    SupaAuth-->>LoginPage: Session
    LoginPage-->>Browser: Redirect to /gridmaster
```

---

## 2. RBAC Hierarchy & Permission Model

```mermaid
flowchart TB
    subgraph PlatformLevel["Platform Level (platform_role)"]
        GM["<b>GRIDMASTER</b><br/>Tier 4 — God Mode<br/>━━━━━━━━━━━━━━<br/>All orgs, all data<br/>Bypasses all RLS<br/>Impersonation<br/>No org_id (null)"]
    end

    subgraph OrgLevel["Organization Level (org_role)"]
        SA["<b>SUPER_ADMIN</b><br/>Tier 3 — Org Owner<br/>━━━━━━━━━━━━━━<br/>All org permissions<br/>canManageUsers<br/>canConfigureAdminPermissions<br/>canManageOrgSettings"]

        AD["<b>ADMIN</b><br/>Tier 2 — Configurable<br/>━━━━━━━━━━━━━━<br/>Per-user permissions<br/>set by super_admin<br/>(see permission matrix)"]

        US["<b>USER</b><br/>Tier 0 — Read Only<br/>━━━━━━━━━━━━━━<br/>canViewSchedule ✓<br/>canViewStaff ✓<br/>All else denied"]
    end

    GM -.->|"can impersonate<br/>any org user"| SA
    SA -->|"configures permissions for"| AD
    AD -.->|"elevated from"| US

    subgraph PermMatrix["Admin Permission Matrix (JSONB)"]
        direction LR
        subgraph Schedule["Schedule"]
            P1["canEditShifts"]
            P2["canPublishSchedule"]
            P3["canApplyRecurringSchedule"]
        end
        subgraph Staff["Staff"]
            P4["canViewStaff ✓ always"]
            P5["canManageEmployees"]
        end
        subgraph Config["Configuration"]
            P6["canManageFocusAreas"]
            P7["canManageShiftCodes"]
            P8["canManageIndicatorTypes"]
            P9["canManageOrgLabels"]
        end
        subgraph Other["Other"]
            P10["canEditNotes"]
            P11["canManageRecurringShifts"]
            P12["canManageShiftSeries"]
            P13["canManageCoverageRequirements"]
            P14["canApproveShiftRequests"]
        end
    end

    AD -->|"permissions stored in<br/>organization_memberships.admin_permissions"| PermMatrix

    style GM fill:#dc2626,color:#fff
    style SA fill:#ea580c,color:#fff
    style AD fill:#2563eb,color:#fff
    style US fill:#64748b,color:#fff
    style PlatformLevel fill:#fef2f2,stroke:#dc2626
    style OrgLevel fill:#f0f9ff,stroke:#2563eb
```

---

## 3. Request Lifecycle (Browser to Database)

```mermaid
flowchart TD
    REQ["Browser Request<br/><i>GET calmhaven.localhost/schedule</i>"]

    subgraph MW["Edge Middleware (middleware.ts)"]
        direction TB
        PUB{"Public route?<br/>/login, /api, /,<br/>/accept-invite"}
        SESS["Extract session<br/>from sb-*-auth-token cookies<br/>(multi-chunk reconstruction)"]
        NOSESS{"Session<br/>exists?"}
        JWT["Verify JWT signature<br/>jwtVerify(token, JWT_SECRET)"]
        CLAIMS["Extract claims:<br/>platform_role, org_role,<br/>org_id, org_slug"]
        FALLBACK{"Claims<br/>complete?"}
        DBFALLBACK["Fallback: Query DB<br/>profiles + organization_memberships<br/>+ organizations"]
        EFFROLE["Calculate effective role:<br/>gridmaster > super_admin > admin > user"]
        SUBDOMAIN{"Subdomain matches<br/>org_slug?"}
        ROUTEGUARD{"Route access<br/>allowed?"}
        HEADERS["Inject headers:<br/>x-dubgrid-role<br/>x-dubgrid-org-id<br/>x-dubgrid-org-slug"]
    end

    subgraph PAGE["Next.js Page Render"]
        direction TB
        LAYOUT["Root Layout<br/>(AuthProvider + AppShell)"]
        COMPONENT["Page Component<br/>(Client or Server)"]
        PERMS["usePermissions() hook<br/>Decode JWT → extract role<br/>Admin? → fetch admin_permissions"]
        RENDER["Render with RBAC context<br/>(show/hide UI based on perms)"]
    end

    subgraph ACTION["Server Action / Data Mutation"]
        direction TB
        AUTHCHECK["Server-side auth check<br/>getSession() + verify user"]
        MUTATION["Execute DB query<br/>(parameterized)"]
    end

    subgraph RLS["PostgreSQL RLS Layer"]
        direction TB
        RLSCHECK{"RLS Policy Check"}
        ISGM["is_gridmaster()?"]
        ORGMATCH["caller_org_id() = row.org_id?"]
        PERMCHECK["check_admin_permission()<br/>(e.g., 'canEditShifts')"]
        ALLOW["✓ Allow"]
        DENY["✗ Deny"]
    end

    REQ --> PUB
    PUB -->|Yes| PASS1["NextResponse.next()"]
    PUB -->|No| SESS
    SESS --> NOSESS
    NOSESS -->|No session| REDIR1["Redirect → /login"]
    NOSESS -->|Yes| JWT
    JWT --> CLAIMS
    CLAIMS --> FALLBACK
    FALLBACK -->|Yes| EFFROLE
    FALLBACK -->|No| DBFALLBACK
    DBFALLBACK --> EFFROLE
    EFFROLE --> SUBDOMAIN
    SUBDOMAIN -->|No| REDIR2["Redirect → correct subdomain"]
    SUBDOMAIN -->|Yes| ROUTEGUARD
    ROUTEGUARD -->|"/staff, /settings<br/>but role < admin"| REDIR3["Redirect → /schedule"]
    ROUTEGUARD -->|"/gridmaster<br/>but not gridmaster"| REDIR4["Redirect → /schedule"]
    ROUTEGUARD -->|Allowed| HEADERS

    HEADERS --> LAYOUT
    LAYOUT --> COMPONENT
    COMPONENT --> PERMS
    PERMS --> RENDER

    RENDER -->|"User action<br/>(e.g., edit shift)"| AUTHCHECK
    AUTHCHECK --> MUTATION

    MUTATION --> RLSCHECK
    RLSCHECK --> ISGM
    ISGM -->|Yes| ALLOW
    ISGM -->|No| ORGMATCH
    ORGMATCH -->|No| DENY
    ORGMATCH -->|Yes| PERMCHECK
    PERMCHECK -->|Pass| ALLOW
    PERMCHECK -->|Fail| DENY

    style MW fill:#fef3c7,stroke:#d97706
    style PAGE fill:#dbeafe,stroke:#2563eb
    style ACTION fill:#dcfce7,stroke:#16a34a
    style RLS fill:#fce7f3,stroke:#db2777
    style REDIR1 fill:#fee2e2,stroke:#dc2626
    style REDIR2 fill:#fee2e2,stroke:#dc2626
    style REDIR3 fill:#fee2e2,stroke:#dc2626
    style REDIR4 fill:#fee2e2,stroke:#dc2626
    style ALLOW fill:#bbf7d0,stroke:#16a34a
    style DENY fill:#fecaca,stroke:#dc2626
```

---

## 4. Data Model (Entity Relationship Diagram)

```mermaid
erDiagram
    auth_users {
        uuid id PK
    }

    organizations {
        uuid id PK
        text name
        text slug UK "subdomain"
        text address
        text phone
        integer employee_count
        text logo_url
        text app_name
        jsonb theme_config
        jsonb landing_page_config
        text focus_area_label "custom terminology"
        text certification_label "custom terminology"
        text role_label "custom terminology"
        text timezone
        timestamptz archived_at "soft delete"
    }

    profiles {
        uuid id PK,FK "→ auth.users"
        uuid org_id FK "→ organizations"
        platform_role platform_role "gridmaster | none"
        bigint version "optimistic lock"
        boolean role_locked
    }

    organization_memberships {
        bigint id PK
        uuid user_id FK "→ auth.users"
        uuid org_id FK "→ organizations"
        org_role org_role "super_admin | admin | user"
        jsonb admin_permissions "fine-grained perms"
    }

    employees {
        uuid id PK
        uuid org_id FK "→ organizations"
        text first_name
        text last_name
        integer seniority
        text email
        text phone
        bigint certification_id FK "→ certifications"
        bigint_arr role_ids "→ organization_roles[]"
        bigint_arr focus_area_ids "→ focus_areas[]"
        employee_status status "active | benched | terminated"
        uuid user_id FK "→ auth.users (nullable)"
    }

    focus_areas {
        bigint id PK
        uuid org_id FK "→ organizations"
        text name
        text color_bg
        text color_text
        integer sort_order
        integer break_minutes
    }

    certifications {
        bigint id PK
        uuid org_id FK "→ organizations"
        text name
        text abbr
        integer sort_order
    }

    organization_roles {
        bigint id PK
        uuid org_id FK "→ organizations"
        text name
        text abbr
        integer sort_order
    }

    shift_categories {
        bigint id PK
        uuid org_id FK "→ organizations"
        text name
        text color
        time start_time
        time end_time
        bigint focus_area_id FK "→ focus_areas (nullable)"
        integer break_minutes
    }

    shift_codes {
        bigint id PK
        uuid org_id FK "→ organizations"
        text label "e.g. D, EVE, N"
        text name "e.g. Day Shift"
        text color
        text border_color
        text text_color
        bigint category_id FK "→ shift_categories"
        bigint focus_area_id FK "→ focus_areas"
        bigint_arr required_certification_ids "→ certifications[]"
        time default_start_time
        time default_end_time
        numeric default_duration_hours
        integer default_duration_minutes
    }

    absence_types {
        bigint id PK
        uuid org_id FK "→ organizations"
        text label "e.g. X, V, S"
        text name "e.g. Day Off, PTO, Sick"
        text color
        text border_color
        text text_color
        integer sort_order
    }

    shifts {
        uuid emp_id PK,FK "→ employees"
        date date PK
        uuid org_id FK "→ organizations"
        bigint version "optimistic lock"
        uuid series_id FK "→ shift_series"
        boolean from_recurring
        bigint_arr draft_shift_code_ids "→ shift_codes[]"
        bigint_arr published_shift_code_ids "→ shift_codes[]"
        boolean draft_is_delete
        bigint focus_area_id FK "→ focus_areas"
    }

    recurring_shifts {
        uuid id PK
        uuid emp_id FK "→ employees"
        uuid org_id FK "→ organizations"
        smallint day_of_week "0=Sun 6=Sat"
        bigint shift_code_id FK "→ shift_codes"
        bigint absence_type_id FK "→ absence_types"
        date effective_from
        date effective_until
    }

    shift_series {
        uuid id PK
        uuid emp_id FK "→ employees"
        uuid org_id FK "→ organizations"
        shift_series_frequency frequency "daily|weekly|biweekly"
        smallint_arr days_of_week
        date start_date
        date end_date
        bigint shift_code_id FK "→ shift_codes"
    }

    schedule_notes {
        bigint id PK
        uuid org_id FK "→ organizations"
        uuid emp_id FK "→ employees"
        date date
        integer indicator_type_id FK "→ indicator_types"
        text status "published | draft | draft_deleted"
    }

    indicator_types {
        integer id PK
        uuid org_id FK "→ organizations"
        text name
        text color
    }

    coverage_requirements {
        bigint id PK
        uuid org_id FK "→ organizations"
        bigint focus_area_id FK "→ focus_areas"
        bigint shift_code_id FK "→ shift_codes"
        smallint day_of_week "nullable = all days"
        integer min_staff
    }

    shift_requests {
        uuid id PK
        uuid org_id FK "→ organizations"
        shift_request_type type "pickup | swap"
        shift_request_status status
        uuid requester_emp_id FK "→ employees"
        date requester_shift_date
        bigint_arr requester_shift_code_ids "→ shift_codes[]"
        bigint requester_focus_area_id FK "→ focus_areas"
        time requester_custom_start_time
        time requester_custom_end_time
        uuid target_emp_id FK "→ employees (swap)"
        date target_shift_date
        bigint_arr target_shift_code_ids "→ shift_codes[]"
        bigint target_focus_area_id FK "→ focus_areas"
        time target_custom_start_time
        time target_custom_end_time
        uuid admin_user_id FK "→ auth.users"
        text admin_note
        timestamptz expires_at "72h default"
        timestamptz resolved_at
        uuid idempotency_key UK
    }

    invitations {
        uuid id PK
        uuid org_id FK "→ organizations"
        uuid invited_by FK "→ auth.users"
        text email
        org_role role_to_assign
        uuid token UK "secret link"
        timestamptz expires_at "72h default"
        uuid employee_id FK "→ employees"
    }

    role_change_log {
        uuid id PK
        uuid target_user_id FK "→ auth.users"
        uuid changed_by_id FK "→ auth.users"
        text from_role
        text to_role
        text idempotency_key UK
        text change_type "role_change | permission_change"
        jsonb permissions_before
        jsonb permissions_after
    }

    jwt_refresh_locks {
        uuid user_id PK,FK "→ auth.users"
        timestamptz locked_until
        text reason
    }

    impersonation_sessions {
        uuid session_id PK
        uuid gridmaster_id FK "→ auth.users"
        uuid target_user_id FK "→ auth.users"
        uuid target_org_id FK "→ organizations"
        timestamptz expires_at "30min default"
    }

    user_sessions {
        uuid id PK
        uuid user_id FK "→ auth.users"
        text device_label
        inet ip_address
        text refresh_token_hash UK
    }

    schedule_draft_sessions {
        uuid id PK
        uuid org_id FK,UK "→ organizations (one per org)"
        uuid saved_by FK "→ auth.users"
        date start_date
        date end_date
    }

    recurring_shifts_draft_sessions {
        uuid id PK
        uuid org_id FK,UK "→ organizations (one per org)"
        uuid saved_by FK "→ auth.users"
        jsonb draft_data
    }

    publish_history {
        uuid id PK
        uuid org_id FK "→ organizations"
        uuid published_by FK "→ auth.users"
        date start_date
        date end_date
        integer change_count
        jsonb changes
    }

    %% === RELATIONSHIPS ===

    auth_users ||--o| profiles : "has profile"
    auth_users ||--o{ organization_memberships : "belongs to orgs"
    auth_users ||--o{ user_sessions : "has sessions"
    auth_users ||--o| jwt_refresh_locks : "may have lock"

    organizations ||--o{ organization_memberships : "has members"
    organizations ||--o{ employees : "employs"
    organizations ||--o{ focus_areas : "has areas"
    organizations ||--o{ certifications : "has certs"
    organizations ||--o{ organization_roles : "has roles"
    organizations ||--o{ shift_categories : "has categories"
    organizations ||--o{ shift_codes : "has codes"
    organizations ||--o{ absence_types : "has absence types"
    organizations ||--o{ indicator_types : "has indicators"
    organizations ||--o{ coverage_requirements : "has requirements"
    organizations ||--o{ invitations : "sends invites"
    organizations ||--o{ shift_requests : "has requests"
    organizations ||--o| schedule_draft_sessions : "has draft"
    organizations ||--o| recurring_shifts_draft_sessions : "has recurring draft"
    organizations ||--o{ publish_history : "has publishes"
    organizations ||--o| impersonation_sessions : "target org"

    profiles }o--o| organizations : "primary org"

    employees ||--o{ shifts : "assigned shifts"
    employees ||--o{ recurring_shifts : "recurring patterns"
    employees ||--o{ shift_series : "shift series"
    employees ||--o{ schedule_notes : "has notes"
    employees }o--o| certifications : "certified as"
    employees }o--o| auth_users : "linked user"

    focus_areas ||--o{ shift_categories : "scoped categories"
    focus_areas ||--o{ shift_codes : "scoped codes"
    focus_areas ||--o{ coverage_requirements : "staffing rules"

    shift_categories ||--o{ shift_codes : "categorizes"
    absence_types ||--o{ recurring_shifts : "template absence"
    shift_codes ||--o{ recurring_shifts : "template code"
    shift_codes ||--o{ shift_series : "series code"
    shift_codes ||--o{ coverage_requirements : "requirement for"

    shift_series ||--o{ shifts : "generated shifts"

    indicator_types ||--o{ schedule_notes : "note type"

    invitations }o--o| employees : "links to employee"
```

---

## 5. Organization Routing & Multi-Tenancy

```mermaid
flowchart TD
    REQ["Browser Request<br/><i>https://calmhaven.dubgrid.com/schedule</i>"]

    subgraph Parse["Host Parsing (parseHost)"]
        SPLIT["Split hostname<br/>calmhaven.dubgrid.com"]
        EXTRACT["Extract:<br/>subdomain = 'calmhaven'<br/>rootDomain = 'dubgrid.com'"]
        RESERVED{"Reserved subdomain?<br/>www, login, api,<br/>admin, status, app"}
    end

    subgraph Resolve["Org Resolution"]
        JWTCLAIMS["Read JWT claims<br/>org_slug from token"]
        MATCH{"JWT org_slug<br/>== subdomain?"}
        DBQUERY["Fallback DB query:<br/>SELECT org_id, slug<br/>FROM organizations<br/>WHERE slug = subdomain"]
        MEMBERSHIP["Verify user has<br/>organization_membership<br/>for this org"]
    end

    subgraph Enforce["Tenant Isolation"]
        GMCHECK{"User is<br/>gridmaster?"}
        FORCESUB["Force redirect to<br/>user's org subdomain"]
        ALLOWCROSS["Allow cross-org<br/>access (godmode)"]
        INJECT["Set org context:<br/>x-dubgrid-org-id<br/>x-dubgrid-org-slug"]
    end

    subgraph DataScope["Data Scoping"]
        direction TB
        RLS["RLS policies enforce:<br/><code>org_id = caller_org_id()</code>"]
        TABLES["All org-scoped tables:<br/>employees, shifts, focus_areas,<br/>shift_codes, certifications,<br/>schedule_notes, etc."]
        ZERO["Zero cross-tenant<br/>data leakage"]
    end

    subgraph MultiOrg["Multi-Org Support"]
        direction TB
        MEMBERSHIPS["User can belong to<br/>multiple organizations"]
        SWITCH["switch_org(target_org_id)<br/>RPC function"]
        REFRESH["refreshSession()<br/>Get new JWT with<br/>new org context"]
        NEWDOMAIN["Redirect to<br/>new-org.dubgrid.com"]
    end

    REQ --> SPLIT
    SPLIT --> EXTRACT
    EXTRACT --> RESERVED
    RESERVED -->|"Yes (gridmaster)"| GM_ROUTE["Route to /gridmaster<br/>No org context needed"]
    RESERVED -->|"Yes (www, etc.)"| NULL_SUB["subdomain = null<br/>Root domain access"]
    RESERVED -->|"No"| JWTCLAIMS

    JWTCLAIMS --> MATCH
    MATCH -->|Yes| GMCHECK
    MATCH -->|No| DBQUERY
    DBQUERY --> MEMBERSHIP
    MEMBERSHIP -->|"Not a member"| REJECT["Redirect → /login<br/>'No access to this organization'"]
    MEMBERSHIP -->|"Is a member"| GMCHECK

    GMCHECK -->|Yes| ALLOWCROSS
    GMCHECK -->|"No + subdomain<br/>mismatch"| FORCESUB
    GMCHECK -->|"No + subdomain<br/>matches"| INJECT

    ALLOWCROSS --> INJECT
    INJECT --> RLS
    RLS --> TABLES
    TABLES --> ZERO

    MEMBERSHIPS --> SWITCH
    SWITCH --> REFRESH
    REFRESH --> NEWDOMAIN

    style Parse fill:#f0fdf4,stroke:#16a34a
    style Resolve fill:#eff6ff,stroke:#2563eb
    style Enforce fill:#fef3c7,stroke:#d97706
    style DataScope fill:#fce7f3,stroke:#db2777
    style MultiOrg fill:#f5f3ff,stroke:#7c3aed
    style REJECT fill:#fee2e2,stroke:#dc2626
    style ZERO fill:#bbf7d0,stroke:#16a34a,stroke-width:2px
```

---

## 6. Role Change & JWT Lock Mechanism

```mermaid
sequenceDiagram
    actor Admin as Super Admin
    participant UI as Admin UI
    participant RPC as change_user_role()
    participant DB as PostgreSQL
    participant Lock as jwt_refresh_locks
    participant Hook as custom_access_token_hook
    participant Target as Target User's Browser

    Admin->>UI: Change user role<br/>(e.g., user → admin)
    UI->>RPC: RPC change_user_role<br/>(target_user_id, new_role, idempotency_key)

    RPC->>DB: BEGIN TRANSACTION
    RPC->>DB: UPDATE organization_memberships<br/>SET org_role = 'admin'
    RPC->>DB: UPDATE profiles<br/>SET version = version + 1
    RPC->>DB: INSERT role_change_log<br/>(from_role, to_role, idempotency_key)
    RPC->>Lock: INSERT jwt_refresh_locks<br/>(user_id, locked_until = NOW() + 5s,<br/>reason = 'role_change')
    RPC->>DB: COMMIT

    RPC-->>UI: Success

    Note over Target,Hook: Meanwhile, target user's token expires...

    Target->>Hook: Token refresh attempt<br/>(automatic by Supabase client)
    Hook->>Lock: SELECT * FROM jwt_refresh_locks<br/>WHERE user_id = target AND locked_until > NOW()

    alt Lock is active (within 5s window)
        Hook->>Lock: DELETE expired locks (cleanup)
        Hook-->>Target: HTTP 403 — "Your session has expired. Please sign in again."
        Target->>Target: Auth error → redirect to /login
        Target->>Hook: User re-authenticates (signInWithPassword)
        Hook->>DB: Resolve fresh claims (new role = admin)
        Hook-->>Target: New JWT with org_role = 'admin'
    else Lock expired (after 5s)
        Hook->>Lock: DELETE expired lock
        Hook->>DB: Resolve fresh claims normally
        Hook-->>Target: New JWT with org_role = 'admin'
    end

    Note over Admin,Target: User now operates with new role
```

---

## 7. Schedule Draft/Publish Workflow

```mermaid
flowchart LR
    subgraph Draft["Draft Phase"]
        EDIT["Admin edits shifts<br/>(drag/drop/type)"]
        DRAFTCODES["draft_shift_code_ids<br/>updated in shifts table"]
        SAVE["Auto-save draft session<br/>(schedule_draft_sessions)"]
        PREVIEW["Visual diff:<br/>draft vs published"]
    end

    subgraph Publish["Publish Phase"]
        PUB["Admin clicks Publish"]
        VALIDATE["Validate changes<br/>(coverage requirements)"]
        COPY["Copy draft → published<br/>published_shift_code_ids =<br/>draft_shift_code_ids"]
        CLEAR["Clear draft flags<br/>draft_is_delete = false"]
        LOG["Insert publish_history<br/>(changes JSONB, date range)"]
    end

    subgraph Realtime["Realtime Updates"]
        RT["Supabase Realtime<br/>broadcasts changes"]
        USERS["All connected users<br/>see updated schedule"]
    end

    EDIT --> DRAFTCODES
    DRAFTCODES --> SAVE
    SAVE --> PREVIEW
    PREVIEW --> PUB
    PUB --> VALIDATE
    VALIDATE --> COPY
    COPY --> CLEAR
    CLEAR --> LOG
    LOG --> RT
    RT --> USERS

    style Draft fill:#fef3c7,stroke:#d97706
    style Publish fill:#dbeafe,stroke:#2563eb
    style Realtime fill:#dcfce7,stroke:#16a34a
```

---

## 8. Password Reset & Email Verification Flow

```mermaid
sequenceDiagram
    actor User
    participant ForgotPage as /forgot-password
    participant SupaAuth as Supabase Auth
    participant Email as Email (Resend)
    participant ResetPage as /reset-password
    participant VerifyPage as /verify-email

    Note over User,VerifyPage: === PASSWORD RESET FLOW ===

    User->>ForgotPage: Navigate to /forgot-password
    User->>ForgotPage: Enter email address
    ForgotPage->>SupaAuth: resetPasswordForEmail(email,<br/>redirectTo: /reset-password)

    Note over ForgotPage: Email enumeration protection:<br/>Always shows "Check your email"<br/>regardless of email existence

    ForgotPage-->>User: "Check Your Email" confirmation
    SupaAuth->>Email: Send password reset link
    Email-->>User: Email with reset link

    User->>ResetPage: Click link → /reset-password?token=...
    ResetPage->>SupaAuth: Listen for PASSWORD_RECOVERY event

    alt Valid token (event fires)
        SupaAuth-->>ResetPage: PASSWORD_RECOVERY event received
        ResetPage-->>User: Show reset form
        User->>ResetPage: Enter new password (min 10 chars)
        ResetPage->>ResetPage: Validate: strength meter,<br/>confirmation match
        ResetPage->>SupaAuth: updateUser({ password })
        SupaAuth-->>ResetPage: Success
        ResetPage->>SupaAuth: signOut({ scope: 'local' })
        ResetPage-->>User: "Password reset successful"<br/>Redirect to /login
    else Invalid/expired token (5s timeout)
        ResetPage-->>User: "Invalid or expired link"<br/>Link to /forgot-password
    end

    Note over User,VerifyPage: === EMAIL VERIFICATION FLOW ===

    User->>VerifyPage: Redirected after invitation acceptance
    VerifyPage-->>User: "Verify your email" message
    VerifyPage->>SupaAuth: Listen for SIGNED_IN event

    alt User clicks resend
        User->>VerifyPage: Click "Resend Verification Email"
        VerifyPage->>SupaAuth: resend({ type: 'signup', email })
        Note over VerifyPage: 60-second cooldown<br/>before next resend
    end

    SupaAuth-->>VerifyPage: SIGNED_IN event (email confirmed)
    VerifyPage-->>User: Auto-redirect to /dashboard
```

---

## 9. Organization Setup & Onboarding Flow

```mermaid
flowchart TD
    INVITE["Super Admin sends invitation<br/>(employee_id + email + role)"]
    EMAIL["Invitation email sent<br/>via /api/send-invite-email"]
    ACCEPT["User clicks link →<br/>/accept-invite?token=uuid"]
    VALIDATE{"Token valid?<br/>Not expired?<br/>Not accepted?"}
    CREATE["Create Supabase auth user<br/>Set employees.user_id<br/>Create organization_membership"]
    VERIFY["Redirect → /verify-email<br/>Wait for email confirmation"]
    ONBOARD["Redirect → /onboarding<br/>Poll for org assignment<br/>(every 15s, max 5 min)"]

    subgraph SetupGuard["SetupGuard Component"]
        SETUP_CHECK{"Org setup<br/>complete?"}
        SETUP["Redirect → /setup<br/>Admin setup wizard"]
        CHECKLIST["Setup checklist:<br/>✓ Add employees<br/>✓ Configure focus areas<br/>✓ Set up shift codes<br/>✓ Publish schedule"]
        COMPLETE{"All steps done +<br/>≥1 employee?"}
    end

    DASHBOARD["Redirect → /dashboard<br/>Fully operational"]

    INVITE --> EMAIL
    EMAIL --> ACCEPT
    ACCEPT --> VALIDATE
    VALIDATE -->|No| REJECT["Error: Invalid/expired invite"]
    VALIDATE -->|Yes| CREATE
    CREATE --> VERIFY
    VERIFY --> ONBOARD
    ONBOARD --> SETUP_CHECK
    SETUP_CHECK -->|"No (admin)"| SETUP
    SETUP --> CHECKLIST
    CHECKLIST --> COMPLETE
    COMPLETE -->|No| CHECKLIST
    COMPLETE -->|Yes| DASHBOARD
    SETUP_CHECK -->|Yes| DASHBOARD
    SETUP_CHECK -->|"No (user)"| WAIT["Show waiting message:<br/>'Your organization is<br/>being set up'"]

    style REJECT fill:#fee2e2,stroke:#dc2626
    style DASHBOARD fill:#bbf7d0,stroke:#16a34a
    style SetupGuard fill:#f0fdf4,stroke:#16a34a
```

---

## Quick Reference: Defense in Depth

```mermaid
flowchart LR
    subgraph L1["Layer 1: Edge"]
        MW["Middleware<br/>Route guards<br/>Subdomain enforcement<br/>JWT verification"]
    end

    subgraph L2["Layer 2: Application"]
        PERMS["usePermissions()<br/>UI-level feature flags<br/>Server Action auth checks"]
    end

    subgraph L3["Layer 3: Database"]
        RLSP["RLS Policies<br/>is_gridmaster()<br/>caller_org_id()<br/>check_admin_permission()"]
    end

    subgraph L4["Layer 4: JWT Hook"]
        HOOK["custom_access_token_hook<br/>Claims injection<br/>Refresh lock enforcement<br/>Archived org filtering"]
    end

    L1 -->|"passes"| L2
    L2 -->|"queries"| L3
    L4 -->|"feeds claims to"| L1

    style L1 fill:#fef3c7,stroke:#d97706
    style L2 fill:#dbeafe,stroke:#2563eb
    style L3 fill:#fce7f3,stroke:#db2777
    style L4 fill:#dcfce7,stroke:#16a34a
```
