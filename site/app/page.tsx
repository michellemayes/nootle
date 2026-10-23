import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import { Introduction } from "@/components/Introduction";
import { Screenshots } from "@/components/Screenshots";
import { Features } from "@/components/Features";
import { Comparison } from "@/components/Comparison";
import { Integrations } from "@/components/Integrations";
import { HowItWorks } from "@/components/HowItWorks";
import { SystemRequirements } from "@/components/SystemRequirements";
import { FAQ } from "@/components/FAQ";
import { SponsorCTA } from "@/components/SponsorCTA";
import { SiteFooter } from "@/components/SiteFooter";
import { PageMotion } from "@/components/PageMotion";

export default function Home() {
  return (
    <>
      <Navbar />
      <PageMotion id="main-content" className="relative overflow-hidden">
        <Hero />
        <Stats />
        <Introduction />
        <Screenshots />
        <Features />
        <Comparison />
        <Integrations />
        <HowItWorks />
        <SystemRequirements />
        <FAQ />
        <SponsorCTA />
      </PageMotion>
      <SiteFooter />
    </>
  );
}
