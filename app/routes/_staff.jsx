import { useEffect, useState } from "react";
import { Outlet, isRouteErrorResponse, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

// The staff app's frame: signs the staff member in through Shopify, loads Polaris and App Bridge, and shows the page.
// Every staff page (Dashboard, Delivery Booked, ...) is a child of this route.
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function StaffLayout() {
  const { apiKey } = useLoaderData();
  // The pages draw themselves in the browser (they fetch their data there), so the server sends only the frame.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/dashboard">Dashboard</s-link>
        <s-link href="/orders-by-brand">Orders by Brand</s-link>
        <s-link href="/book-delivery">Delivery Booking</s-link>
        <s-link href="/delivery-booked">Delivery Booked</s-link>
        <s-link href="/settings">Settings</s-link>
      </s-app-nav>
      {ready ? <Outlet /> : null}
    </AppProvider>
  );
}

// Shopify needs these to carry the sign-in through redirects and to keep the page embeddable.
// On a first visit Shopify's sign-in answers with a short "bounce" page (status 200) that fetches a session token and reloads.
// boundary.error spots that answer by its class name, which the minified browser bundle renames, so in the browser it threw the
// answer on and React Router showed a bare "200". isRouteErrorResponse does not depend on the name, so the bounce page shows and reloads.
export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) return <div dangerouslySetInnerHTML={{ __html: error.data || "Handling response" }} />;
  return boundary.error(error);
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
