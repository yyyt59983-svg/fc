import { motion } from "motion/react";

type VisualizerState = "idle" | "listening" | "processing" | "speaking";

interface VisualizerProps {
  state: VisualizerState;
}

export default function Visualizer({ state }: VisualizerProps) {
  // Theme settings (Colors, Gradients, Shadows, Speeds)
  const getTheme = () => {
    switch (state) {
      case "listening":
        return {
          glow: "shadow-[0_0_80px_rgba(219,39,119,0.5)]",
          coreGlow: "shadow-[inset_0_0_40px_rgba(236,72,153,0.6)]",
          grad1: "from-pink-500 via-fuchsia-600 to-violet-600",
          grad2: "from-purple-600 via-pink-500 to-rose-500",
          coreGrad: "from-fuchsia-500 to-pink-500",
          scale: [1.0, 1.15, 0.95, 1.1, 1.0],
          speed: 0.6,
          blurRadius: 18,
        };
      case "processing":
        return {
          glow: "shadow-[0_0_80px_rgba(6,182,212,0.5)]",
          coreGlow: "shadow-[inset_0_0_40px_rgba(56,189,248,0.6)]",
          grad1: "from-cyan-400 via-sky-500 to-indigo-500",
          grad2: "from-blue-600 via-teal-400 to-cyan-500",
          coreGrad: "from-cyan-400 to-blue-500",
          scale: [0.97, 1.03, 0.97],
          speed: 1.2,
          blurRadius: 22,
        };
      case "speaking":
        return {
          glow: "shadow-[0_0_80px_rgba(236,72,153,0.5)]",
          coreGlow: "shadow-[inset_0_0_40px_rgba(251,113,133,0.6)]",
          grad1: "from-rose-500 via-orange-400 to-pink-500",
          grad2: "from-amber-400 via-pink-600 to-rose-500",
          coreGrad: "from-rose-500 to-amber-500",
          scale: [1.0, 1.25, 0.9, 1.15, 1.0],
          speed: 0.8,
          blurRadius: 20,
        };
      default: // idle
        return {
          glow: "shadow-[0_0_60px_rgba(139,92,246,0.3)]",
          coreGlow: "shadow-[inset_0_0_20px_rgba(99,102,241,0.4)]",
          grad1: "from-indigo-600/60 via-violet-700/60 to-cyan-700/60",
          grad2: "from-violet-800/60 via-purple-700/60 to-indigo-900/60",
          coreGrad: "from-indigo-900/40 to-violet-950/40",
          scale: [1.0, 1.03, 1.0],
          speed: 4.0,
          blurRadius: 25,
        };
    }
  };

  const theme = getTheme();

  // Morphing borders keyframes for organic fluid blob shape
  const blobMorphs = [
    "40% 60% 70% 30% / 40% 40% 60% 50%",
    "50% 50% 30% 70% / 50% 60% 40% 60%",
    "60% 40% 60% 40% / 40% 30% 70% 60%",
    "50% 60% 40% 60% / 60% 50% 50% 40%",
    "40% 60% 70% 30% / 40% 40% 60% 50%"
  ];

  const blobMorphsReverse = [
    "50% 50% 30% 70% / 50% 60% 40% 60%",
    "60% 40% 60% 40% / 40% 30% 70% 60%",
    "40% 60% 70% 30% / 40% 40% 60% 50%",
    "50% 60% 40% 60% / 60% 50% 50% 40%",
    "50% 50% 30% 70% / 50% 60% 40% 60%"
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none">
      {/* SVG gooey filter definition */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="gooey-orb" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={theme.blurRadius.toString()} result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Layer 1: Ambient Background Pulse Glow */}
      <motion.div
        animate={{
          scale: theme.scale,
          opacity: state === "idle" ? 0.15 : 0.35,
        }}
        transition={{
          duration: theme.speed,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={`absolute w-72 h-72 md:w-96 md:h-96 rounded-full blur-[90px] bg-gradient-to-tr ${theme.grad1} transition-all duration-500`}
      />

      {/* Layer 2: Outer Rotating HUD ring (gently floating) */}
      {state !== "idle" && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute w-[320px] h-[320px] rounded-full border border-white/10 border-dashed animate-pulse opacity-30"
        />
      )}

      {/* Layer 3: Organic Liquid Gooey Orb Container */}
      <motion.div
        animate={{
          scale: theme.scale,
        }}
        transition={{
          duration: theme.speed,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ filter: "url(#gooey-orb)" }}
        className={`relative w-72 h-72 md:w-80 md:h-80 flex items-center justify-center transition-all duration-500`}
      >
        {/* Liquid Blob A */}
        <motion.div
          animate={{
            borderRadius: blobMorphs,
            rotate: [0, 360],
          }}
          transition={{
            duration: theme.speed * 12,
            repeat: Infinity,
            ease: "linear",
          }}
          className={`absolute inset-12 bg-gradient-to-tr ${theme.grad1} opacity-90 mix-blend-screen transition-all duration-500`}
        />

        {/* Liquid Blob B */}
        <motion.div
          animate={{
            borderRadius: blobMorphsReverse,
            rotate: [360, 0],
          }}
          transition={{
            duration: theme.speed * 10,
            repeat: Infinity,
            ease: "linear",
          }}
          className={`absolute inset-16 bg-gradient-to-bl ${theme.grad2} opacity-85 mix-blend-screen transition-all duration-500`}
        />

        {/* Liquid Blob C */}
        <motion.div
          animate={{
            borderRadius: blobMorphs,
            scale: [0.9, 1.1, 0.9],
          }}
          transition={{
            duration: theme.speed * 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={`absolute inset-20 bg-gradient-to-r ${theme.grad1} opacity-80 mix-blend-screen transition-all duration-500`}
        />
      </motion.div>

      {/* Layer 4: Glassmorphic Core (sharp center overlay) */}
      <motion.div
        animate={{
          scale: state === "speaking" ? [1.0, 1.08, 0.96, 1.04, 1.0] : [1.0, 1.02, 1.0],
        }}
        transition={{
          duration: theme.speed,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={`absolute w-32 h-32 md:w-36 md:h-36 rounded-full border border-white/20 bg-[#020206]/85 backdrop-blur-lg flex items-center justify-center ${theme.glow} ${theme.coreGlow} transition-all duration-500 z-20`}
      >
        {/* Core Center Pulse Ring */}
        <div className={`absolute inset-1 rounded-full border border-dashed border-white/10 animate-[spin_25s_linear_infinite]`} />
        
        {/* Core Center Light Spot */}
        <div className={`absolute w-12 h-12 rounded-full bg-gradient-to-r ${theme.coreGrad} blur-[20px] opacity-40 transition-all duration-500`} />

        {/* Nidhi Brand text or state icon */}
        <div className="flex flex-col items-center justify-center gap-1 z-30 font-sans select-none">
          <span 
            className="font-serif font-semibold tracking-[0.2em] text-lg md:text-xl text-white ml-[0.2em]"
            style={{ textShadow: `0 0 10px rgba(255,255,255,0.4)` }}
          >
            ROXY
          </span>
          <div className="flex gap-0.5 items-center justify-center h-2">
            {state === "listening" && (
              <span className="flex gap-0.5 items-center">
                <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            )}
            {state === "processing" && (
              <span className="text-[7px] font-mono tracking-widest text-cyan-400/80 animate-pulse font-bold">THINKING</span>
            )}
            {state === "speaking" && (
              <span className="flex gap-0.5 items-center">
                <span className="w-1 h-2 bg-pink-400 rounded-full animate-pulse" />
                <span className="w-1 h-3.5 bg-rose-400 rounded-full animate-pulse" style={{ animationDelay: "100ms" }} />
                <span className="w-1 h-2 bg-pink-400 rounded-full animate-pulse" style={{ animationDelay: "200ms" }} />
              </span>
            )}
            {state === "idle" && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/50 animate-ping" />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
