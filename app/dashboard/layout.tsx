import { Sidebar } from "@/components/sidebar";
import { ActiveSpaceProvider } from "@/components/active-space";
import { ThemeProvider } from "@/components/theme";
import { ToastProvider } from "@/components/toast";
import { DialogProvider } from "@/components/dialog";
import { CommandPalette } from "@/components/command-palette";

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
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
            <CommandPalette />
          </DialogProvider>
        </ToastProvider>
      </ActiveSpaceProvider>
    </ThemeProvider>
  );
}
