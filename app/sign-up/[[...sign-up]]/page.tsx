import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "../../sign-in/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Create account"
      title="Set up your workspace"
      subtitle="Bring your first agent online in minutes."
      headline="Govern autonomy with real guardrails."
      bodyCopy="Budgets, approvals, and a full audit trail come standard, so every agent stays inside the lines you set."
    >
      <SignUp />
    </AuthShell>
  );
}
