# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Add the CFS Orders App Home extension: Orders by Brand table (brand, line status, search and "No expected date" filters, expected date and delivery columns) and an Order Detail page at `/orders/<id>` that saves statuses (with the order-status proposal when all items share one status), expected dates, delivery confirmed / declined, internal notes and instructions. Nothing is emailed; Email options are shown disabled.
- Status record schema version 2 (optional `expected`, `delivery`, `instructions`; new history entry types). Version 1 records still load and are upgraded on first write. Saving In Stock clears that line's expected date and records it in the history.
- Accepted on Urban Deco Dev (#1036): status, expected date, delivery, note and instructions saves, header proposal and declining it, Cancelled refund link, stale edit refused from a second tab, and history older than 20 entries archived and listed under Show older history. Archived history lives in the app-owned type `$app:cfs_status_history`, created from `shopify.app.toml` on deploy; run the deploy before the first save in a new store. Unit tests (status 100, dashboard 32) and `npx shopify app build` pass.

- Update app-tools and app-home to the stable 2026-10 API version and matching UI extension types.
