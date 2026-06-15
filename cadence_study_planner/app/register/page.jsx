"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Sparkles, User, Mail, Lock } from "lucide-react";

import ThemeToggle from "../components/ThemeToggle";

/**
 * ───────────────────────────── REGISTER PAGE ─────────────────────────────
 * Flow:
 * 1. User creates account via backend API (/api/register)
 * 2. If successful, auto-login using NextAuth credentials provider
 * 3. Redirect to dashboard
 */
export default function RegisterPage() {
  const router = useRouter();

  /**
   * ───────────────────────────── STATE ─────────────────────────────
   */
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * ───────────────────── HANDLE INPUT ─────────────────────
   */
  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  /**
   * ───────────────────── REGISTER FLOW ─────────────────────
   */
  const handleRegister = async (e) => {
    e.preventDefault();

    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      /**
       * 1. Create account in backend
       */
      const res = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Registration failed");
        setLoading(false);
        return;
      }

      /**
       * 2. Auto-login after successful registration
       */
      const loginResult = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (loginResult?.error) {
        setError("Account created, but login failed. Please sign in.");
        setLoading(false);
        return;
      }

      /**
       * 3. Redirect user
       */
      router.push("/dashboard");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * ───────────────────────────── UI ─────────────────────────────
   */
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
              Create your account
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
              Join Cadence Study Planner today.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 text-sm animate-fade-in">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
                  placeholder="Enter your name"
                />
              </div>
            </div>

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
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
                  placeholder="Create password"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  name="confirmPassword"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
                  placeholder="Confirm password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white py-3 rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          {/* Login link */}
          <p className="text-sm text-center text-slate-500 dark:text-slate-400 mt-6">
            Already have an account?
            <Link
              href="/login"
              className="ml-1 text-brand-600 dark:text-brand-400 font-semibold hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
