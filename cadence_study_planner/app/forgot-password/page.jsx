"use client";

import { useState } from "react";
import Link from "next/link";

import { Sparkles, Mail, ArrowLeft } from "lucide-react";

import ThemeToggle from "../components/ThemeToggle";

/**
 * ───────────────────────────── FORGOT PASSWORD PAGE ─────────────────────────────
 *
 * Requests a password reset link for an account's email. Always shows a
 * generic confirmation message, regardless of whether the email is
 * registered, so this page can't be used to enumerate accounts.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
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
              Forgot your password?
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
              Enter your email and we&apos;ll send you a link to reset it.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 text-sm animate-fade-in">
              {error}
            </div>
          )}

          {submitted ? (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 p-4 text-sm animate-fade-in">
              If an account exists for <strong>{email}</strong>, we&apos;ve
              sent a password reset link. Check your inbox.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white py-3 rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {loading ? "Sending..." : "Send reset link"}
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
