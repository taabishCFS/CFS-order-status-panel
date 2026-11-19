// Used by Render's health check and by us to confirm a deploy can reach the database.
export async function checkHealth(db) {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
