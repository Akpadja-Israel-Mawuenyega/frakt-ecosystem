"use client";

import { useEffect, useState } from "react";

import { signIn } from "next-auth/react";

import { useRouter } from "next/navigation";
import Link from "next/link";

import { Sparkles, Mail, Lock, Eye, EyeOff } from "lucide-react";

const REMEMBERED_EMAIL_KEY = "cadence_remembered_email";

import ThemeToggle from "../components/ThemeToggle";

/**
 * Official Google "G" mark, used on the OAuth button.
 */
function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}

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

  const [showPassword, setShowPassword] = useState(false);

  const [rememberMe, setRememberMe] = useState(false);

  /**
   * ───────────────── PREFILL REMEMBERED EMAIL ─────────────────
   */
  useEffect(() => {
    const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);

    if (rememberedEmail) {
      setFormData((prev) => ({ ...prev, email: rememberedEmail }));
      setRememberMe(true);
    }
  }, []);

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
      setError(
        result.error === "CredentialsSignin"
          ? "Invalid email or password."
          : result.error
      );

      return;
    }

    /**
     * Remember (or forget) the email for next time.
     */
    if (rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, formData.email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome back</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
              Sign in to continue to Cadence Study Planner
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 text-sm animate-fade-in">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
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
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-11 py-3 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
                  placeholder="••••••••"
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

            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 dark:bg-slate-800"
              />
              Remember me
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white py-3 rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-slate-400 uppercase">or</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 py-3 rounded-xl font-medium dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <GoogleIcon />
            <span className="text-sm">Continue with Google</span>
          </button>

          {/* Footer */}
          <p className="text-sm text-center text-slate-500 dark:text-slate-400 mt-6">
            Don&apos;t have an account?
            <Link
              href="/register"
              className="ml-1 text-brand-600 dark:text-brand-400 font-semibold hover:underline"
            >
              Create account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
