import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function NotFound() {
  return (
    <div className="pp-page">
      <Navbar />
      <main className="pp-notfound-main">
        <p className="pp-notfound-code" aria-hidden="true">404</p>
        <h1 className="pp-notfound-title">Page not found</h1>
        <p className="pp-notfound-text">
          That page doesn&rsquo;t exist. The parks themselves are still right where you left them.
        </p>
        <div className="pp-notfound-actions">
          <Link href="/explore" className="pp-btn pp-btn-primary">Explore parks</Link>
          <Link href="/" className="pp-btn pp-btn-outline">Go home</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}