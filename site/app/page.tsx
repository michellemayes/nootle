import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { AppMockup } from "@/components/AppMockup";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { SponsorCTA } from "@/components/SponsorCTA";

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      {/* Ambient color splashes throughout the page */}
      <div className="absolute top-[120vh] right-[-10%] w-[600px] h-[600px] rounded-full blur-[150px] -z-10 animate-float-slow" style={{ background: "rgba(59, 130, 246, 0.08)" }} />
      <div className="absolute top-[200vh] left-[-5%] w-[500px] h-[500px] rounded-full blur-[150px] -z-10 animate-float-slower" style={{ background: "rgba(255, 45, 138, 0.07)" }} />
      <div className="absolute top-[300vh] right-[5%] w-[450px] h-[450px] rounded-full blur-[150px] -z-10 animate-float-slow" style={{ background: "rgba(0, 255, 178, 0.06)", animationDelay: "4s" }} />

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
