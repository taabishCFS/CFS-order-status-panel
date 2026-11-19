# Production configuration notes (verified staff identity)

Status: **notes only, 19 November 2026.** Nothing here has been deployed or tested. The CFS Advanced store has not been bought yet.

## What production needs that Urban Deco Dev does not
- A **separate app in the CFS organisation**, with its own client ID. Urban Deco Dev's app (`cc5a6db0aaacb62a9604019b7e02b338`) belongs to the Urban Deco UK dev organisation. Do not copy its client ID.
- The `read_users` scope, so the panel can read the signed-in staff member:

```toml
[access_scopes]
scopes = "read_orders,write_orders,read_users"
```

- Shopify Support must **enable `read_users` for the app** on the Advanced store (Shopify's documentation: the scope needs a Plus or Advanced store and must be enabled on request). Declaring it on a store without that approval makes `shopify app dev` fail, which is what happened on Urban Deco Dev (Basic App Development).
- `shopify app deploy` applies the metaobject definition `$app:cfs_status_entry` (with `order_id` filterable) already declared in `shopify.app.toml`.

## Behaviour until the scope is enabled
The dialog cannot read the staff member, so it asks for a typed name and labels those history entries "(unverified)". Do not describe those names as verified.

## Decide at go-live
Once `read_users` works in production, decide whether to refuse saves when the staff lookup fails instead of falling back to a typed name.
