import type { Metadata } from "next";
import Script from "next/script";
import { Footer, Header, PageIntro } from "../components";

export const metadata: Metadata = {
  title: "Blog | Velora Vista Visuals",
  description: "Ideas and insights on film, photography and content for brands from Velora Vista Visuals.",
};

export default function Blog() {
  return (
    <main id="top" className="vv-public-v2">
      <Header dark />
      <PageIntro index="04" kicker="Film · Content · Photography" title="THE" accent="JOURNAL." />
      <section aria-label="Blog articles" style={{ padding: "24px clamp(20px, 5vw, 80px) 64px" }}>
        <div style={{ background: "#ffffff", color: "#171717", colorScheme: "light", borderRadius: "16px", padding: "clamp(16px, 3vw, 40px)", minHeight: "280px", maxWidth: "1200px", margin: "0 auto", overflowWrap: "anywhere" }}>
          <div id="soro-blog" />
        </div>
        <Script
          id="soro-blog-widget"
          src="https://app.trysoro.com/api/embed/ef2cb8b9-7ece-4be7-b79a-67edb510fb3f"
          strategy="afterInteractive"
        />
      </section>
      <Footer />
    </main>
  );
}
