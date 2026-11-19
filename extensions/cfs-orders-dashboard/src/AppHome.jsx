import { render } from 'preact';
import { ErrorBoundary, LocationProvider, Route, Router } from 'preact-iso';
import OrderDetailPage from './OrderDetailPage.jsx';
import OrdersByBrand from './OrdersByBrand.jsx';

export default async () => {
  render(<App />, document.body);
};

function NotFound() {
  return (
    <s-page heading="Page not found">
      <s-section>
        <s-link href="/">Back to Orders by Brand</s-link>
      </s-section>
    </s-page>
  );
}

function App() {
  return (
    <LocationProvider>
      <ErrorBoundary>
        <Router>
          <Route path="/" component={OrdersByBrand} />
          <Route path="/orders/:id" component={OrderDetailPage} />
          <Route default component={NotFound} />
        </Router>
      </ErrorBoundary>
    </LocationProvider>
  );
}
