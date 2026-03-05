import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { AppMockup } from "@/components/AppMockup";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { SponsorCTA } from "@/components/SponsorCTA";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <AppMockup />
      <Features />
      <HowItWorks />
      <SponsorCTA />
      <footer className="py-8 text-center text-[var(--color-text-secondary)] text-sm">
        <p>
          Made by{" "}
          <a
            href="https://github.com/michellemayes"
            className="underline hover:text-[var(--color-text)]"
          >
            Michelle Mayes
          </a>
          {" "}&middot;{" "}
          <a
            href="https://github.com/michellemayes/nootle"
            className="underline hover:text-[var(--color-text)]"
          >
            GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
