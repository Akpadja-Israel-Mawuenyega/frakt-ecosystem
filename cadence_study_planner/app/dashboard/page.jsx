"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <div className="p-10 text-gray-500">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Welcome, {session?.user?.name} 👋
        </h1>

        <p className="text-gray-600 mt-1">Role: {session?.user?.role}</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="font-semibold">Study Plan</h2>
          <p className="text-gray-500 text-sm mt-2">
            View your weekly schedule
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="font-semibold">Courses</h2>
          <p className="text-gray-500 text-sm mt-2">Manage enrolled courses</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="font-semibold">AI Assistant</h2>
          <p className="text-gray-500 text-sm mt-2">
            Generate optimized study plans
          </p>
        </div>
      </div>
    </div>
  );
}
