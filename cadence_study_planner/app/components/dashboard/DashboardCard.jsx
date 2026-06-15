import Link from "next/link";

import Card from "../ui/Card";

/**
 * Icon badge background/foreground colors, keyed by `accent`.
 */
const ACCENT_STYLES = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300",
};

/**
 * Small metric/summary tile used across the dashboard.
 *
 * Renders a label, a large primary value, and an optional supporting
 * line, with an accent icon badge. When `href` is provided, the whole
 * card becomes a link to the relevant section of the app. Pass
 * `variant="gradient"` for a highlighted call-to-action tile.
 *
 * @param {object} props
 * @param {string} props.title - Short label (e.g. "Upcoming Sessions").
 * @param {string|number} props.value - Primary, large value.
 * @param {string} [props.subtitle] - Supporting detail shown below the value.
 * @param {string} [props.href] - Optional link target for the whole card.
 * @param {Function} [props.icon] - Optional lucide-react icon component.
 * @param {string} [props.accent] - Icon badge color, one of ACCENT_STYLES.
 * @param {"default"|"gradient"} [props.variant] - Visual style.
 */
export default function DashboardCard({
  title,
  value,
  subtitle,
  href,
  icon: Icon,
  accent = "brand",
  variant = "default",
}) {
  if (variant === "gradient") {
    const content = (
      <div className="relative overflow-hidden h-full rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-brand-500/25 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-white/80">{title}</h2>
            <p className="text-2xl font-bold mt-2">{value}</p>
            {subtitle && (
              <p className="text-white/70 text-sm mt-2">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
          )}
        </div>
      </div>
    );

    if (!href) return content;

    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  const content = (
    <Card hover={!!href} className="p-6 h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h2>
          <p className="text-3xl font-bold mt-2 text-slate-900 dark:text-slate-100">{value}</p>
          {subtitle && (
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-2">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              ACCENT_STYLES[accent] || ACCENT_STYLES.brand
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </Card>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}
