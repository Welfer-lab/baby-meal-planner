# Supabase Shared Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Supabase-backed multi-device sync with one shared magic-link login so the family can use the same baby meal data across phones.

**Architecture:** Keep the existing local state model and cache in `localStorage`, but add a cloud sync layer in `src/main.js` that authenticates with Supabase, loads one shared JSON document from a `shared_state` table, writes updates back with debounce, and subscribes to realtime updates. Use a generated runtime config file so Vercel can inject `SUPABASE_URL` and `SUPABASE_ANON_KEY` at build time without adding a bundler.

**Tech Stack:** Static PWA, browser-side Supabase JS v2 CDN, Vercel build-time env injection, PostgreSQL JSONB row in Supabase.

---

### Task 1: Add failing tests for runtime config and auth UI hooks

**Files:**
- Modify: `tests/state.test.js`

**Step 1: Write the failing tests**

Add assertions for:
- `src/main.js` references auth actions like `send-magic-link` and `sign-out`
- `src/runtime-config.js` exists and exports Supabase config
- `README.md` or setup docs mention `SUPABASE_URL` and `SUPABASE_ANON_KEY`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test --test-name-pattern "supabase|magic link|runtime config" tests/state.test.js
```

Expected: FAIL because the files and strings do not exist yet.

**Step 3: Write minimal implementation**

Create placeholder config/docs references only after the tests fail.

**Step 4: Run test to verify it passes**

Run the same command and confirm PASS.

**Step 5: Commit**

```bash
git add tests/state.test.js src/runtime-config.js README.md
git commit -m "test: cover supabase runtime config hooks"
```

### Task 2: Generate runtime config at build time

**Files:**
- Create: `src/runtime-config.js`
- Modify: `scripts/build.mjs`
- Modify: `package.json`
- Modify: `vercel.json`
- Test: `tests/state.test.js`

**Step 1: Write the failing test**

Add test coverage asserting:
- `scripts/build.mjs` writes `dist/src/runtime-config.js`
- build script reads `SUPABASE_URL` and `SUPABASE_ANON_KEY`

**Step 2: Run test to verify it fails**

```bash
node --test --test-name-pattern "runtime config" tests/state.test.js
```

Expected: FAIL because build-time config generation is missing.

**Step 3: Write minimal implementation**

- Create `src/runtime-config.js` with empty defaults for local development
- Update `scripts/build.mjs` to generate `dist/src/runtime-config.js` using env vars
- Keep the app working when env vars are absent

**Step 4: Run test to verify it passes**

```bash
node --test --test-name-pattern "runtime config" tests/state.test.js
npm run build
```

Expected: PASS and `dist/src/runtime-config.js` exists.

**Step 5: Commit**

```bash
git add src/runtime-config.js scripts/build.mjs package.json vercel.json tests/state.test.js
git commit -m "feat: generate supabase runtime config at build"
```

### Task 3: Add shared auth and cloud sync layer

**Files:**
- Modify: `src/main.js`
- Create: `docs/supabase-setup.md`
- Test: `tests/state.test.js`

**Step 1: Write the failing test**

Add tests asserting:
- `src/main.js` includes auth actions like `send-magic-link`
- `src/main.js` renders sync/auth UI copy like `共享登录`
- `docs/supabase-setup.md` mentions `shared_state`

**Step 2: Run test to verify it fails**

```bash
node --test --test-name-pattern "magic link|shared_state|共享登录" tests/state.test.js
```

Expected: FAIL because auth/sync UI and setup docs do not exist.

**Step 3: Write minimal implementation**

- Load Supabase client from CDN only when config is present
- Create shared cloud state controller in `src/main.js`
- Add auth gate UI for shared magic-link login
- On login, fetch or initialize one `shared_state` row
- On local commits, debounce upload to Supabase
- Subscribe to realtime updates and merge latest cloud state into the app

**Step 4: Run test to verify it passes**

```bash
node --test --test-name-pattern "magic link|shared_state|共享登录" tests/state.test.js
node --check src/main.js
```

Expected: PASS with no syntax errors.

**Step 5: Commit**

```bash
git add src/main.js docs/supabase-setup.md tests/state.test.js
git commit -m "feat: add shared supabase auth and sync"
```

### Task 4: Add UI styling for sync/auth states

**Files:**
- Modify: `styles.css`
- Test: `tests/state.test.js`

**Step 1: Write the failing test**

Add tests for new UI hooks such as:
- `.auth-shell`
- `.sync-status-card`
- `.sync-pill`

**Step 2: Run test to verify it fails**

```bash
node --test --test-name-pattern "auth-shell|sync-status-card|sync-pill" tests/state.test.js
```

Expected: FAIL because the styles do not exist yet.

**Step 3: Write minimal implementation**

- Style a friendly single-purpose login card
- Add lightweight sync status UI in settings
- Keep the visual language aligned with the existing mobile PWA

**Step 4: Run test to verify it passes**

```bash
node --test --test-name-pattern "auth-shell|sync-status-card|sync-pill" tests/state.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add styles.css tests/state.test.js
git commit -m "style: add auth and sync status interface"
```

### Task 5: Document Supabase setup end-to-end

**Files:**
- Modify: `README.md`
- Modify: `docs/supabase-setup.md`

**Step 1: Write the failing test**

Add assertions that setup docs mention:
- creating the `shared_state` table
- enabling magic link email auth
- setting Vercel env vars

**Step 2: Run test to verify it fails**

```bash
node --test --test-name-pattern "shared_state|SUPABASE_URL|magic link" tests/state.test.js
```

Expected: FAIL if setup text is still incomplete.

**Step 3: Write minimal implementation**

- Add a concise quickstart to `README.md`
- Add full SQL + dashboard steps to `docs/supabase-setup.md`

**Step 4: Run test to verify it passes**

```bash
node --test --test-name-pattern "shared_state|SUPABASE_URL|magic link" tests/state.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/supabase-setup.md tests/state.test.js
git commit -m "docs: add supabase setup guide"
```

### Task 6: Final verification

**Files:**
- Verify only

**Step 1: Run focused tests**

```bash
node --test --test-name-pattern "supabase|magic link|runtime config|shared_state|auth-shell|sync-status-card|sync-pill" tests/state.test.js
```

Expected: PASS.

**Step 2: Run build and syntax checks**

```bash
npm run build
node --check src/main.js
node --check src/state.js
node --check scripts/build.mjs
```

Expected: all commands succeed.

**Step 3: Note residual risk**

Document that live login flow and realtime sync still require a real Supabase project and Vercel env vars to verify in-browser.

**Step 4: Commit**

```bash
git add .
git commit -m "feat: support shared supabase sync"
```
