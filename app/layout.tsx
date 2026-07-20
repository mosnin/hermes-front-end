import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "./providers";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Cadre",
  description:
    "Connect, orchestrate, and control your agents: threads, tasks, skills, integrations, and live activity.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        /* No baseTheme: Clerk's default theme is already light. The
           editorial system (paper white / ink / warm beige / hairline)
           is layered on with variables + element overrides below so the
           Clerk-rendered form reads as part of the same product, not a
           bolted-on widget. Kept in sync with the tokens in
           app/globals.css (Lane C owns that file; values are mirrored
           here as literals since ClerkProvider renders before the CSS
           custom properties are guaranteed resolved). */
        variables: {
          colorPrimary: "#1f1f1c",
          colorBackground: "#ffffff",
          colorText: "#1f1f1c",
          colorTextSecondary: "#8a8781",
          colorInputBackground: "#f5f4f0",
          colorInputText: "#1f1f1c",
          colorDanger: "#dc2626",
          colorSuccess: "#16a34a",
          colorNeutral: "#1f1f1c",
          colorShimmer: "#efede7",
          borderRadius: "0.875rem",
          fontFamily:
            "var(--font-site), var(--font-app), 'Helvetica Neue', Arial, sans-serif",
          fontSize: "0.9375rem",
        },
        elements: {
          rootBox: "w-full",
          card: "w-full gap-5 rounded-none border-none bg-transparent p-0 shadow-none",
          header: "gap-1.5",
          headerTitle: "text-2xl font-semibold tracking-tight text-[#1f1f1c]",
          headerSubtitle: "text-[#8a8781]",
          form: "gap-4",
          formFieldLabel: "text-[#1f1f1c] font-medium",
          formFieldInput:
            "rounded-xl border border-[#e7e5df] bg-[#f5f4f0] px-3.5 py-2.5 text-[#1f1f1c] transition-colors focus:border-[#1f1f1c] focus:ring-1 focus:ring-[#1f1f1c]",
          formFieldInputShowPasswordButton: "text-[#8a8781] hover:text-[#1f1f1c]",
          formButtonPrimary:
            "rounded-full bg-[#1f1f1c] py-2.5 text-[15px] font-medium normal-case tracking-normal shadow-none transition-colors hover:bg-black focus:shadow-none",
          formButtonReset: "text-[#8a8781] hover:text-[#1f1f1c]",
          footerActionText: "text-[#8a8781]",
          footerActionLink: "font-medium text-[#1f1f1c] hover:underline",
          footer: "bg-transparent",
          dividerLine: "bg-[#e7e5df]",
          dividerText: "text-[#8a8781]",
          socialButtonsBlockButton:
            "rounded-xl border border-[#e7e5df] bg-white text-[#1f1f1c] transition-colors hover:bg-[#f5f4f0]",
          socialButtonsBlockButtonText: "font-medium text-[#1f1f1c]",
          otpCodeFieldInput:
            "rounded-xl border border-[#e7e5df] bg-[#f5f4f0] text-[#1f1f1c] focus:border-[#1f1f1c]",
          identityPreview: "rounded-xl border border-[#e7e5df] bg-[#f5f4f0]",
          identityPreviewText: "text-[#1f1f1c]",
          identityPreviewEditButton: "text-[#1f1f1c] hover:text-black",
          /* Error / warning / info / loading states: kept in the same
             editorial palette (no bolted-on "form widget" red) but legible
             as feedback: danger uses the product's red-600/red-50 pairing,
             warning amber, info the neutral band. Clerk mounts/unmounts
             these nodes as validation state changes, so `cd-auth-in` (see
             the keyframes in auth-shell.tsx) gives them a small settle-in
             instead of popping in place; it no-ops under reduced motion. */
          alert: "cd-auth-in rounded-xl border px-3.5 py-2.5",
          alert__danger: "border-red-200 bg-red-50",
          alert__warning: "border-amber-200 bg-amber-50",
          alert__info: "border-[#e7e5df] bg-[#f5f4f0]",
          alertIcon: "shrink-0",
          alertText: "text-[13px] leading-snug text-[#1f1f1c]",
          formFieldErrorText: "cd-auth-in text-[13px] text-red-600",
          formFieldWarningText: "cd-auth-in text-[13px] text-amber-600",
          formFieldSuccessText: "cd-auth-in text-[13px] text-green-600",
          formFieldInfoText: "text-[13px] text-[#8a8781]",
          formFieldHintText: "text-[13px] text-[#8a8781]",
          formFieldInput__error:
            "border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-500",
          spinner: "text-white",
          formButtonPrimary__loading: "opacity-80",
          formResendCodeLink: "font-medium text-[#1f1f1c] hover:underline",
          badge: "rounded-full border border-[#e7e5df] bg-[#f5f4f0] text-[#8a8781]",
          avatarBox: "rounded-full",
          userButtonPopoverCard:
            "rounded-2xl border border-[#e7e5df] bg-white shadow-lg",
          userButtonPopoverActionButton: "text-[#1f1f1c] hover:bg-[#f5f4f0]",
          userButtonPopoverActionButtonText: "text-[#1f1f1c]",
          userButtonPopoverFooter: "hidden",
        },
      }}
    >
      <html lang="en" className={mono.variable}>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
