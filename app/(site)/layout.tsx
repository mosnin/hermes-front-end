import { Instrument_Sans } from "next/font/google";
import { SiteNav, SiteFooter } from "@/components/site/chrome";

const siteFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-site",
});

/**
 * Logged-out marketing site: warm paper-white editorial system, distinct from
 * the dark instrument-panel app. Route group only; URLs are unchanged.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site-light ${siteFont.variable} min-h-screen`}>
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
