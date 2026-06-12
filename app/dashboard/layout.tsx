import { Sidebar } from "@/components/sidebar";
import { ActiveSpaceProvider } from "@/components/active-space";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ActiveSpaceProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </ActiveSpaceProvider>
  );
}
