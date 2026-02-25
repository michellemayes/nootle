"use client";

import { motion } from "framer-motion";

export function SponsorCTA() {
  return (
    <section
      className="py-24 px-6 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(78, 234, 187, 0.15), rgba(192, 132, 252, 0.15), rgba(232, 121, 168, 0.15))",
      }}
    >
      <div className="max-w-3xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-6xl mb-6">💜</div>
          <h2
            className="text-4xl md:text-5xl font-bold mb-6"
            style={{ color: "var(--color-text)" }}
          >
            Support Nootle
          </h2>
          <p className="text-xl text-gray-600 mb-10 max-w-xl mx-auto">
            Nootle is free and open source. If it saves you time, consider
            supporting development so I can keep making it better.
          </p>
          <a
            href="https://github.com/sponsors/michellemayes"
            className="inline-flex items-center justify-center px-10 py-4 text-lg font-semibold text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #C084FC, #A855F7)",
            }}
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path
                fillRule="evenodd"
                d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.75.75 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5z"
              />
            </svg>
            Sponsor on GitHub
          </a>
        </motion.div>
      </div>
    </section>
  );
}
