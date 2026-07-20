import { Instrument_Sans } from "next/font/google";
import { SiteNav, SiteFooter } from "@/components/site/chrome";
import { PageTransition } from "@/components/site/motion";

const siteFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-site",
});

/**
 * Logged-out marketing site: warm paper-white editorial system, distinct from
 * the dark instrument-panel app. Route group only; URLs are unchanged.
 * Page content cross-fades on route change (Lane A's PageTransition) while
 * nav/footer stay put.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site-light ${siteFont.variable} min-h-screen`}>
      <SiteNav />
      <PageTransition>{children}</PageTransition>
      <SiteFooter />
    </div>
  );
}
