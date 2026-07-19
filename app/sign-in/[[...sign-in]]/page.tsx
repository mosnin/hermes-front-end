import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "../auth-shell";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back"
      subtitle="Sign in to pick up where your agents left off."
      headline="Connect, orchestrate, and control your agents."
      bodyCopy="One control plane for every agent framework: register, dispatch, and watch every run in real time."
    >
      <SignIn />
    </AuthShell>
  );
}
