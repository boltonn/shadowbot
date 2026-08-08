"use client"

import { motion } from "framer-motion"

export function RadarSweep({
  theme = "light",
  size = 48,
}: {
  theme?: "light" | "dark"
  size?: number
}) {
  const isDark = theme === "dark"
  return (
    <div
      className="relative rounded-full border border-zinc-800/10 dark:border-white/10 flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {/* Concentric rings */}
      <div
        className="absolute rounded-full border border-zinc-800/5 dark:border-white/5"
        style={{ width: size * (2 / 3), height: size * (2 / 3) }}
      />
      <div
        className="absolute rounded-full border border-zinc-800/5 dark:border-white/5"
        style={{ width: size / 3, height: size / 3 }}
      />

      {/* Center dot */}
      <div
        className="absolute rounded-full bg-zinc-800/80 dark:bg-white/80"
        style={{ width: size / 8, height: size / 8 }}
      />

      {/* Sweep hand */}
      <motion.div
        className="absolute inset-0 origin-center"
        style={{
          background: isDark
            ? "conic-gradient(from 0deg, transparent 50%, rgba(255,255,255,0.02) 65%, rgba(255,255,255,0.15) 85%, rgba(255,255,255,0.55) 100%)"
            : "conic-gradient(from 0deg, transparent 50%, rgba(39,39,42,0.02) 65%, rgba(39,39,42,0.1) 85%, rgba(39,39,42,0.45) 100%)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
      />
    </div>
  )
}
