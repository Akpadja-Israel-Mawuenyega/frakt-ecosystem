"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";

import { NAV_LINKS, ADMIN_LINKS, isActiveLink } from "./navLinks";

/**
 * Derives up to two initials from a display name for the avatar badge.
 */
const getInitials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

/**
 * Left-hand navigation shell for the authenticated app.
 *
 * Renders the primary student links for everyone, and an additional
 * "Admin" section for users whose session role is "admin".
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAdmin = session?.user?.role === "admin";
  const links = isAdmin ? ADMIN_LINKS : NAV_LINKS;
  const homeHref = isAdmin ? "/admin/timetable" : "/dashboard";

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-screen">
      {/* Brand */}
      <div className="px-6 py-6">
        <Link href={homeHref} className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight leading-tight dark:text-slate-100">
              Cadence
            </p>
            <p className="text-xs text-slate-400 leading-tight">
              {isAdmin ? "Admin Console" : "Study Planner"}
            </p>
          </div>
        </Link>
      </div>

      {/* Links */}
      <nav className="flex-1 px-3 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActiveLink(pathname, link);

          return (
            <Link
              key={link.href}
              href={link.href}
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

      {/* Signed-in user */}
      {session?.user && (
        <div className="px-3 pb-5">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {getInitials(session.user.name) || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate dark:text-slate-100">
                {session.user.name}
              </p>
              <p className="text-xs text-slate-400 capitalize leading-tight">
                {session.user.role}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
