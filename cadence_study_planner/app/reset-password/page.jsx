"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

import { Sparkles, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";

import ThemeToggle from "../components/ThemeToggle";

/**
 * ───────────────────────────── RESET PASSWORD PAGE ─────────────────────────────
 *
 * Reads the reset token from ?token= and lets the user set a new
 * password. Wrapped in Suspense because useSearchParams requires it
 * for static rendering.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Something went wrong. Please try again.");
        return;
      }

      setSuccess(true);

      /**
       * Automatically sign the user back in with their new password,
       * then drop them straight into the dashboard.
       */
      setRedirecting(true);

      const signInResult = await signIn("credentials", {
        email: data.email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        // Reset succeeded but auto sign-in failed — fall back to manual sign-in.
        setRedirecting(false);
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-app-gradient p-6">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md animate-scale-in">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Cadence
          </span>
        </Link>

        {/* Card */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Reset your password
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
              Choose a new password for your account.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 text-sm animate-fade-in">
              {error}
            </div>
          )}

          {success ? (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 p-4 text-sm animate-fade-in">
              {redirecting ? (
                "Your password has been reset. Signing you in…"
              ) : (
                <>
                  Your password has been reset.{" "}
                  <Link href="/login" className="font-semibold underline">
                    Sign in
                  </Link>{" "}
                  with your new password.
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  New password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-11 py-3 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
                    placeholder="Repeat password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white py-3 rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {loading ? "Resetting..." : "Reset password"}
              </button>
            </form>
          )}

          {/* Back to login */}
          <p className="text-sm text-center text-slate-500 dark:text-slate-400 mt-6">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-brand-600 dark:text-brand-400 font-semibold hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
