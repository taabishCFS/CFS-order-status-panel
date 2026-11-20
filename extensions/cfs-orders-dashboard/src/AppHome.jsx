import { render } from 'preact';
import { ErrorBoundary, LocationProvider, Route, Router } from 'preact-iso';
import EmailTemplatesPage from './EmailTemplatesPage.jsx';
import OrderDetailPage from './OrderDetailPage.jsx';
import OrdersByBrand from './OrdersByBrand.jsx';
import OrdersByOrder from './OrdersByOrder.jsx';

export default async () => {
  render(<App />, document.body);
};

function NotFound() {
  return (
    <s-page heading="Page not found">
      <s-section>
        <s-link href="/">Back to Orders</s-link>
      </s-section>
    </s-page>
  );
}

function App() {
  return (
    <LocationProvider>
      <ErrorBoundary>
        <Router>
          <Route path="/" component={OrdersByOrder} />
          <Route path="/orders-by-brand" component={OrdersByBrand} />
          <Route path="/orders/:id" component={OrderDetailPage} />
          <Route path="/email-templates" component={EmailTemplatesPage} />
          <Route default component={NotFound} />
        </Router>
      </ErrorBoundary>
    </LocationProvider>
  );
}
