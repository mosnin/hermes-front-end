import { Instrument_Sans } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { ActiveSpaceProvider } from "@/components/active-space";
import { ThemeProvider } from "@/components/theme";
import { ToastProvider } from "@/components/toast";
import { DialogProvider } from "@/components/dialog";
import { CommandPalette } from "@/components/command-palette";
import { GlobalActionsProvider } from "@/components/global-actions";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { PageTransition } from "@/components/site/motion";

// The dashboard is authenticated and entirely client-driven (Clerk + Convex
// live queries). It must never be statically prerendered at build time — doing
// so requires build-time auth secrets and produces nothing useful. Force every
// dashboard route to render dynamically at request time.
export const dynamic = "force-dynamic";

// The application shell reads the same editorial grotesk as the marketing
// site and auth wall. Scoped to this route tree via a CSS variable (the
// (site) route group loads its own copy under the same variable name);
// app/globals.css falls back to it ahead of the site's copy and the system
// stack, so the whole authenticated app renders in Instrument Sans.
const appFont = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-app",
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <ActiveSpaceProvider>
        <ToastProvider>
          <DialogProvider>
            <GlobalActionsProvider>
              <div className={`${appFont.variable} app-light h-screen bg-background text-foreground`}>
                <a href="#main-content" className="skip-link">
                  Skip to content
                </a>
                <div className="flex h-full overflow-hidden">
                  <Sidebar />
                  <main id="main-content" className="flex-1 overflow-y-auto bg-background">
                    {/* `PageTransition` is a client boundary that persists across
                        client-side navigations within this layout (layouts don't
                        remount the way route templates do), so its internal
                        AnimatePresence gets a real chance to run both the exit
                        of the old route and the enter of the new one, keyed by
                        pathname. This is the shared primitive every lane's
                        surface reads through; consuming it here (rather than a
                        bespoke enter-only transition) keeps the whole app on one
                        page-transition vocabulary. */}
                    <PageTransition className="h-full">{children}</PageTransition>
                  </main>
                </div>
                <CommandPalette />
                <ShortcutsHelp />
              </div>
            </GlobalActionsProvider>
          </DialogProvider>
        </ToastProvider>
      </ActiveSpaceProvider>
    </ThemeProvider>
  );
}
