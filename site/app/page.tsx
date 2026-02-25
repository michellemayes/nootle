import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { SponsorCTA } from "@/components/SponsorCTA";

export default function Home() {
  return (
    <main>
      <Hero />
      <Features />
      <HowItWorks />
      <SponsorCTA />
      <footer className="py-8 text-center text-gray-500 text-sm">
        <p>
          Made by{" "}
          <a
            href="https://github.com/michellemayes"
            className="underline hover:text-gray-700"
          >
            Michelle Mayes
          </a>
          {" "}&middot;{" "}
          <a
            href="https://github.com/michellemayes/nootle"
            className="underline hover:text-gray-700"
          >
            GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
