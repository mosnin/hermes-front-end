import { AdminShell } from "@/components/admin/admin-shell";

// Admin surface is authenticated + gated server-side in every query
// (requirePlatformAdmin, fail-closed). Never statically prerendered.
export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
