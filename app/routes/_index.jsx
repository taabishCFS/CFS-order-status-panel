import { redirect } from "react-router";

// Shopify opens the app here. Until every page is ported the Dashboard is the start page; the query string
// (shop, host, session token) travels with the redirect so the sign-in still works.
export const loader = ({ request }) => {
  const { search } = new URL(request.url);
  return redirect(`/dashboard${search}`);
};
