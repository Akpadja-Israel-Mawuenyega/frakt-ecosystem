"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Guards every `/admin/*` route, redirecting non-admin users back to
 * their dashboard. The parent (app) layout already handles the
 * unauthenticated/loading states, so this only needs to check role.
 */
export default function AdminLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (status === "authenticated" && !isAdmin) {
      router.push("/dashboard");
    }
  }, [status, isAdmin, router]);

  if (status !== "authenticated" || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  return children;
}
