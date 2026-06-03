import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2, Minimize2, GripHorizontal, Loader2, Youtube } from 'lucide-react';

interface MiniPlayerProps {
  query: string;
  onClose: () => void;
}

export default function MiniPlayer({ query, onClose }: MiniPlayerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    
    // If the query is already an 11-character YouTube video ID, bypass search and load directly!
    if (/^[a-zA-Z0-9_-]{11}$/.test(query)) {
      setVideoId(query);
      setLoading(false);
      setError(false);
      return;
    }

    const fetchVideoId = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/get-song?q=${encodeURIComponent(query)}&t=${Date.now()}`, {
          cache: "no-store"
        });
        if (!res.ok) throw new Error(`Server returned status: ${res.status}`);
        const data = await res.json();
        if (active && data.videoId) {
          setVideoId(data.videoId);
        } else {
          setError(true);
          setErrorMsg("Server returned no video ID");
        }
      } catch(err: any) {
        console.error("MiniPlayer: Failed to fetch video ID:", err);
        if (active) {
          setError(true);
          setErrorMsg(err.message || String(err));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchVideoId();
    return () => { active = false; };
  }, [query]);

  const embedUrl = videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&enablejsapi=1` : "";

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={`absolute bottom-24 right-8 z-50 rounded-2xl overflow-hidden bg-[#0a0a0f] border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex flex-col transition-all duration-300 pointer-events-auto ${
          isExpanded ? "w-[600px] h-[400px]" : "w-[350px] h-[220px]"
        }`}
      >
        {/* Header / Drag Handle */}
        <div className="w-full h-10 bg-white/5 border-b border-white/10 flex items-center justify-between px-3 cursor-move shrink-0">
          <div className="flex items-center gap-2 text-white/50">
            <GripHorizontal size={14} />
            <span className="text-xs font-mono truncate max-w-[200px]">Playing: {query}</span>
          </div>
          <div className="flex items-center gap-2">
            {videoId && (
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                title="Watch on YouTube"
              >
                <Youtube size={14} className="text-red-500 hover:scale-110 transition-transform" />
              </a>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Video Player */}
        <div className="flex-1 w-full relative bg-black flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-white/50">
              <Loader2 className="animate-spin" size={24} />
              <span className="text-xs font-mono">Searching YouTube...</span>
            </div>
          ) : error || !videoId ? (
            <div className="flex flex-col items-center gap-2 text-red-400 px-4 text-center">
              <X size={24} />
              <span className="text-xs font-mono">Could not find media</span>
              {errorMsg && <span className="text-[10px] opacity-60 font-mono break-all mt-1">{errorMsg}</span>}
            </div>
          ) : (
            <iframe
              src={embedUrl}
              title="Roxy Mini Player"
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
