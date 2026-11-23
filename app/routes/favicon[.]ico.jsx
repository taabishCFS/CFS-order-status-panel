// Browsers ask for /favicon.ico when a page opens in its own tab (the printable documents, the CSV downloads). The app has no icon, so answer "nothing here" quietly instead of logging a 404 error.
export const loader = () => new Response(null, { status: 204, headers: { "cache-control": "public, max-age=86400" } });
