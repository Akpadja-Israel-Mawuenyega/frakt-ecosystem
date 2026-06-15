/**
 * Base card surface shared across dashboard/planner/profile/progress/admin
 * pages — consistent radius, border, and shadow, with optional hover lift
 * and entrance animation.
 */
export default function Card({
  children,
  className = "",
  hover = false,
  animate = false,
  style,
}) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm ${
        hover
          ? "transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 hover:border-brand-100 dark:hover:border-brand-900"
          : ""
      } ${animate ? "animate-fade-in-up" : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
