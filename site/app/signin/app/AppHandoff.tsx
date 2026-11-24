"use client";

import { useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { SPRING } from "@/components/motion";
import { RELEASES_URL } from "@/components/site-config";
import { primaryButton } from "@/components/ui";
import { authHeading } from "../AuthShell";

export function AppHandoff({ url, email }: { url: string; email: string }) {
  useEffect(() => {
    window.location.href = url;
  }, [url]);

  return (
    <div className="text-center">
      <div className="relative mx-auto mb-6 h-16 w-16">
        <Image src="/nootle-icon.svg" alt="" width={64} height={64} priority />
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...SPRING, delay: 0.25 }}
          className="absolute -right-1.5 -bottom-1.5 grid h-7 w-7 place-items-center rounded-full border-4 border-[var(--color-surface)] bg-[var(--color-emerald)] text-[var(--color-bg)]"
        >
          <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3.5} />
        </motion.span>
      </div>
      <h1 className={authHeading}>You&apos;re connected</h1>
      <p className="mt-3 mb-7 text-[var(--color-text-secondary)]">
        Nootle is signed in as <strong className="font-semibold text-[var(--color-text)] break-all">{email}</strong>
      </p>
      <a href={url} className={`${primaryButton} w-full py-3.5 text-base`}>
        Return to Nootle
      </a>
      <p className="mt-5 text-sm text-[var(--color-text-secondary)]">
        Didn&apos;t open?{" "}
        <a href={RELEASES_URL} className="underline hover:text-[var(--color-text)]">
          Download Nootle
        </a>
      </p>
    </div>
  );
}
