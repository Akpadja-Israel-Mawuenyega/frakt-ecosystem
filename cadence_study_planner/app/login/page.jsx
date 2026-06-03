"use client";

import { useState } from "react";

import { signIn } from "next-auth/react";

import { useRouter } from "next/navigation";

/**
 * ───────────────────────────── LOGIN PAGE ─────────────────────────────
 * Supports:
 * - Email/password login
 * - Google OAuth login
 * - Role-based redirect preparation
 *
 * NextAuth handles:
 * - Session persistence
 * - JWT management
 * - OAuth flow
 */
export default function LoginPage() {
  const router = useRouter();

  /**
   * ───────────────────────────── STATE ─────────────────────────────
   */
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  /**
   * ───────────────────── HANDLE INPUT CHANGES ─────────────────────
   */
  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  /**
   * ───────────────────── EMAIL LOGIN PIPELINE ─────────────────────
   */
  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);

    setError("");

    /**
     * Call NextAuth credentials provider.
     */
    const result = await signIn("credentials", {
      email: formData.email,

      password: formData.password,

      redirect: false,
    });

    setLoading(false);

    /**
     * Login failed.
     */
    if (result?.error) {
      setError(result.error);

      return;
    }

    /**
     * Login successful.
     * Later:
     * - admin → /admin
     * - student → /dashboard
     */
    router.push("/dashboard");
  };

  /**
   * ───────────────────── GOOGLE OAUTH LOGIN ─────────────────────
   */
  const handleGoogleLogin = async () => {
    await signIn("google", {
      callbackUrl: "/dashboard",
    });
  };

  /**
   * ───────────────────────────── UI ─────────────────────────────
   */
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 via-white to-gray-200 p-6">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white/80 backdrop-blur-xl border border-gray-200 shadow-xl rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
            <p className="text-gray-500 mt-2 text-sm">
              Sign in to continue to Cadence Study Planner
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 p-3 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-black focus:border-black transition"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-black focus:border-black transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white py-3 rounded-xl font-medium hover:bg-gray-900 active:scale-[0.99] transition"
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 uppercase">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 py-3 rounded-xl font-medium hover:bg-gray-50 transition"
          >
            <span className="text-sm">Continue with Google</span>
          </button>

          {/* Footer */}
          <p className="text-sm text-center text-gray-500 mt-6">
            Don&apos;t have an account?
            <a
              href="/register"
              className="ml-1 text-black font-semibold hover:underline"
            >
              Create account
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
