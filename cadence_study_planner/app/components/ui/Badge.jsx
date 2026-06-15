/**
 * Small pill label used for priorities, statuses, and forecast verdicts.
 */
const VARIANT_STYLES = {
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
};

export default function Badge({ children, variant = "slate", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
        VARIANT_STYLES[variant] || VARIANT_STYLES.slate
      } ${className}`}
    >
      {children}
    </span>
  );
}
