// Any address that is not a page: a short message with a way back, inside the staff frame.
export default function NotFound() {
  return (
    <s-page heading="Page not found">
      <s-section>
        <s-link href="/">Back to Orders</s-link>
      </s-section>
    </s-page>
  );
}
