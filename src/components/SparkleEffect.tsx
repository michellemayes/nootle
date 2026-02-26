import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface Particle {
  id: number;
  angle: number;
  distance: number;
  size: number;
}

export function SparkleEffect({ trigger }: { trigger: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (trigger) {
      const newParticles = Array.from({ length: 7 }, (_, i) => ({
        id: Date.now() + i,
        angle: (i / 7) * 360 + (Math.random() * 30 - 15),
        distance: 30 + Math.random() * 20,
        size: 3 + Math.random() * 3,
      }));
      setParticles(newParticles);
      const timer = setTimeout(() => setParticles([]), 700);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <AnimatePresence>
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * p.distance;
        const ty = Math.sin(rad) * p.distance;
        return (
          <motion.div
            key={p.id}
            className="pointer-events-none absolute"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: tx, y: ty, opacity: 0, scale: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ width: p.size, height: p.size }}
          >
            <div className="h-full w-full rounded-full bg-primary" />
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
