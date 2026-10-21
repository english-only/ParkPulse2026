/**
 * Primary destinations, shared by the header and the footer.
 *
 * These two navigations previously drifted: the footer listed Amenities,
 * Compare and the Atlas while the header showed only three routes, so the
 * footer looked like the real sitemap and the header like a partial one. One
 * list is the fix — a destination cannot appear in one and be missing from the
 * other, and adding a route is a single edit.
 */
export interface NavDestination {
  href: string;
  /** Short label for the header, where space is scarce. */
  label: string;
  /** Full label for the footer, where the destination can be described. */
  footerLabel: string;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { href: "/explore", label: "Explore", footerLabel: "Explore parks and amenities" },
  { href: "/contribute", label: "Contribute", footerLabel: "Add a place to the map" },
  { href: "/amenities", label: "Amenities", footerLabel: "Amenities directory" },
  { href: "/compare", label: "Compare", footerLabel: "Compare parks" },
  { href: "/atlas", label: "Atlas", footerLabel: "Data atlas" },
  { href: "/dashboard", label: "Insights", footerLabel: "Insights" },
  { href: "/about", label: "About", footerLabel: "About and data sources" },
] as const;

/** True when `href` is the current route (or a child of it). */
export function isCurrentRoute(location: string, href: string): boolean {
  if (href === "/") return location === "/" || location === "";
  return location === href || location.startsWith(`${href}/`) || location.startsWith(`${href}?`);
}
