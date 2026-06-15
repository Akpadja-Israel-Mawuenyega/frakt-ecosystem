import { Inter } from "next/font/google";

import "./globals.css";
import Providers from "./Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Cadence — Study Planner",
  description: "AI-powered study planning, progress analytics, and traffic insights.",
};

// Runs before paint to apply the saved theme and avoid a light-mode flash.
const THEME_INIT_SCRIPT = `
  (function () {
    var stored = localStorage.getItem('theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  })();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
