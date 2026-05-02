import { Switch, Route, Router as WouterRouter } from "wouter";
import { ToastProvider } from "@/context/ToastContext";
import Home from "@/pages/Home";
import Explore from "@/pages/Explore";
import About from "@/pages/About";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/explore" component={Explore} />
      <Route path="/about" component={About} />
      <Route>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: "1rem" }}>
          <h1 style={{ fontSize: "3rem", color: "var(--pp-primary)" }}>404</h1>
          <p style={{ color: "var(--pp-text-secondary)" }}>Page not found.</p>
          <a href="/" style={{ color: "var(--pp-primary)" }}>Go home</a>
        </div>
      </Route>
    </Switch>
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
