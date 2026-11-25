# Switching the staff app from the App Home extension to an iframe app

Written 25 November 2026. Status: **Phase 0 passed live (25 Nov). Phase 1 built (25 Nov): all 21 pages are server routes; waiting for push and the Phase 2 live walk-through.** Decisions answered by the user on 25 Nov: trial cutover on the dev store yes; React 19 upgrade yes; new delivery features paused until the switch is done; Render stays awake once all features are complete and tested.

## Why

The staff app is one App Home UI extension (`extensions/cfs-orders-dashboard`). Shopify caps it at 64 KB compressed and allows only one App Home per app. We are at about 65.1 KB of a 65.5 KB limit (see `memory/project-extension-size-limit.md`), and about 20 delivery pages plus more features are still to come. The only way past the limit that keeps every page inside Shopify admin is the **iframe model**: Shopify embeds pages served by our own server (Render). Shopify's docs name this as the route for an app that outgrows the extension. The two models cannot be mixed, so the switch is all-or-nothing at one moment (the cutover).

## Goals, non-goals

**Goals**
- Every page stays inside Shopify admin (menu and sidebar around it).
- No bundle size limit on staff pages; Maxpro and the other delivery pages can be built without trimming.
- No behaviour change for staff: same pages, same buttons, same data, same permissions.
- Reuse what exists: the ~1,250 dashboard tests and ~830 backend tests, all server routes, the database, emails, the two other extensions (`cfs-order-status`, `cfs-order-status-update`).

**Non-goals**
- Redesigning pages, or rewriting them to use server loaders and actions. That can be done page by page later; it is not needed for the switch.
- Public distribution of the app.

**Anti-goal:** staff losing pages for days. The old version must stay one command away from coming back (see Rollback).

## What exists today (measured)

- 42 page and component files (`.jsx`, about 4,800 lines) and 34 helper modules (`.ts`, about 3,400 lines, plus tests) in the extension.
- 21 routes in `AppHome.jsx`.
- The extension-specific parts are few: `preact` / `preact/hooks` imports, `preact-iso` routing (one page uses `useLocation`), `shopify:admin/...` links (3), the `shopify:admin/api/graphql.json` endpoint (status saves, order detail), and relative `api/...` calls (Shopify adds the session token).
- The server is already a React Router 7 app with `@shopify/app-bridge-react`, `shopify-app-react-router` (`authenticate.admin`, online tokens for verified staff), `/auth/*`, and every `/api/*` route the pages use. It has no page routes (`_index.jsx` just says "CFS Orders backend"). `shopify.app.toml` already has `embedded = true` and `embedded_app_direct_api_access = true`, so an iframe page can still call `shopify:admin/api/graphql.json` directly.
- Server is on React 18.3.

## Approaches considered

1. **Port the existing components as they are (recommended).** Move the extension's `src` into `app/ui`, make the server build treat `preact/hooks` as `react`, wrap each page in a thin route file, and keep calling the `/api/*` routes. Mostly mechanical; keeps the tests; lowest risk.
2. **Rewrite every page with server loaders and actions.** Cleaner long term, but it throws away working, tested code and is far slower. Possible later, page by page, once things are stable.
3. **Stay in the extension and trim / ask Shopify for an exception.** No work now, but the limit returns with every new page. Kept as the fallback only.

## Plan

### Phase 0: trial cutover on the dev store (1 session)

Purpose: prove the assumptions in the Risks table with two real pages before porting the rest.
1. Add the server shell: `app/routes/app.jsx` (layout: `authenticate.admin`, App Bridge / Polaris `AppProvider`, optional `s-app-nav`), make `_index` hand over to `/app`.
2. Port two pages: Dashboard and Delivery Booked (one simple, one with downloads, selection and server saves).
3. Upgrade the server to React 19 if Polaris web-component properties (checked, disabled) or `onChange` / `onInput` misbehave on React 18.
4. Deploy a version **without** the App Home extension and open the app in the dev store.
5. Gate: both pages load, show data, save, download, and the signed-in staff member is verified. If not, roll back (below) and stop, or adjust.

The dev store is test data only and not yet in daily use, so a short gap is acceptable. Rollback is releasing the previous app version (`shopify app release --version <previous>`), which brings the extension back unchanged.

### Phase 1: move and port everything (2 sessions, no effect on the live app)

All of it is additive until the cutover:
1. `git mv` `extensions/cfs-orders-dashboard/src` to `app/ui` (tests move with their files; update the vitest configs so both suites still run).
2. Build config: `preact/hooks` resolves to `react`; the JSX runtime follows the app, not the old extension `tsconfig`.
3. One route file per page (21): `/orders-by-brand` becomes `/app/orders-by-brand`, `/orders/:id` becomes `/app/orders/:id`, and so on. Replace `preact-iso` links and `useLocation` with React Router's. Replace `shopify:admin/orders/...` links.
4. The dashboard cards and every in-page link point at the new paths. Add the app navigation (sidebar entries) as a small bonus.
5. Keep `callBackend` / `callBackendResult` working with App Bridge's authenticated `fetch`. Because pages are now same-origin, CSV downloads can later become plain downloads (optional simplification of the signed export links).
6. Tests: all existing suites still pass; add a small test per route file only where wiring is non-trivial.

### Phase 2: cutover and live regression (2 to 3 sessions)

1. Deploy the version without the extension (this is the same step as Phase 0 step 4, now with all pages).
2. Walk every page on `#1038` and fix what only shows live. Checklist (one line each in `progress.md`): Orders list, Orders by Brand, Order Detail (every section), Refunds, Reports, Stock, Containers, SBTS, Supplier Chase-up, Date Lapsed, Suppliers, Permissions, Van and Driver Management, Book Delivery, Delivery Booking, Delivery Booked (export, Pick List, Driver Sheet, Mark Completed), Brand Terms, Email Templates, Dashboard.
3. Confirm from a non-admin staff account that permissions still limit what they can change.

### Phase 3: clean up (1 session)

Delete the extension folder and its size workarounds (`size.sh`, the "keep logic on the server" rule becomes a preference, not a limit), update `docs/guide.md` and the project notes, remove the unused client message tables if wanted.

### Phase 4: resume the delivery build

Maxpro page and exports, Load pre-fill from the Maxoptra file, the other delivery pages, Area Management, and the rest of the backlog, with no size limit.

**Estimate (rough, not a promise):** 6 to 8 working sessions to reach the end of Phase 3, mostly live checking in Phase 2.

## Rollback

- Before the cutover: nothing live changes.
- After: release the previous app version in Shopify (restores the extension and all pages as they were). The server stays compatible with both models because its `/api/*` routes do not change.
- The only data risk is none: no database change is planned.

## Risks to check in Phase 0

| Assumption | If wrong |
|---|---|
| Polaris web components work from React with the props and events the pages use (`checked`, `disabled`, `onChange`, `onInput`) | Upgrade the server to React 19 (designed for custom elements) |
| `s-*` components used today (`s-table`, `s-date-field`, `s-search-field`, `s-banner`, ...) all exist in the iframe build of Polaris | Swap for the nearest component, page by page |
| `shopify:admin/api/graphql.json` direct calls still work in the iframe (the toml enables it) | Route those saves through the server (the Mark Completed code already shows how) |
| Client `fetch` to `/api/*` carries the session token and the verified staff member | Use App Bridge `idToken()` and an explicit header |
| Staff sign-in on the first page load (online token redirect) is smooth | Tune the auth route; this is the standard template flow |
| Render cold start (about 14 seconds seen) now delays the first page of a session, not just its data | Make the server non-sleeping; already on the going-live list, now required |

## Phase 0 as built (25 Nov 2026)

- Server upgraded to React 19.3.1. Server shell: `app/routes/_staff.jsx` (authenticates, loads Polaris and App Bridge, draws pages in the browser only, sidebar links); `_index.jsx` redirects to `/dashboard` keeping the query string; pages at `/dashboard` and `/delivery-booked` (`_staff.dashboard.jsx`, `_staff.delivery-booked.jsx`). Pages keep their old paths (no `/app` prefix), so no link had to change.
- `app/ui/` is a copy of the extension's `src` (no tests) with `preact/hooks` replaced by `react`, `../../cfs-order-status/src` replaced by `../../extensions/cfs-order-status/src`, and `callBackend` made absolute (`api/x` becomes `/api/x`, because pages sit at different depths). The extension's own source is untouched, so tests still run there. In Phase 1 the copy becomes the single source.
- Found: React 19 ignores `onChange` on custom elements and listens for `Dismiss` instead of `dismiss`. Fixed centrally by `app/ui/jsx` (a JSX runtime that lowercases `onXxx` on `s-*` tags), switched on in `react-router.vite.config.js` (`esbuild.jsxImportSource = cfs-jsx`; Vite ignores a nested tsconfig for `.jsx`). Tested in `app/ui/jsx/jsx-runtime.test.js`.
- The extension is switched off for the trial by renaming `extensions/cfs-orders-dashboard/shopify.extension.toml` to `.toml.off`. Rename it back to bring the extension into the next deploy.
- Checked: build passes, 838 backend tests pass, new routes answer like the existing API routes (410 without a Shopify session token). Not yet checked: anything inside Shopify admin.
- Rollback: `shopify app release --version cfs-order-status-panel-75` (the live version when the trial started).

## Phase 1 as built (25 Nov 2026)

- All pages are routes under the `_staff` frame (`app/routes/_staff*.jsx`): Orders (`/`), Orders by Brand, Order detail (`/orders/:id`), Refunds, Reports, Stock, Containers, SBTS, Supplier Chase-up, Date Lapsed, Suppliers, Permissions, Vans, Drivers, Book Delivery, Delivery Booking, Delivery Booked, Brand terms, Email templates, Dashboard, plus a new Settings page and a not-found page. Sidebar: Dashboard, Orders by Brand, Delivery Booking, Delivery Booked, Settings.
- `app/ui` is the single source; its 34 test files moved with it (`vitest.backend.config.js` now includes `.test.ts`). 1121 app tests plus 135 order-status tests pass.
- `BookDeliveryPage` now uses React Router's `useNavigate`. The old extension folder `extensions/cfs-orders-dashboard` is inert (manifest renamed to `.toml.off`) and is to be deleted by the user (the assistant's delete was blocked); the root `test` script no longer runs it.
- Still to check live (Phase 2): the order page's status save (direct `shopify:admin/api/graphql.json` calls) and `shopify://admin/...` links, every page's controls, a non-admin staff account.

## Decisions needed from you

1. Trial cutover on the dev store (with the one-command rollback) is acceptable.
2. OK to upgrade the server to React 19 if the trial needs it.
3. Pause new delivery features (Maxpro and the rest) while this runs.
4. Render must stay awake before real staff use the app (a paid instance or a keep-alive).

## What is not changing

Database, emails, `/api/*` routes, permissions, the two order-page extensions, the signed export links (until optionally simplified), `docs/guide.md` content for staff.
