import { useEffect } from "react";

/**
 * One-shot entrance for marked blocks as they enter the viewport.
 *
 * The markup stays readable without JavaScript: elements are only hidden once
 * this hook has run (`html.reveal-ready`), and reduced-motion users never see a
 * hidden state at all. Reveals fire once — a section that has been read does not
 * re-animate when it scrolls back into view.
 */
export function useRevealOnScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || typeof IntersectionObserver === "undefined") return;

    root.classList.add("reveal-ready");
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    const scan = () => {
      for (const el of document.querySelectorAll("[data-reveal]")) {
        if (seen.has(el)) continue;
        seen.add(el);
        observer.observe(el);
      }
    };

    scan();

    // Ledger rows and recents arrive after their data resolves; watch for them
    // rather than re-running the observer on every render.
    const mutations = new MutationObserver(() => scan());
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);
}
