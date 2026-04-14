import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { AppMockup } from "@/components/AppMockup";
import { Features } from "@/components/Features";
import { Integrations } from "@/components/Integrations";
import { HowItWorks } from "@/components/HowItWorks";
import { SponsorCTA } from "@/components/SponsorCTA";

export default function Home() {
  return (
    <main id="main-content" className="relative overflow-hidden">

      <Navbar />
      <Hero />
      <AppMockup />
      <Features />
      <Integrations />
      <HowItWorks />
      <SponsorCTA />
      <footer className="py-8 text-center text-[var(--color-text-secondary)] text-sm">
        <p>
          Made by{" "}
          <a
            href="https://michellemayes.me"
            className="underline hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:rounded-sm"
          >
            Michelle Mayes
          </a>
          {" "}&middot;{" "}
          <a
            href="https://github.com/michellemayes/nootle"
            className="underline hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:rounded-sm"
          >
            GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
