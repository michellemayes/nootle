import Image from "next/image";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/nootle-logo.png"
            alt="Nootle"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span className="font-[family-name:var(--font-syne)] font-bold text-lg text-[var(--color-text)]">
            Nootle
          </span>
        </div>
        <a
          href="https://github.com/michellemayes/nootle/releases"
          className="inline-flex items-center px-5 py-2 text-sm font-semibold rounded-full bg-[var(--color-mint)] text-[var(--color-bg)] hover:opacity-90 transition-opacity"
        >
          <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 814.37 1000"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.5-81.6-105.6-207-105.6-326.4 0-192 124.7-293.8 247.5-293.8 65.2 0 119.6 42.8 160.4 42.8 39.5 0 101.1-45.4 176.3-45.4 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8.6 15.6 1.3 18.2 2.6.6 6.4 1.3 10.2 1.3 45.4 0 103-30.4 139.5-71.4z"/></svg>
          Download
        </a>
      </div>
    </nav>
  );
}
