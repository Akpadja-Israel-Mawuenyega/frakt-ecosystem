"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

import Sidebar from "../components/dashboard/Sidebar";
import Navbar from "../components/dashboard/Navbar";

/**
 * Shared shell for every authenticated route (`/dashboard`, `/planner`,
 * `/admin/*`, etc).
 *
 * Centralizes the sign-in redirect that each page previously implemented
 * on its own, and wraps page content with the Sidebar + Navbar so the
 * app is navigable beyond whatever links a page happens to render.
 */
export default function AppLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Admins land on the admin console rather than the student dashboard,
   * but student pages remain reachable if they navigate there directly.
   */
  const isAdminOnDashboard =
    status === "authenticated" &&
    session?.user?.role === "admin" &&
    pathname === "/dashboard";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (isAdminOnDashboard) {
      router.replace("/admin/timetable");
    }
  }, [status, isAdminOnDashboard, router]);

  if (status === "loading" || status === "unauthenticated" || isAdminOnDashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-gradient text-slate-500 dark:text-slate-400">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20 animate-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <p className="text-sm">Loading Cadence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
