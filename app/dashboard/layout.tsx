import { Sidebar } from "@/components/sidebar";
import { ActiveSpaceProvider } from "@/components/active-space";
import { ThemeProvider } from "@/components/theme";
import { ToastProvider } from "@/components/toast";
import { DialogProvider } from "@/components/dialog";
import { CommandPalette } from "@/components/command-palette";
import { GlobalActionsProvider } from "@/components/global-actions";

// The dashboard is authenticated and entirely client-driven (Clerk + Convex
// live queries). It must never be statically prerendered at build time — doing
// so requires build-time auth secrets and produces nothing useful. Force every
// dashboard route to render dynamically at request time.
export const dynamic = "force-dynamic";

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
              <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto">{children}</main>
              </div>
              <CommandPalette />
            </GlobalActionsProvider>
          </DialogProvider>
        </ToastProvider>
      </ActiveSpaceProvider>
    </ThemeProvider>
  );
}
