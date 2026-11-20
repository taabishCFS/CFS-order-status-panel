# Resend setup for the CFS Orders backend (development email)

Status (21 November 2026): the backend email module is **built** (templates, queue, worker, Resend provider). It stays off until the Render variables below are set. The Resend account uses region **Tokyo** for development (accepted for now; revisit before production). Acceptance on the dev store is still to do (see "Acceptance" at the end).

## Variables the backend reads (set on Render only, never in the repo)

| Variable | Value |
|---|---|
| `MAIL_PROVIDER` | `resend` (`log` also works and needs nothing else; `smtp` is not built yet) |
| `MAIL_MODE` | `log` first (nothing is sent, the rendered email is recorded), then `test`. `live` is refused unless `APP_ENV=production` |
| `APP_ENV` | `development` |
| `RESEND_API_KEY` | the key from Resend (sending access, limited to the domain) |
| `MAIL_FROM_ADDRESS` | `orders@orders.cfsonline.co.uk` (the sender name shown is each site's, for example "Customer Service CFS UK") |
| `MAIL_TEST_ALLOWLIST` | your own address(es), comma separated. In `test` mode only these receive email; the Email templates "Send test" goes only here |
| `EMAIL_MAX_PER_HOUR` | `50` |
| `INTERNAL_COPY_TO` | optional: one internal address that gets a copy of each customer email |

Settings are re-read every 30 seconds, so changing a variable and redeploying is enough; no code change.

## Why Resend, and where
- Development and staging send through **Resend** (free plan: 3,000 emails a month, 100 a day). Production sends through CFS's own SMTP server (`mail.cfsonline.co.uk`). Both sit behind one setting, `MAIL_PROVIDER`.
- Resend is for the dev store only. It must never email a real customer: the backend refuses `live` mode outside production, and `test` mode sends only to an allow-list.

## The problem we hit
Resend asked for these DNS records on `cfsonline.co.uk`:

| Type | Name | Value |
|---|---|---|
| TXT | `resend._domainkey` | the DKIM key Resend shows (starts `p=MIGf...`) |
| CNAME | `rsend` | `rsend-apne1.forge.rmta.net` |
| CNAME | `send` | `send.forge.rmta.net` |

The domain team cannot use the name `send`: it is already used for something else on that domain. Nothing else in the list clashes.

## Options (pick one)
Sources: Resend docs on [custom return path](https://resend.com/docs/dashboard/domains/custom-return-path) and [Resend Forge](https://resend.com/docs/resend-forge).

**Option 1 (recommended): verify a subdomain, not the root domain.**
1. In Resend, add the domain `dev.cfsonline.co.uk` (or `orders.cfsonline.co.uk`) instead of `cfsonline.co.uk`.
2. All records then sit under that subdomain (for example `send.dev`), so they cannot clash with the root domain's records.
3. Dev emails come from an address like `orders@dev.cfsonline.co.uk`, which nobody mistakes for real customer mail.

**Option 2: choose a different return-path name.**
- Resend's docs say the return-path name is set **when the domain is created** (Advanced options when adding the domain, or the API's `custom_return_path`) and cannot be edited afterwards. To change it, delete the domain in Resend and add it again with a name such as `rbounce`.
- Your records point at `forge.rmta.net`, and Resend's Forge docs describe a **Change** button next to the Return-Path when its subdomain already has records. If you see that button, use it. Otherwise delete and re-add.
- Name rules: up to 63 characters, starts with a letter, ends with a letter or number. Both `<name>` and `r<name>` records must be added.

## Steps (Option 1)
1. Resend dashboard, Domains, Add Domain: enter the subdomain, region EU (Ireland) if offered. Delete the old `cfsonline.co.uk` entry if it was already added.
2. Send the DNS records Resend shows to the domain team. Tell them: add only these records, change nothing existing.
3. In Resend, click Verify. DNS can take from minutes to a day.
4. Create an API key: Resend, API Keys, Create, permission "Sending access", limited to that domain.
5. Put the secrets in Render's environment only (never in the repo):

| Variable | Value |
|---|---|
| `MAIL_PROVIDER` | `resend` |
| `MAIL_MODE` | `test` |
| `MAIL_TEST_ALLOWLIST` | your own address(es), comma separated |
| `RESEND_API_KEY` | the key from step 4 |
| `APP_ENV` | `development` |
| `EMAIL_MAX_PER_HOUR` | for example `50` |

6. Redeploy (see Acceptance below).

## Until the domain is verified
Resend lets an unverified account send only from `onboarding@resend.dev`, and only to the account owner's own email. That is enough to prove the `resend` provider works: set `MAIL_FROM_ADDRESS` to that address for the first test.

## Open items
- The Resend account and domain are not created yet.
- CFS SMTP details for production are still with the mail server owner (limits, DKIM, whether outside servers may log in). See `Orders-module/phased-plan.md` Phase 0.
- Production DMARC is `p=none` today; tighten it in Phase 8.

## Acceptance on the dev store (to run after the variables are set, Render redeployed, and `shopify app deploy` run)
1. **Log mode** (`MAIL_MODE=log`): on a dev order set status 3 with Email the customer ticked. The order's Emails list shows one customer row, Sent, mode log. Press Save twice quickly: still one row.
2. **Test mode** (`MAIL_MODE=test`): give a dev order an allow-listed customer email, send status 3 and status 10: the mail arrives from Resend with the layout and a Reply-To. An order whose email is not allow-listed shows Skipped. Set `MAIL_MODE=live` with `APP_ENV=development`: the Emails list shows sending is off (live_outside_production).
3. **Editing**: on Email templates, edit the status 3 subject with a reason, Preview, Send test, then send the real status 3 email: it uses the new text. Restore version 1: the next email uses the old text. An unknown placeholder is refused.
4. **Failure**: set a wrong `RESEND_API_KEY`: the row ends Failed with Resend's message; Retry works after the key is fixed.
