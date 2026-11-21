import { Link } from "@tanstack/react-router";

const LINK =
  "text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:font-medium data-[status=active]:text-foreground";

/** The app's pages, in the AppShell's bar. */
export function Nav() {
  return (
    <nav className="flex min-w-0 items-center gap-4 overflow-x-auto">
      <Link to="/" className={LINK} activeOptions={{ exact: true }}>
        Sessions
      </Link>
      <Link to="/repos" className={LINK}>
        Repositories
      </Link>
      <Link to="/knowledge" className={LINK}>
        Knowledge
      </Link>
    </nav>
  );
}
