import {
  LayoutDashboard,
  CalendarClock,
  LineChart,
  UserCircle,
  Grid3x3,
  Activity,
  Layers,
} from "lucide-react";

/**
 * Shared navigation link config, consumed by both the desktop Sidebar
 * and the mobile Navbar menu so the two stay in sync.
 */

/**
 * Primary navigation links available to every signed-in user.
 */
export const NAV_LINKS = [
  { href: "/dashboard", label: "Overview", exact: true, icon: LayoutDashboard },
  { href: "/planner", label: "Study Planner", icon: CalendarClock },
  { href: "/dashboard/progress", label: "My Progress", icon: LineChart },
  { href: "/dashboard/profile", label: "Academic Profile", icon: UserCircle },
];

/**
 * Additional links only shown to users with the "admin" role.
 */
export const ADMIN_LINKS = [
  { href: "/admin/timetable", label: "Timetable Engine", icon: Grid3x3 },
  { href: "/admin/course-demands", label: "Course Demands", icon: Layers },
  { href: "/admin/analytics", label: "Traffic Analytics", icon: Activity },
];

/**
 * Determines whether a nav link should be styled as active for the
 * current path. Exact links only match their own path; section links
 * also match their own sub-routes (e.g. "/planner/123").
 */
export const isActiveLink = (pathname, { href, exact }) => {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
};

/**
 * Resolves a human-readable title for the current path, used by the
 * Navbar to show context without each page repeating its own heading.
 */
export const getPageTitle = (pathname) => {
  const allLinks = [...NAV_LINKS, ...ADMIN_LINKS];
  const match = allLinks.find((link) => isActiveLink(pathname, link));
  return match?.label || "Cadence";
};
