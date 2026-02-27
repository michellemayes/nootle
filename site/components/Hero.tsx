"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6">
      {/* Mesh gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(78, 234, 187, 0.3), transparent 50%), " +
            "radial-gradient(ellipse at 80% 20%, rgba(192, 132, 252, 0.3), transparent 50%), " +
            "radial-gradient(ellipse at 60% 80%, rgba(232, 121, 168, 0.2), transparent 50%), " +
            "#FAFAFA",
        }}
      />

      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mx-auto mb-8 w-[180px] h-[180px] rounded-[2.5rem] overflow-hidden shadow-2xl">
            <Image
              src="/nootle-logo.png"
              alt="Nootle"
              width={180}
              height={180}
              priority
            />
          </div>
        </motion.div>

        <motion.h1
          className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
          style={{ color: "var(--color-text)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          Your meetings,{" "}
          <span className="bg-gradient-to-r from-[#4EEABB] via-[#C084FC] to-[#E879A8] bg-clip-text text-transparent">
            captured and understood
          </span>
        </motion.h1>

        <motion.p
          className="text-xl md:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          AI-powered meeting recorder for Mac. Transcribe in real-time, identify
          speakers, and chat with AI about what was discussed. All local, all
          private.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          <a
            href="https://github.com/michellemayes/nootle/releases"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #4EEABB, #5BC4A8)",
            }}
          >
            Download for Mac
          </a>
          <a
            href="https://github.com/sponsors/michellemayes"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold rounded-full border-2 border-purple-300 text-purple-600 hover:bg-purple-50 transition-all hover:scale-105"
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
            Support on GitHub
          </a>
        </motion.div>
      </div>
    </section>
  );
}
