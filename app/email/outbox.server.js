// The email queue and send log in one table (EmailOutbox). enqueueEmails writes rows, processQueue sends them.

const MAX_ATTEMPTS = 3;
const STUCK_AFTER_MS = 5 * 60_000;
const BATCH = 50;
const HOUR_MS = 60 * 60_000;

/** Creates one row per draft. A repeated dedupeKey creates nothing and returns the existing rows. */
export async function enqueueEmails(db, drafts) {
  const rows = [];
  try {
    for (const data of drafts) rows.push(await db.emailOutbox.create({ data }));
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await db.emailOutbox.findMany({
      where: { shop: drafts[0].shop, dedupeKey: { in: drafts.map((d) => d.dedupeKey) } },
      orderBy: { createdAt: "asc" },
    });
    return { rows: existing, duplicate: true };
  }
  return { rows, duplicate: false };
}

/** Sends what is due. Returns counts; never throws for a failed send (the row records it). */
export async function processQueue(db, { provider, config, now = new Date() }) {
  const result = { sent: 0, failed: 0, skipped: 0, deferred: 0 };
  if (!config.enabled) return result;

  await db.emailOutbox.updateMany({
    where: { status: "sending", claimedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    data: { status: "queued" },
  });

  const due = await db.emailOutbox.findMany({
    where: { status: "queued", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  if (due.length === 0) return result;

  const real = config.mode !== "log";
  let sentThisHour = real
    ? await db.emailOutbox.count({ where: { status: "sent", mode: { in: ["test", "live"] }, sentAt: { gte: new Date(now.getTime() - HOUR_MS) } } })
    : 0;

  for (const row of due) {
    if (real && sentThisHour >= config.maxPerHour) {
      result.deferred += 1;
      continue;
    }
    const claim = await db.emailOutbox.updateMany({ where: { id: row.id, status: "queued" }, data: { status: "sending", claimedAt: now } });
    if (claim.count !== 1) continue;

    const recipient = row.recipient?.trim();
    if (!recipient) {
      await db.emailOutbox.update({ where: { id: row.id }, data: { status: "skipped", error: "no_recipient" } });
      result.skipped += 1;
      continue;
    }
    if (config.mode === "test" && !config.allowlist.includes(recipient.toLowerCase())) {
      await db.emailOutbox.update({ where: { id: row.id }, data: { status: "skipped", error: "not_on_allowlist" } });
      result.skipped += 1;
      continue;
    }

    let outcome;
    try {
      outcome = await provider.send({ from: row.from, replyTo: row.replyTo ?? undefined, to: [recipient], subject: row.subject, html: row.html });
    } catch (error) {
      outcome = { ok: false, error: `Send crashed: ${error?.message ?? error}`, retryable: true };
    }
    const attempts = row.attempts + 1;

    if (outcome.ok) {
      await db.emailOutbox.update({
        where: { id: row.id },
        data: { status: "sent", attempts, mode: config.mode, providerId: outcome.id, sentAt: now, error: null },
      });
      result.sent += 1;
      if (real) sentThisHour += 1;
    } else if (outcome.retryable && attempts < MAX_ATTEMPTS) {
      await db.emailOutbox.update({
        where: { id: row.id },
        data: { status: "queued", attempts, error: outcome.error, nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60_000) },
      });
    } else {
      await db.emailOutbox.update({ where: { id: row.id }, data: { status: "failed", attempts, error: outcome.error } });
      result.failed += 1;
    }
  }
  return result;
}

/** Puts a failed row back in the queue. Other statuses and other shops' rows are left alone. */
export async function retryEmail(db, { shop, id }) {
  const { count } = await db.emailOutbox.updateMany({
    where: { id, shop, status: "failed" },
    data: { status: "queued", attempts: 0, error: null, nextAttemptAt: new Date() },
  });
  return { ok: count === 1 };
}
