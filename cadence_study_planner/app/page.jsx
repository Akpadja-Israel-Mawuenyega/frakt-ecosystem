import Link from "next/link";
import {
  Sparkles,
  Calendar,
  LineChart,
  BookOpen,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

import ThemeToggle from "./components/ThemeToggle";

const FEATURES = [
  {
    icon: Calendar,
    title: "AI Study Planner",
    description:
      "Generate a balanced weekly study plan tailored to your enrolled courses, automatically scheduled around your workload.",
  },
  {
    icon: LineChart,
    title: "Progress & Predictive Insights",
    description:
      "Visualize your weekly study activity and velocity, with AI forecasts that surface your preparedness for upcoming exams.",
  },
  {
    icon: BookOpen,
    title: "Academic Resource Search",
    description:
      "Search OpenAlex for relevant papers and save them to your profile to ground your AI study plan in real research.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent Audit Trail",
    description:
      "Every action is logged and, for admins, aggregated into traffic analytics and forecasts powered by Frakt.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-app-gradient">
      {/* Top nav */}
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight dark:text-slate-100">Cadence</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm font-medium bg-slate-900 dark:bg-brand-600 text-white px-4 py-2 rounded-xl hover:bg-slate-800 dark:hover:bg-brand-500 transition"
          >
            Get started
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 sm:pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 border border-brand-100 dark:border-brand-800 rounded-full px-4 py-1.5 mb-6 animate-fade-in">
          <Sparkles className="w-3.5 h-3.5" />
          AI-powered study planning, now with predictive insights
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-slate-100 animate-fade-in-up">
          Find your <span className="text-gradient-brand">study rhythm</span>.
        </h1>

        <p className="mt-6 text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto animate-fade-in-up animation-delay-100">
          Cadence builds your weekly study plan, tracks your progress, and
          forecasts your preparedness — so you always know where you stand.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4 animate-fade-in-up animation-delay-200">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:-translate-y-0.5 transition-all duration-300"
          >
            Create your account
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-xl font-medium border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-800 transition"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(({ icon: Icon, title, description }, i) => (
            <div
              key={title}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-brand-600 dark:text-brand-300" />
              </div>
              <h3 className="font-semibold mb-2 dark:text-slate-100">{title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-8 border-t border-slate-100 dark:border-slate-800 text-center text-sm text-slate-400">
        Cadence Study Planner · Academic Year 2025/2026
      </footer>
    </main>
  );
}
