"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Menu, X, LogOut } from "lucide-react";

import { NAV_LINKS, ADMIN_LINKS, isActiveLink, getPageTitle } from "./navLinks";
import ThemeToggle from "../ThemeToggle";

/**
 * Top bar for the authenticated app shell.
 *
 * Shows the current section title and signed-in user, provides the
 * sign-out action, and exposes a dropdown menu containing the full
 * navigation on small screens where the Sidebar is hidden.
 */
export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = session?.user?.role === "admin";
  const links = isAdmin ? ADMIN_LINKS : NAV_LINKS;

  return (
    <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 md:px-8 h-16">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {getPageTitle(pathname)}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {session?.user && (
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">
                {session.user.name}
              </p>
              <p className="text-xs text-slate-400 capitalize leading-tight">
                {session.user.role}
              </p>
            </div>
          )}

          <ThemeToggle />

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center gap-1.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>

      {/* Mobile nav menu */}
      {menuOpen && (
        <nav className="md:hidden border-t border-slate-200 dark:border-slate-800 px-4 py-3 space-y-1 animate-slide-down">
          {links.map((link) => {
            const Icon = link.icon;
            const active = isActiveLink(pathname, link);

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white shadow-lg shadow-brand-500/20"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${active ? "text-white" : "text-slate-400"}`}
                />
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
