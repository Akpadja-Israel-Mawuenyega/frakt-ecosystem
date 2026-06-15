import { BarChart3 } from "lucide-react";

import Card from "../ui/Card";

/**
 * Renders a Frakt-generated SVG chart, with graceful fallbacks for the
 * cases where Frakt isn't configured or couldn't render the chart
 * (e.g. not enough history yet for a forecast).
 *
 * Shared by the student progress page and the admin traffic analytics page.
 */
export default function ChartCard({ title, subtitle, chart, className = "" }) {
  return (
    <Card hover className={`p-6 ${className}`}>
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {subtitle && <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">{subtitle}</p>}

      <div className="mt-4 min-h-[120px] flex items-center justify-center">
        {chart.configured && chart.svg ? (
          <div
            className="w-full"
            // Frakt-rendered SVG from our own sandboxed template — see lib/frakt/client.js
            dangerouslySetInnerHTML={{ __html: chart.svg }}
          />
        ) : chart.status === 400 ? (
          <div className="text-center py-6">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400 italic">
              Not enough history yet to render this chart. Check back soon.
            </p>
          </div>
        ) : chart.error ? (
          <div className="text-center py-6">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400 italic">
              Chart unavailable right now.
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400 italic">
              Chart rendering isn&apos;t configured for this environment.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
