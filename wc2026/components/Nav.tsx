"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/groups", label: "Groups" },
  { href: "/results", label: "Results" },
  { href: "/bracket", label: "Bracket" },
  { href: "/stats", label: "Stats" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        <span>World<b>Cup</b></span>
        <span className="yr">26</span>
      </Link>
      <div className="nav-links">
        {LINKS.map(l => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={active ? "active" : ""}>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
