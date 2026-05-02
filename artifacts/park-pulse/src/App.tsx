import { Switch, Route, Router as WouterRouter } from "wouter";
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
        <div className="pp-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "3rem", color: "#2D6A4F" }}>404</h1>
            <p>Page not found.</p>
            <a href="/" style={{ color: "#2D6A4F", marginTop: "1rem", display: "inline-block" }}>Go home</a>
          </div>
        </div>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}
