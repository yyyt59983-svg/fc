import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Radio, 
  Mic, 
  Wifi, 
  AlertTriangle, 
  Power, 
  Volume2, 
  Users, 
  ChevronRight,
  Shield,
  Activity,
  Download,
  Keyboard,
  Clock,
  Star,
  Edit2,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import Visualizer from './components/Visualizer';

// Tactical Frequency Ranges (Simulated)
const CHANNELS = [
  { id: 'alpha', freq: '144.250', label: 'ALPHA - CMD' },
  { id: 'bravo', freq: '145.500', label: 'BRAVO - OPS' },
  { id: 'charlie', freq: '146.125', label: 'CHARLIE - SAR' },
  { id: 'delta', freq: '446.006', label: 'DELTA - EMC' },
];

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isPowered, setIsPowered] = useState(false);
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [remoteUser, setRemoteUser] = useState<string | null>(null);
  const [signalStrength, setSignalStrength] = useState(100);
  const [sosActive, setSosActive] = useState(false);
  const [userId] = useState(() => `OP-${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`);

  const pttAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [customChannels, setCustomChannels] = useState<{id: string, freq: string, label: string, isFavorite?: boolean}[]>(() => {
    const saved = localStorage.getItem('aegis_custom_channels');
    return saved ? JSON.parse(saved) : [];
  });
  const [history, setHistory] = useState<{freq: string, timestamp: number}[]>(() => {
    const saved = localStorage.getItem('aegis_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [isKeypadOpen, setIsKeypadOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<{id: string, freq: string, label: string, isFavorite?: boolean} | null>(null);
  const [manualFreq, setManualFreq] = useState('');

  // Connect to server
  useEffect(() => {
    // Windows app runs the server locally, Android connects to the Windows LAN IP
    const isNativeAndroid = typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform();
    const socketUrl = isNativeAndroid ? 'http://10.220.7.211:3000' : 'http://localhost:3000';
    
    const newSocket = io(socketUrl);
    setSocket(newSocket);
    return () => { newSocket.close(); };
  }, []);

  // Save custom channels and history
  useEffect(() => {
    localStorage.setItem('aegis_custom_channels', JSON.stringify(customChannels));
  }, [customChannels]);

  useEffect(() => {
    localStorage.setItem('aegis_history', JSON.stringify(history));
  }, [history]);

  const addToHistory = (freq: string) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.freq !== freq);
      return [{ freq, timestamp: Date.now() }, ...filtered].slice(0, 10);
    });
  };

  const tuneTo = (freq: string, label?: string) => {
    const id = label?.toLowerCase() || `manual-${freq}`;
    setChannel({ id, freq, label: label || `MANUAL-${freq}` });
    addToHistory(freq);
    setIsKeypadOpen(false);
    setIsHistoryOpen(false);
  };

  // Handle signal fluctuation simulation
  useEffect(() => {
    if (!isPowered) return;
    const interval = setInterval(() => {
      setSignalStrength(prev => {
        const jitter = Math.random() * 10 - 5;
        return Math.max(20, Math.min(100, prev + jitter));
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isPowered]);

  // Join channel logic
  useEffect(() => {
    if (socket && isPowered) {
      socket.emit('join-channel', channel.id);
    }
  }, [socket, channel, isPowered]);

  // Socket listeners
  useEffect(() => {
    if (!socket || !isPowered) return;

    socket.on('user-transmitting', ({ userId: remoteId, status }) => {
      if (status === 'start') {
        setIsReceiving(true);
        setRemoteUser(remoteId);
      } else {
        setIsReceiving(false);
        setRemoteUser(null);
      }
    });

    socket.on('remote-audio', async ({ data }) => {
      if (!isPowered || !audioContextRef.current) return;
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      try {
        const arrayBuffer = await new Blob([data]).arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
      } catch (e) {
        console.error('Audio decode error:', e);
      }
    });

    socket.on('sos-alert', ({ userId: alertId, timestamp }) => {
      setSosActive(true);
      setTimeout(() => setSosActive(false), 5000);
    });

    return () => {
      socket.off('user-transmitting');
      socket.off('sos-alert');
      socket.off('remote-audio');
    };
  }, [socket, isPowered]);

  const handlePttStart = useCallback(async () => {
    if (!isPowered || isReceiving) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          socket?.emit('audio-data', { channelId: channel.id, data: e.data });
        }
      };

      recorder.start(100); // Stream in 100ms chunks
      setIsTransmitting(true);
      socket?.emit('ptt-start', { channelId: channel.id, userId });
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  }, [isPowered, isReceiving, socket, channel, userId]);

  const handlePttStop = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    setIsTransmitting(false);
    socket?.emit('ptt-stop', { channelId: channel.id, userId });
  }, [socket, channel, userId]);

  const handleSos = () => {
    if (!isPowered) return;
    socket?.emit('sos-beacon', { channelId: channel.id, userId, location: 'UNKNOWN' });
    setSosActive(true);
    setTimeout(() => setSosActive(false), 3000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#050505]">
      {/* Device Body */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-sm"
      >
        {/* Antenna */}
        <div className="absolute -top-16 left-8 w-4 h-16 bg-[#1a1a1a] rounded-t-lg border-x border-white/5" />
        
        <div className="bg-[#151619] rounded-[40px] p-8 tactical-border overflow-hidden">
          {/* Header Panel */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#ff8800]" />
                <span className="text-[10px] font-mono tracking-widest text-white/40 uppercase">AEGIS-TAC-1</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "led-indicator transition-all duration-300",
                  isPowered ? "bg-[#00ff00] shadow-[0_0_8px_#00ff00]" : "bg-white/5"
                )} />
                <span className="text-[10px] font-mono text-white/20 uppercase">POW_READY</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => window.open('/download.html', '_blank')}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all"
                title="Deploy System"
              >
                <Download className="w-4 h-4" />
              </button>
              
              <button 
                onClick={() => {
                  setIsPowered(!isPowered);
                  if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                  }
                }}
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                  isPowered 
                    ? "bg-[#ff4444] text-white shadow-[0_0_15px_rgba(255,68,68,0.4)]" 
                    : "bg-white/5 text-white/20 hover:bg-white/10"
                )}
              >
                <Power className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main LCD Screen */}
          <div className={cn(
            "relative bg-[#1a1c1e] rounded-2xl p-6 transition-all duration-500 overflow-hidden",
            isPowered ? "ring-1 ring-white/10" : "opacity-30 grayscale"
          )}>
            {/* Screen Content */}
            <AnimatePresence mode="wait">
              {isPowered ? (
                <motion.div 
                  key="active"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-mono text-[#ff8800]/60 uppercase tracking-tighter">Frequency MHZ</span>
                      <span className="text-xl font-mono text-[#ff8800] leading-none tabular-nums tracking-tighter">
                        {channel.freq}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setIsKeypadOpen(true)}
                          className="p-1.5 rounded-md bg-white/5 text-white/40 hover:text-white transition-all"
                          title="Manual Entry"
                        >
                          <Keyboard className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => setIsHistoryOpen(true)}
                          className="p-1.5 rounded-md bg-white/5 text-white/40 hover:text-white transition-all"
                          title="Channel History"
                        >
                          <Clock className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div 
                            key={level}
                            className={cn(
                              "w-1 h-3 rounded-sm transition-all",
                              signalStrength > (level - 1) * 20 ? "bg-[#ff8800]" : "bg-white/10"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-white/60">
                    <div className="flex items-center gap-2">
                      <Activity className={cn("w-3 h-3", isReceiving && "animate-pulse text-[#00ff22]")} />
                      <span className="text-[10px] font-mono uppercase tracking-widest leading-none">
                        {isTransmitting ? 'TX_ON' : isReceiving ? `RX_INH (${remoteUser})` : 'RX_IDLE'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono">{userId}</span>
                  </div>

                  <div className="h-10 bg-black/20 rounded-lg flex items-center px-2">
                    <Visualizer isTransmitting={isTransmitting || isReceiving} color={isReceiving ? '#00ff22' : '#ff8800'} />
                  </div>
                </motion.div>
              ) : (
                <div className="h-28 flex items-center justify-center">
                  <span className="text-[11px] font-mono text-white/10 tracking-[0.3em] uppercase">System Offline</span>
                </div>
              )}
            </AnimatePresence>

            {/* Screen Glass Effect */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-white/10" />
            
            {/* SOS Overlay */}
            {sosActive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-[#ff0000]/20 flex items-center justify-center backdrop-blur-[1px]"
              >
                <div className="flex flex-col items-center gap-1">
                  <AlertTriangle className="w-8 h-8 text-red-500 animate-bounce" />
                  <span className="text-[11px] font-bold text-red-500 uppercase tracking-widest">SOS_ACTIVE</span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Keypad Modal (Moved outside screen for no clipping) */}
          <AnimatePresence>
            {isKeypadOpen && (
              <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="absolute inset-x-8 top-32 bottom-24 bg-black/95 p-6 z-50 flex flex-col rounded-3xl border border-white/10"
              >
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-mono text-[#ff8800]">MANUAL_TUNE</span>
                  <button onClick={() => setIsKeypadOpen(false)}><X className="w-4 h-4 text-white/40" /></button>
                </div>
                <div className="bg-black/50 p-2 rounded-lg border border-white/10 mb-4 text-center">
                  <span className="text-xl font-mono text-white tracking-widest">
                    {manualFreq.padEnd(7, '_')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 flex-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map(n => (
                    <button 
                      key={n}
                      onClick={() => manualFreq.length < 7 && setManualFreq(prev => prev + n)}
                      className="bg-white/5 rounded-lg font-mono text-sm py-2 hover:bg-white/10 transition-all text-white"
                    >
                      {n}
                    </button>
                  ))}
                  <button 
                    onClick={() => setManualFreq(prev => prev.slice(0, -1))}
                    className="bg-[#ff4444]/10 text-[#ff4444] rounded-lg font-mono text-xs py-2"
                  >
                    DEL
                  </button>
                </div>
                <button 
                  onClick={() => {
                    if (manualFreq.length >= 3) {
                      tuneTo(manualFreq);
                      setManualFreq('');
                    }
                  }}
                  className="mt-3 bg-[#ff8800] text-black font-bold py-2 rounded-xl uppercase tracking-widest text-xs"
                >
                  TUNE_COMMIT
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History/Edit Modal (Moved outside screen) */}
          <AnimatePresence>
            {isHistoryOpen && (
              <motion.div 
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 50, opacity: 0 }}
                className="absolute inset-x-8 top-32 bottom-24 bg-[#121417] p-6 z-50 flex flex-col overflow-y-auto rounded-3xl border border-white/10"
              >
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-mono text-[#ff8800]">CHANNEL_MGR</span>
                  <button onClick={() => setIsHistoryOpen(false)}><X className="w-4 h-4 text-white/40" /></button>
                </div>

                <div className="space-y-4">
                  <section>
                    <h3 className="text-[9px] font-mono text-white/20 uppercase mb-2">Favorites</h3>
                    <div className="space-y-2">
                      {customChannels.filter(c => c.isFavorite).map(c => (
                        <div key={c.id} className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-[#ff8800]/20">
                          <button onClick={() => tuneTo(c.freq, c.label)} className="flex-1 text-left">
                            <div className="text-[10px] font-bold text-white">{c.label}</div>
                            <div className="text-[9px] font-mono text-white/40">{c.freq} MHZ</div>
                          </button>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingChannel(c)}><Edit2 className="w-3 h-3 text-white/40" /></button>
                            <button onClick={() => setCustomChannels(prev => prev.filter(pc => pc.id !== c.id))}><Trash2 className="w-3 h-3 text-red-500/40" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[9px] font-mono text-white/20 uppercase mb-2">Recent History</h3>
                    <div className="space-y-2">
                      {history.map((h, i) => (
                        <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded-lg group">
                          <button onClick={() => tuneTo(h.freq)} className="flex-1 text-left">
                            <div className="text-[10px] font-mono text-white">{h.freq} MHZ</div>
                            <div className="text-[8px] font-mono text-white/20">{new Date(h.timestamp).toLocaleTimeString()}</div>
                          </button>
                          <button 
                            onClick={() => {
                              const newChannel = { id: `fav-${Date.now()}`, freq: h.freq, label: `NEW_CHAN_${h.freq}`, isFavorite: true };
                              setCustomChannels(prev => [...prev, newChannel]);
                              setEditingChannel(newChannel);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10"
                          >
                            <Star className="w-3 h-3 text-[#ff8800]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Edit Modal Overlay */}
          {editingChannel && (
            <div className="absolute inset-0 bg-black/80 z-[60] flex items-center justify-center p-6">
              <div className="bg-[#1a1c1e] w-full p-6 rounded-2xl border border-white/10 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-[#ff8800]">EDIT_CHANNEL</span>
                  <button onClick={() => setEditingChannel(null)}><X className="w-4 h-4 text-white/40" /></button>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-white/40 uppercase">Nickname</label>
                  <input 
                    type="text" 
                    value={editingChannel.label}
                    onChange={(e) => setEditingChannel({...editingChannel, label: e.target.value.toUpperCase()})}
                    className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-sm font-mono text-white outline-none focus:border-[#ff8800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-white/40 uppercase">Frequency</label>
                  <input 
                    type="text" 
                    value={editingChannel.freq}
                    onChange={(e) => setEditingChannel({...editingChannel, freq: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-sm font-mono text-white outline-none focus:border-[#ff8800]"
                  />
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setCustomChannels(prev => {
                        const exists = prev.find(c => c.id === editingChannel.id);
                        if (exists) {
                          return prev.map(c => c.id === editingChannel.id ? editingChannel : c);
                        } else {
                          return [...prev, editingChannel];
                        }
                      });
                      setEditingChannel(null);
                    }}
                    className="flex-1 bg-[#ff8800] text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" /> SAVE_CHANGES
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Controls Partition */}
          <div className="mt-8 space-y-6">
            {/* Channel Selector */}
            <div className="grid grid-cols-2 gap-3">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  disabled={!isPowered}
                  onClick={() => {
                    setChannel(c);
                    addToHistory(c.freq);
                  }}
                  className={cn(
                    "p-2 rounded-lg border font-mono text-[9px] uppercase tracking-tighter transition-all",
                    channel.id === c.id 
                      ? "bg-[#ff8800]/10 border-[#ff8800] text-[#ff8800]" 
                      : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Main Interaction Area */}
            <div className="flex items-center gap-4">
              {/* Emergency SOS Button */}
              <button 
                onMouseDown={handleSos}
                disabled={!isPowered}
                className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center transition-all active:scale-95",
                  isPowered ? "bg-[#ff0000]/10 border border-[#ff0000]/20 text-[#ff0000] hover:bg-[#ff0000]/20" : "bg-white/5 text-white/5"
                )}
              >
                <AlertTriangle className="w-6 h-6" />
              </button>

              {/* PTT (Push to Talk) Button */}
              <button
                disabled={!isPowered || isReceiving}
                onMouseDown={handlePttStart}
                onMouseUp={handlePttStop}
                onTouchStart={handlePttStart}
                onTouchEnd={handlePttStop}
                className={cn(
                  "flex-1 h-20 rounded-[24px] flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] select-none",
                  !isPowered ? "bg-white/5 border border-white/5 grayscale" :
                  isReceiving ? "bg-white/10 opacity-50 cursor-not-allowed" :
                  isTransmitting 
                    ? "bg-[#ff8800] text-[#000] shadow-[0_0_30px_rgba(255,136,0,0.5)]" 
                    : "bg-[#252a2f] text-white/80 border-b-4 border-black/40 hover:bg-[#2c3238]"
                )}
              >
                <Mic className={cn("w-6 h-6", isTransmitting && "animate-pulse")} />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest">{isTransmitting ? 'Transmitting' : 'Press to Talk'}</span>
              </button>
            </div>
            
            {/* Speaker Grille Pattern */}
            <div className="pt-4 grid grid-cols-6 gap-2 opacity-10">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="h-1 bg-white rounded-full" />
              ))}
            </div>
          </div>
        </div>

        {/* Brand Tag */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-white/10 font-mono text-[8px] uppercase tracking-[0.4em]">
          Emergency Tactical Communicator • Ver 2.5.0-AUDIO
        </div>
      </motion.div>
    </div>
  );
}
