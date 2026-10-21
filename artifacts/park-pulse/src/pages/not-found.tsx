import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

/**
 * 404 — a real page, not a dead end.
 *
 * The only route that cannot show data, so it says what happened, keeps the
 * 404 figure as the composition's one loud element, and offers the two places
 * a visitor actually wants: the map and home.
 */
export default function NotFound() {
  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <div className="fa-empty-page">
            <p className="fa-empty-code" aria-hidden="true">
              404
            </p>
            <h1 className="fa-display pp-notfound-title">Page not found</h1>
            <p className="fa-lede">
              That page doesn&rsquo;t exist. The parks themselves are still right where you left
              them — every record the build serves is on the map.
            </p>
            <div className="fa-empty-actions">
              <Link href="/explore" className="fa-btn fa-btn--primary">
                Explore parks
              </Link>
              <Link href="/" className="fa-btn fa-btn--secondary">
                Go home
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
