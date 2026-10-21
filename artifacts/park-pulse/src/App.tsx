import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { ToastProvider } from "@/context/ToastContext";

// Route-level code splitting (audit S1.4): each page is its own chunk,
// so a visitor landing on "/" does not download Leaflet, the Explore
// page or its GeoJSON until they actually navigate to the map.
const Home = lazy(() => import("@/pages/Home"));
const Explore = lazy(() => import("@/pages/Explore"));
const About = lazy(() => import("@/pages/About"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Amenities = lazy(() => import("@/pages/Amenities"));
const Compare = lazy(() => import("@/pages/Compare"));
const Atlas = lazy(() => import("@/pages/Atlas"));
const Contribute = lazy(() => import("@/pages/Contribute"));
const ContributionStatus = lazy(() => import("@/pages/ContributionStatus"));
const ContributionReview = lazy(() => import("@/pages/ContributionReview"));
const NotFound = lazy(() => import("@/pages/not-found"));

/** Minimal route-transition placeholder. Lives in index.css (.pp-route-loader). */
function PageLoader() {
  return (
    <div className="pp-route-loader" role="status" aria-label="Loading page">
      <span className="pp-route-loader-pulse" aria-hidden="true" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/explore" component={Explore} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/amenities" component={Amenities} />
        <Route path="/compare" component={Compare} />
        <Route path="/atlas" component={Atlas} />
        {/* Static contribution paths precede the :id route so a status lookup
            can never be swallowed by the detail page. */}
        <Route path="/contribute" component={Contribute} />
        <Route path="/contribute/status" component={ContributionStatus} />
        <Route path="/contribute/review" component={ContributionReview} />
        <Route path="/contribute/status/:id" component={ContributionStatus} />
        <Route path="/about" component={About} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </ToastProvider>
  );
}
