import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Mic, 
  MicOff, 
  Loader2, 
  Volume2, 
  VolumeX, 
  Keyboard, 
  Send, 
  Trash2, 
  MessageSquare, 
  X, 
  Briefcase, 
  Sliders, 
  Sparkles, 
  Activity, 
  Heart, 
  Coffee, 
  Plus, 
  Check, 
  Database,
  Search,
  User,
  Clock
} from "lucide-react";
import { 
  getRoxyResponse, 
  getRoxyAudio, 
  resetRoxySession,
  fetchSessions,
  createSession,
  deleteSession,
  fetchVoiceProfiles,
  createVoiceProfile,
  fetchUserProfile,
  fetchMemories,
  createMemory,
  deleteMemory,
  fetchSpeechLogs
} from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import MiniPlayer from "./components/MiniPlayer";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";
import { getApiUrl } from "./utils/config";

const openLink = (url: string) => {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

  if (isTauri) {
    try {
      (window as any).__TAURI_INTERNALS__.invoke("open_external_url", { url });
    } catch (e) {
      console.error("Tauri open_external_url failed", e);
      window.open(url, "_blank");
    }
  } else if (isAndroid) {
    window.open(url, "_system");
  } else {
    window.open(url, "_blank");
  }
};

const renderTextWithLinks = (text: string) => {
  if (!text) return "";
  
  const tokenRegex = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g;
  const matches = [...text.matchAll(tokenRegex)];
  
  if (matches.length === 0) {
    return text;
  }
  
  const result: React.ReactNode[] = [];
  let currentIdx = 0;
  
  matches.forEach((match, matchIdx) => {
    const start = match.index!;
    const matchedText = match[0];
    
    if (start > currentIdx) {
      result.push(<span key={`text-${matchIdx}`}>{text.substring(currentIdx, start)}</span>);
    }
    
    if (matchedText.startsWith("[")) {
      const mdMatch = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(matchedText);
      if (mdMatch) {
        const linkText = mdMatch[1];
        const linkUrl = mdMatch[2];
        result.push(
          <a
            key={`link-${matchIdx}`}
            href={linkUrl}
            onClick={(e) => {
              e.preventDefault();
              openLink(linkUrl);
            }}
            className="text-pink-400 hover:text-pink-300 underline font-medium cursor-pointer"
          >
            {linkText}
          </a>
        );
      }
    } else {
      result.push(
        <a
          key={`link-${matchIdx}`}
          href={matchedText}
          onClick={(e) => {
            e.preventDefault();
            openLink(matchedText);
          }}
          className="text-pink-400 hover:text-pink-300 underline font-medium cursor-pointer break-all"
        >
          {matchedText}
        </a>
      );
    }
    
    currentIdx = start + matchedText.length;
  });
  
  if (currentIdx < text.length) {
    result.push(<span key="text-end">{text.substring(currentIdx)}</span>);
  }
  
  return result;
};

// Helper to parse message text and isolate triple-backtick code blocks
const parseMessageWithCodeBlocks = (text: string) => {
  if (!text) return [{ type: "text", content: "" }];
  
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      parts.push({ type: "text", content: text.substring(lastIndex, index) });
    }
    parts.push({ 
      type: "code", 
      language: match[1] || "txt", 
      content: match[2].trim() 
    });
    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.substring(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", content: text }];
};

// Helper for beautiful syntax coloring of code blocks without corrupting HTML tags
const highlightCode = (code: string, language: string) => {
  if (!code) return "";
  
  // Escape HTML entities to prevent rendering breakages
  let escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const comments: string[] = [];
  const strings: string[] = [];
  const numbers: string[] = [];
  const functions: string[] = [];
  const keywordsMatched: string[] = [];

  // 1. Extract Comments (so they don't get processed by other rules)
  escaped = escaped.replace(/(\/\/.*|#.*)/g, (match) => {
    comments.push(`<span class="text-emerald-400 italic opacity-75">${match}</span>`);
    return `___COMMENT_${comments.length - 1}___`;
  });

  escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, (match) => {
    comments.push(`<span class="text-emerald-400 italic opacity-75">${match}</span>`);
    return `___COMMENT_${comments.length - 1}___`;
  });

  // 2. Extract Strings
  escaped = escaped.replace(/(["'`])(.*?)\1/g, (match, quote, content) => {
    strings.push(`<span class="text-amber-200/90 font-medium">${quote}${content}${quote}</span>`);
    return `___STRING_${strings.length - 1}___`;
  });

  // 3. Extract Keywords
  const keywords = [
    "const", "let", "var", "function", "return", "class", "import", "export", 
    "from", "default", "if", "else", "for", "while", "do", "switch", "case", 
    "break", "continue", "def", "self", "print", "true", "false", "null", 
    "undefined", "new", "this", "async", "await", "try", "catch", "finally", 
    "throw", "typeof", "instanceof", "public", "private", "protected", "static",
    "void", "int", "string", "boolean", "interface", "type", "package", "char",
    "float", "double", "include", "define", "long", "short", "unsigned", "signed"
  ];
  const keywordRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
  escaped = escaped.replace(keywordRegex, (match) => {
    keywordsMatched.push(`<span class="text-violet-400 font-bold">${match}</span>`);
    return `___KEYWORD_${keywordsMatched.length - 1}___`;
  });

  // 4. Extract Numbers
  escaped = escaped.replace(/\b(\d+)\b/g, (match) => {
    numbers.push(`<span class="text-cyan-400">${match}</span>`);
    return `___NUMBER_${numbers.length - 1}___`;
  });

  // 5. Extract Function Calls
  escaped = escaped.replace(/\b(\w+)(?=\()/g, (match) => {
    functions.push(`<span class="text-sky-300">${match}</span>`);
    return `___FUNC_${functions.length - 1}___`;
  });

  // 6. Restore placeholders in reverse order
  escaped = escaped.replace(/___FUNC_(\d+)___/g, (_, idx) => functions[parseInt(idx)]);
  escaped = escaped.replace(/___NUMBER_(\d+)___/g, (_, idx) => numbers[parseInt(idx)]);
  escaped = escaped.replace(/___KEYWORD_(\d+)___/g, (_, idx) => keywordsMatched[parseInt(idx)]);
  escaped = escaped.replace(/___STRING_(\d+)___/g, (_, idx) => strings[parseInt(idx)]);
  escaped = escaped.replace(/___COMMENT_(\d+)___/g, (_, idx) => comments[parseInt(idx)]);

  return escaped;
};

// Helper to detect if text contains a code block or has code-like structure
const detectCodeInText = (text: string) => {
  if (!text) return null;
  
  // 1. Check for standard or partial backtick markdown block (streaming-friendly)
  const startIdx = text.indexOf("```");
  if (startIdx !== -1) {
    const rest = text.substring(startIdx + 3);
    const langMatch = /^(\w*)/.exec(rest);
    const lang = langMatch ? langMatch[1] : "txt";
    let code = rest.substring(lang.length);
    if (code.startsWith("\n")) {
      code = code.substring(1);
    }
    const closeIdx = code.indexOf("```");
    if (closeIdx !== -1) {
      code = code.substring(0, closeIdx);
    }
    return {
      code: code.trim(),
      language: lang || "txt"
    };
  }

  // 2. Check if the text has programming keyword patterns
  const lines = text.split("\n");
  if (lines.length >= 3) {
    const codeKeywords = ["const ", "let ", "var ", "function ", "return ", "import ", "def ", "class ", "void ", "public ", "private ", "struct "];
    let matchCount = 0;
    for (const line of lines) {
      if (codeKeywords.some(kw => line.trim().startsWith(kw) || line.includes(kw))) {
        matchCount++;
      }
    }
    
    const hasCurlyBraces = text.includes("{") && text.includes("}");
    const hasIndents = lines.some(line => line.startsWith("  ") || line.startsWith("\t"));
    
    if (matchCount >= 2 && (hasCurlyBraces || hasIndents)) {
      let lang = "txt";
      if (text.includes("def ") || text.includes("import ") || text.includes("print(")) lang = "python";
      else if (text.includes("const ") || text.includes("function ") || text.includes("let ")) lang = "javascript";
      
      return {
        code: text.trim(),
        language: lang
      };
    }
  }

  return null;
};

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "roxy";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);

  const [isMuted, setIsMuted] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [aiMode, setAiMode] = useState<"professional" | "friend">("professional");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [mediaQuery, setMediaQuery] = useState<string | null>(null);

  // Cinematic Code Panel States
  const [activeCodeDetails, setActiveCodeDetails] = useState<string | null>(null);
  const [activeCodeLanguage, setActiveCodeLanguage] = useState<string>("txt");
  const [codeCopied, setCodeCopied] = useState(false);

  // Browser action redirect states
  const [activeRedirectUrl, setActiveRedirectUrl] = useState<string | null>(null);

  // Omni DB States
  const [sessionId, setSessionId] = useState<string>("sess_default");
  const [sessions, setSessions] = useState<any[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<any[]>([]);
  const [activeVoiceProfileId, setActiveVoiceProfileId] = useState<string>("prof_default");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [speechLogs, setSpeechLogs] = useState<any[]>([]);
  
  // Onboarding welcome states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [enteredName, setEnteredName] = useState("");
  const [selectedGender, setSelectedGender] = useState<"Male" | "Female" | "">("");
  const [isServerConnected, setIsServerConnected] = useState<boolean | null>(null);
  
  // Custom HUD states
  const [activeTab, setActiveTab] = useState<"chat" | "sessions" | "voice" | "memory" | "logs" | "settings">("chat");
  const [customApiUrl, setCustomApiUrl] = useState(localStorage.getItem("ROXY_API_URL") || localStorage.getItem("NIDHI_API_URL") || "");
  const [customWsUrl, setCustomWsUrl] = useState(localStorage.getItem("ROXY_WS_URL") || localStorage.getItem("NIDHI_WS_URL") || "");
  const [newSessionName, setNewSessionName] = useState("");
  const [newMemoryText, setNewMemoryText] = useState("");
  const [memorySearchQuery, setMemorySearchQuery] = useState("");
  const [searchedMemories, setSearchedMemories] = useState<any[] | null>(null);

  // Custom voice profile creator state
  const [showVoiceCreator, setShowVoiceCreator] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState("");
  const [customPitch, setCustomPitch] = useState<number>(0.0);
  const [customSpeed, setCustomSpeed] = useState<number>(1.0);
  const [customGain, setCustomGain] = useState<number>(0.0);
  const [customWhisper, setCustomWhisper] = useState<boolean>(false);
  const [customReverb, setCustomReverb] = useState<number>(0.0);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const liveRoxyAccumulatorRef = useRef("");
  const historyEndRef = useRef<HTMLDivElement>(null);

  // Sync to local reference
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const checkServerConnection = async (url: string): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url + "/api/sessions", { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.status === 200 || res.ok;
    } catch (e) {
      return false;
    }
  };

  // Load Sessions, Voice Profiles, and User Profile on Startup
  const loadInitialData = async () => {
    // Auto-request microphone permission on startup to avoid blocks
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach(track => track.stop());
        })
        .catch((err) => {
          console.warn("Microphone permission auto-request rejected/failed", err);
        });
    }

    const currentApiUrl = getApiUrl();
    const isOk = await checkServerConnection(currentApiUrl);
    setIsServerConnected(isOk);

    try {
      const [sessList, vpList, profile] = await Promise.all([
        fetchSessions(),
        fetchVoiceProfiles(),
        fetchUserProfile("lo")
      ]);
      
      if (sessList && sessList.length > 0) {
        setSessions(sessList);
        // Find default or select first
        const hasDefault = sessList.some(s => s.session_id === "sess_default");
        setSessionId(hasDefault ? "sess_default" : sessList[0].session_id);
      }
      
      if (vpList && vpList.length > 0) {
        setVoiceProfiles(vpList);
      }
      
      // Load local cached profile as fallback/offline store
      const localCached = localStorage.getItem("ROXY_LOCAL_PROFILE");
      const cachedProfile = localCached ? JSON.parse(localCached) : null;

      let mergedProfile = profile;
      if (!mergedProfile && cachedProfile) {
        mergedProfile = cachedProfile;
      } else if (mergedProfile && cachedProfile) {
        mergedProfile.dynamic_preferences = {
          ...cachedProfile.dynamic_preferences,
          ...mergedProfile.dynamic_preferences
        };
      }

      if (mergedProfile) {
        setUserProfile(mergedProfile);
      }

      // Prompt onboarding only if name and gender are both missing
      const isNameSaved = mergedProfile?.dynamic_preferences?.name;
      const isGenderSaved = mergedProfile?.dynamic_preferences?.gender;
      if (!isNameSaved || !isGenderSaved) {
        setShowOnboarding(true);
      }
    } catch (e) {
      console.error("Error loading seed database records", e);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Reload history, memories, and audit stats whenever sessionId changes
  const loadSessionData = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(getApiUrl() + `/api/messages?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
      
      const [mems, logs] = await Promise.all([
        fetchMemories(sessionId),
        fetchSpeechLogs(sessionId)
      ]);
      
      setMemories(mems);
      setSpeechLogs(logs);
    } catch (err) {
      console.error("Failed to load session-specific data", err);
    }
  };

  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  // Periodically poll relationship details (for responsive background engine sync) and verify connection
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const currentApiUrl = getApiUrl();
        const isOk = await checkServerConnection(currentApiUrl);
        setIsServerConnected(isOk);

        if (isOk) {
          const profile = await fetchUserProfile("lo");
          if (profile) {
            const localCached = localStorage.getItem("ROXY_LOCAL_PROFILE");
            const cachedProfile = localCached ? JSON.parse(localCached) : null;
            if (cachedProfile) {
              profile.dynamic_preferences = {
                ...cachedProfile.dynamic_preferences,
                ...profile.dynamic_preferences
              };
            }
            setUserProfile(profile);
          }
        }
      } catch (e) {
        console.warn("Periodic profile sync failed:", e);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Sync isMuted state to Live Session
  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const scrollToHistoryBottom = () => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (showHistory && activeTab === "chat") {
      setTimeout(() => {
        scrollToHistoryBottom();
      }, 100);
    }
  }, [messages, showHistory, activeTab]);

  // Helper to save a message directly to SQLite
  const saveMessageToDB = async (msg: ChatMessage) => {
    try {
      await fetch(getApiUrl() + "/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: msg.id, 
          sender: msg.sender, 
          text: msg.text,
          sessionId 
        }),
      });
      // Refresh logs
      const logs = await fetchSpeechLogs(sessionId);
      setSpeechLogs(logs);
    } catch (err) {
      console.error("Error writing message to database:", err);
    }
  };

  // Find active voice profile object
  const getActiveProfileObj = () => {
    return voiceProfiles.find(vp => vp.profile_id === activeVoiceProfileId) || {
      pitch_shift: 0.0,
      speed_rate: 1.0,
      volume_gain: 0.0,
      whisper_mode: 0,
      reverb_wetness: 0.0
    };
  };

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), sender: "user", text: finalTranscript };
    setMessages((prev) => [...prev, userMsg]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);
    let responseText = "";

    const activeProfile = getActiveProfileObj();

    if (commandResult.actionType === "play_media") {
      responseText = commandResult.action;
      const roxyMsg: ChatMessage = { id: Date.now().toString() + "-n", sender: "roxy", text: responseText };
      setMessages((prev) => [...prev, roxyMsg]);
      await saveMessageToDB(userMsg);
      await saveMessageToDB(roxyMsg);
      
      try {
        const decodedQuery = decodeURIComponent(commandResult.url || "");
        console.log(`Pre-resolving video ID for text command: "${decodedQuery}"`);
        const res = await fetch(getApiUrl() + `/api/get-song?q=${encodeURIComponent(decodedQuery)}&t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.videoId) {
            setMediaQuery(data.videoId);
          } else {
            setMediaQuery(decodedQuery);
          }
        } else {
          setMediaQuery(decodedQuery);
        }
      } catch (err) {
        setMediaQuery(decodeURIComponent(commandResult.url || ""));
      }

      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getRoxyAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64, activeProfile);
        }
      }
      setAppState("idle");
    } else if (commandResult.actionType === "open_url") {
      if (commandResult.url) {
        openLink(commandResult.url);
      }

      responseText = commandResult.action;
      const roxyMsg: ChatMessage = { id: Date.now().toString() + "-n", sender: "roxy", text: responseText };
      setMessages((prev) => [...prev, roxyMsg]);
      
      await saveMessageToDB(userMsg);
      await saveMessageToDB(roxyMsg);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getRoxyAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64, activeProfile);
        }
      }

      setAppState("idle");

      // Show toast if popup blocker caught it
      if (commandResult.url && (!win || win.closed || typeof win.closed === "undefined")) {
        setActiveRedirectUrl(commandResult.url);
      }
    } else {
      // 2. Core Chatting via Server-Side Gemini (saves automatically on server with Auto-RAG!)
      const chatRes = await getRoxyResponse(finalTranscript, aiMode, sessionId, activeVoiceProfileId);
      responseText = chatRes.text;
      const roxyMsg: ChatMessage = { id: Date.now().toString() + "-n", sender: "roxy", text: responseText };
      setMessages((prev) => [...prev, roxyMsg]);

      // Execute toolCall returned by Gemini if any
      if (chatRes.toolCall) {
        const { name, args } = chatRes.toolCall;
        if (name === "executeBrowserAction") {
          if (args.actionType === "youtube" || args.actionType === "play_media" || args.actionType === "play") {
            setMediaQuery(args.query);
          } else if (args.actionType === "open" || args.actionType === "open_url") {
            let url = args.query;
            if (!url.startsWith("http")) {
              url = "https://" + url;
            }
            setTimeout(() => {
              openLink(url);
            }, 1000);
          } else if (args.actionType === "spotify") {
            const url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
            setTimeout(() => {
              openLink(url);
            }, 1000);
          } else if (args.actionType === "whatsapp") {
            const url = `https://web.whatsapp.com/send?phone=${args.target || ""}&text=${encodeURIComponent(args.query)}`;
            setTimeout(() => {
              openLink(url);
            }, 1000);
          }
        } else if (name === "displayInConsole") {
          setActiveCodeDetails(args.content);
          setActiveCodeLanguage(args.language || "txt");
        }
      } else {
        // Auto-trigger Code Details Panel if response has code blocks
        const codeResult = detectCodeInText(responseText);
        if (codeResult) {
          setActiveCodeDetails(codeResult.code);
          setActiveCodeLanguage(codeResult.language);
        }
      }
      
      // Fetch updated database states
      setTimeout(async () => {
        const [mems, profile, logs] = await Promise.all([
          fetchMemories(sessionId),
          fetchUserProfile("lo"),
          fetchSpeechLogs(sessionId)
        ]);
        setMemories(mems);
        setUserProfile(profile);
        setSpeechLogs(logs);
      }, 1000);

      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getRoxyAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64, activeProfile);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive, sessionId, activeVoiceProfileId, voiceProfiles]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetRoxySession();
    } else {
      try {
        setIsSessionActive(true);
        resetRoxySession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = async (sender, text) => {
          if (sender === "user") {
            liveRoxyAccumulatorRef.current = "";
          } else if (sender === "roxy") {
            liveRoxyAccumulatorRef.current += text;
          }

          const newMsg: ChatMessage = { id: Date.now().toString() + "-" + sender, sender, text };
          setMessages((prev) => [...prev, newMsg]);
          await saveMessageToDB(newMsg);

          // Auto-trigger Code Details Panel if we detect code blocks inside accumulated text
          if (liveRoxyAccumulatorRef.current) {
            const codeResult = detectCodeInText(liveRoxyAccumulatorRef.current);
            if (codeResult) {
              setActiveCodeDetails(codeResult.code);
              setActiveCodeLanguage(codeResult.language);
            }
          }
        };
        
        session.onCommand = (actionType, queryOrUrl) => {
          if (actionType === "play_media") {
            setMediaQuery(queryOrUrl);
          } else {
            setTimeout(() => {
              openLink(queryOrUrl);
            }, 1000);
          }
        };

        session.onConsoleDisplay = (language, content) => {
          setActiveCodeDetails(content);
          setActiveCodeLanguage(language);
        };

        await session.start(aiMode, "lo");
      } catch (e) {
        console.error("Failed to start live session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (customApiUrl.trim()) {
      localStorage.setItem("ROXY_API_URL", customApiUrl.trim());
    } else {
      localStorage.removeItem("ROXY_API_URL");
    }
    if (customWsUrl.trim()) {
      localStorage.setItem("ROXY_WS_URL", customWsUrl.trim());
    } else {
      localStorage.removeItem("ROXY_WS_URL");
    }
    alert("Connection settings saved! Reloading application...");
    window.location.reload();
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  // Custom database session creator
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;
    const newSess = await createSession("Roxy", newSessionName.trim());
    if (newSess) {
      setSessions(prev => [newSess, ...prev]);
      setSessionId(newSess.session_id);
      setNewSessionName("");
    }
  };

  // Custom voice profile creator
  const handleCreateVoiceProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoiceName.trim()) return;
    
    const profile = await createVoiceProfile({
      name: newVoiceName.trim(),
      pitchShift: customPitch,
      speedRate: customSpeed,
      volumeGain: customGain,
      whisperMode: customWhisper,
      reverbWetness: customReverb
    });
    
    if (profile) {
      setVoiceProfiles(prev => [...prev, profile]);
      setActiveVoiceProfileId(profile.profile_id);
      setNewVoiceName("");
      setShowVoiceCreator(false);
    }
  };

  // Custom manual memory builder
  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    const memory = await createMemory(sessionId, newMemoryText.trim(), 3);
    if (memory) {
      setMemories(prev => [memory, ...prev]);
      setNewMemoryText("");
    }
  };

  // Custom cosine-similarity visual search
  const handleSearchMemory = () => {
    if (!memorySearchQuery.trim()) {
      setSearchedMemories(null);
      return;
    }
    
    // Simulate frontend filter if RAG offline, or let Cosine-similarity query on memories state
    const matches = memories.map(m => {
      // Basic word match scoring to demonstrate vector-similarity ordering locally
      const words = memorySearchQuery.toLowerCase().split(" ");
      let score = 0.1;
      for (const w of words) {
        if (m.content.toLowerCase().includes(w)) score += 0.22;
      }
      return { ...m, similarity: Math.min(0.99, score) };
    }).filter(m => m.similarity > 0.1)
      .sort((a, b) => b.similarity - a.similarity);
      
    setSearchedMemories(matches);
  };

  // Dynamic status text for user profile relationship
  const getRelationshipStatus = (score: number) => {
    if (score >= 9.0) return "Soulmates / Besties 💖";
    if (score >= 7.5) return "Extremely Close Bonding 🥰";
    if (score >= 6.0) return "Loyal Friend 🤝";
    if (score >= 4.0) return "Casual Buddy 🙂";
    return "Acquaintance / Stranger 👤";
  };

  const handleSaveOnboarding = async () => {
    if (!enteredName.trim()) {
      alert("Please enter your name!");
      return;
    }
    if (!selectedGender) {
      alert("Please select your gender!");
      return;
    }
    
    const updatedPrefs = {
      ...(userProfile?.dynamic_preferences || {}),
      name: enteredName.trim(),
      gender: selectedGender
    };
    
    const fallbackProfile = {
      username: "lo",
      relationship_score: userProfile?.relationship_score || 5.0,
      dynamic_preferences: updatedPrefs
    };

    // Optimistically save profile locally and dismiss welcome modal so the button NEVER freezes/gets stuck
    setUserProfile(fallbackProfile);
    localStorage.setItem("ROXY_LOCAL_PROFILE", JSON.stringify(fallbackProfile));
    setShowOnboarding(false);
    
    try {
      const res = await fetch(getApiUrl() + "/api/user-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "lo",
          preferences: updatedPrefs
        })
      });
      if (res.ok) {
        const updatedProfile = await res.json();
        setUserProfile(updatedProfile);
        localStorage.setItem("ROXY_LOCAL_PROFILE", JSON.stringify(updatedProfile));
      } else {
        console.warn("Failed to sync profile with server database, using offline storage fallback.");
      }
    } catch (e) {
      console.warn("Error syncing profile with server database, using offline storage fallback:", e);
    }
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050508] text-white flex flex-row font-sans relative overflow-hidden m-0 p-0">
      {showOnboarding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020205]/85 backdrop-blur-md pointer-events-auto">
          <div className="w-[90%] max-w-md bg-[#090915]/95 border border-white/10 rounded-3xl p-8 shadow-[0_0_50px_rgba(139,92,246,0.25)] flex flex-col gap-6 relative overflow-hidden text-center">
            <div className="absolute top-[-20%] left-[-20%] w-[50%] h-[50%] bg-violet-600/20 blur-[60px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[50%] h-[50%] bg-pink-600/20 blur-[60px] rounded-full pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.4)] animate-bounce mb-2">
                <span className="text-white text-2xl">✨</span>
              </div>
              <h2 className="text-2xl font-serif font-bold text-white">Welcome to Roxy AI</h2>
              <p className="text-sm text-white/60">Let's personalize your companion experience!</p>
            </div>

            <div className="relative z-10 flex flex-col gap-4 text-left">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="onboarding-name-input" className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">What should I call you?</label>
                <input
                  id="onboarding-name-input"
                  type="text"
                  value={enteredName}
                  onChange={(e) => setEnteredName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full bg-white/5 border border-white/10 focus:border-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all font-sans"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">Select your gender</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    id="gender-btn-male"
                    type="button"
                    onClick={() => setSelectedGender("Male")}
                    className={`py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      selectedGender === "Male"
                        ? "bg-blue-500/15 border-blue-500/60 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <span className="text-xl">👦</span>
                    <span>Boy / Male</span>
                  </button>

                  <button
                    id="gender-btn-female"
                    type="button"
                    onClick={() => setSelectedGender("Female")}
                    className={`py-3 rounded-xl border text-sm font-medium transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      selectedGender === "Female"
                        ? "bg-pink-500/15 border-pink-500/60 text-pink-300 shadow-[0_0_15px_rgba(236,72,153,0.2)]"
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <span className="text-xl">👧</span>
                    <span>Girl / Female</span>
                  </button>
                </div>
              </div>
            </div>

          {isServerConnected === false && (
            <div className="relative z-10 p-3 bg-red-950/20 border border-red-500/20 rounded-2xl flex flex-col gap-2 text-left text-xs text-white/80">
              <p className="font-semibold text-red-300">⚠️ Backend server unreachable</p>
              <p className="text-[10px] text-white/50 leading-relaxed font-mono">
                Expected at: {getApiUrl()}<br />
                If running on a phone/emulator, please enter your computer's local IP address:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customApiUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomApiUrl(val);
                    try {
                      const url = new URL(val);
                      const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
                      setCustomWsUrl(`${wsProto}//${url.host}`);
                    } catch (err) {}
                  }}
                  placeholder="e.g. http://192.168.1.100:3000"
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-red-500/40"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (customApiUrl.trim()) {
                      localStorage.setItem("ROXY_API_URL", customApiUrl.trim());
                      if (customWsUrl.trim()) {
                        localStorage.setItem("ROXY_WS_URL", customWsUrl.trim());
                      }
                      const ok = await checkServerConnection(customApiUrl.trim());
                      setIsServerConnected(ok);
                      if (ok) {
                        loadInitialData();
                      }
                    }
                  }}
                  className="px-3 py-1 bg-red-900/40 border border-red-800 text-[10px] font-mono rounded-lg hover:bg-red-800/60 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

            <button
              id="onboarding-submit-btn"
              type="button"
              onClick={handleSaveOnboarding}
              className="relative z-10 w-full py-3 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white rounded-xl text-sm font-bold shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all transform active:scale-95 cursor-pointer"
            >
              Start Conversation
            </button>
          </div>
        </div>
      )}

      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-25%] left-[-15%] w-[60%] h-[60%] bg-violet-600/15 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-25%] right-[-15%] w-[60%] h-[60%] bg-pink-600/15 blur-[150px] rounded-full animate-pulse" />
      </div>

      {/* Floating Media Player */}
      {mediaQuery && (
        <MiniPlayer 
          query={mediaQuery} 
          onClose={() => setMediaQuery(null)} 
        />
      )}

      {/* Cinematic Code Details Console Panel (Left 75% Width) */}
      <AnimatePresence>
        {activeCodeDetails !== null && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "75%", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 200 }}
            className="h-full border-r border-white/10 bg-[#020206]/98 backdrop-blur-2xl flex flex-col pt-24 pb-6 px-8 relative overflow-hidden shrink-0 pointer-events-auto"
          >
            {/* Ambient Background Glow inside Code Panel */}
            <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0 opacity-40">
              <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[120px] rounded-full" />
              <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-pink-500/10 blur-[120px] rounded-full" />
            </div>

            {/* Console Toolbar */}
            <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-4 mb-4 shrink-0 font-mono select-none">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-white tracking-widest flex items-center gap-1.5">
                    📁 ROXY CODE CONSOLE
                  </span>
                  <span className="text-[9px] text-white/40 tracking-wider">
                    // PLATFORM NODE // LANGUAGE: <span className="text-violet-400 font-bold uppercase">{activeCodeLanguage}</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                {/* Copy Button */}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(activeCodeDetails || "");
                    setCodeCopied(true);
                    setTimeout(() => setCodeCopied(false), 2000);
                  }}
                  className={`px-3 py-1.5 border rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-md ${
                    codeCopied 
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white/80"
                  }`}
                  title="Copy snippet to clipboard"
                >
                  {codeCopied ? (
                    <>
                      <Check size={12} className="animate-bounce" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Database size={12} className="text-violet-400" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>

                {/* Download Button */}
                <button
                  type="button"
                  onClick={() => {
                    const ext = activeCodeLanguage === "javascript" ? "js" : activeCodeLanguage === "typescript" ? "ts" : activeCodeLanguage === "python" ? "py" : activeCodeLanguage === "html" ? "html" : activeCodeLanguage === "css" ? "css" : "txt";
                    const blob = new Blob([activeCodeDetails], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `roxy-code-snippet.${ext}`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 hover:border-violet-500/50 rounded-lg text-[10px] font-bold text-violet-300 transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                  title="Download snippet file"
                >
                  <Clock size={12} className="text-pink-400 rotate-180" />
                  <span>Download Code</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setActiveCodeDetails(null)}
                  className="p-1.5 border border-white/10 hover:border-white/25 rounded-lg text-white/50 hover:text-white cursor-pointer transition-colors bg-white/5"
                  title="Close console"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Code Body Container */}
            <div className="relative z-10 flex-1 bg-black/30 border border-white/5 rounded-2xl p-4 md:p-6 overflow-hidden flex flex-row">
              {/* Scrollable Container for both numbers and code */}
              <div className="flex-1 overflow-auto flex flex-row items-start">
                {/* Line Numbers Column (Sticky on left for horizontal scrolling) */}
                <div className="w-10 pr-4 select-none border-r border-white/5 font-mono text-[11px] leading-relaxed text-white/20 text-right sticky left-0 bg-[#020206] z-10 pt-0.5">
                  {(activeCodeDetails || "").split("\n").map((_, lineIdx) => (
                    <div key={lineIdx}>{lineIdx + 1}</div>
                  ))}
                </div>

                {/* Code Block */}
                <div className="flex-1 pl-4">
                  <pre className="font-mono text-[11px] leading-relaxed text-white/90 whitespace-pre-wrap break-all">
                    <code 
                      dangerouslySetInnerHTML={{ 
                        __html: highlightCode(activeCodeDetails || "", activeCodeLanguage) 
                      }} 
                    />
                  </pre>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={{ 
          width: activeCodeDetails !== null ? "25%" : "100%",
          borderLeft: activeCodeDetails !== null ? "1px solid rgba(255,255,255,0.1)" : "none",
          backgroundColor: activeCodeDetails !== null ? "rgba(5,5,11,0.5)" : "transparent"
        }}
        transition={{ type: "spring", damping: 30, stiffness: 200 }}
        className="h-full flex flex-col items-center justify-between relative overflow-hidden"
      >

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6 bg-gradient-to-b from-[#050508]/80 to-transparent backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-violet-500 via-indigo-500 to-pink-500 flex items-center justify-center font-bold text-base shadow-[0_0_20px_rgba(139,92,246,0.5)]">
            R
          </div>
          <div>
            <h1 className="text-xl font-serif font-medium tracking-wide opacity-90">Roxy</h1>
            <div className="text-[10px] font-mono text-violet-400/80 tracking-widest uppercase">Companion console</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Server Status Indicator */}
          {isServerConnected === false && (
            <button
              onClick={() => {
                setActiveTab("settings");
                setShowHistory(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-950/40 border border-red-500/30 rounded-full text-xs font-mono text-red-400 hover:bg-red-900/50 transition-colors shadow-[0_0_15px_rgba(239,68,68,0.2)] cursor-pointer"
              title="Server Offline. Click to configure Connection Settings."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              <span>Offline</span>
            </button>
          )}
          {isServerConnected === true && (
            <div 
              className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-green-950/20 border border-green-500/20 rounded-full text-xs font-mono text-green-400"
              title="Connected to server"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span>Online</span>
            </div>
          )}

          {/* Active Voice Indicator */}
          <div className={`${activeCodeDetails !== null ? "hidden" : "hidden md:flex"} items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-mono text-white/70`}>
            <Sliders size={12} className="text-violet-400" />
            <span className="opacity-80">Voice:</span>
            <span className="text-pink-400 font-semibold">{getActiveProfileObj().name}</span>
          </div>

          {/* Active Session Indicator */}
          <div className={`${activeCodeDetails !== null ? "hidden" : "hidden md:flex"} items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-mono text-white/70`}>
            <Database size={12} className="text-cyan-400" />
            <span className="opacity-80">Room ID:</span>
            <span className="text-cyan-400 font-semibold">{sessionId.substring(0, 10)}...</span>
          </div>

          {/* Active Mode Indicator */}
          <div className={`${activeCodeDetails !== null ? "hidden" : "hidden md:flex"} items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-mono text-white/70`}>
            <User size={12} className={aiMode === "professional" ? "text-blue-400" : "text-yellow-400"} />
            <span className="opacity-80">Persona:</span>
            <span className={`font-semibold capitalize ${aiMode === "professional" ? "text-blue-400" : "text-yellow-400"}`}>
              {aiMode}
            </span>
          </div>

          {/* Account Settings Dropdown Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className={`p-2 rounded-full cursor-pointer border transition-all ${
                showAccountDropdown 
                  ? "bg-violet-500/20 text-violet-400 border-violet-500/40 shadow-[0_0_15px_rgba(139,92,246,0.3)]" 
                  : "bg-white/5 hover:bg-white/10 border-white/10"
              }`}
              title="Select AI Persona Modes"
            >
              <User size={18} className="opacity-90" />
            </button>

            {/* Persona Selection Dropdown */}
            <AnimatePresence>
              {showAccountDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  className="absolute right-0 mt-2 w-72 bg-[#05050e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-[0_15px_50px_rgba(0,0,0,0.8)] z-50 flex flex-col gap-3 font-sans"
                >
                  <div className="flex flex-col gap-0.5 border-b border-white/10 pb-2">
                    <span className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">Roxy Persona Modes</span>
                    <span className="text-[10px] text-white/40">Select Roxy's cognitive behavior</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {/* Professional Mode */}
                    <button
                      type="button"
                      onClick={() => { setAiMode("professional"); setShowAccountDropdown(false); }}
                      className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex flex-col gap-1 cursor-pointer select-none ${
                        aiMode === "professional"
                          ? "bg-blue-500/10 border-blue-500/40 text-blue-300 font-semibold shadow-[0_0_15px_rgba(59,130,246,0.05)]"
                          : "bg-white/0 border-white/5 text-white/60 hover:bg-white/5 hover:border-white/10"
                      }`}
                    >
                      <div className="flex justify-between items-center w-full font-bold">
                        <span className="flex items-center gap-1.5">💼 Professional Mode</span>
                        {aiMode === "professional" ? (
                          <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full border border-blue-500/30">DEFAULT</span>
                        ) : (
                          <Check size={12} className="opacity-0" />
                        )}
                      </div>
                      <span className="text-[10px] text-white/40 font-normal leading-relaxed">Formal, polite, highly intelligent corporate brain.</span>
                    </button>

                    {/* Friend Mode */}
                    <button
                      type="button"
                      onClick={() => { setAiMode("friend"); setShowAccountDropdown(false); }}
                      className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex flex-col gap-1 cursor-pointer select-none ${
                        aiMode === "friend"
                          ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-300 font-semibold shadow-[0_0_15px_rgba(234,179,8,0.05)]"
                          : "bg-white/0 border-white/5 text-white/60 hover:bg-white/5 hover:border-white/10"
                      }`}
                    >
                      <div className="flex justify-between items-center w-full font-bold">
                        <span className="flex items-center gap-1.5">😎 Friend Mode</span>
                        {aiMode === "friend" && <Check size={12} className="text-yellow-400" />}
                      </div>
                      <span className="text-[10px] text-white/40 font-normal leading-relaxed">Best buddy, roasting, snappy Bangalore Kanglish vibes.</span>
                    </button>

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sliding HUD Dashboard Toggle */}
          <button
            onClick={() => {
              setShowHistory(!showHistory);
            }}
            className={`p-2 rounded-full cursor-pointer border transition-all ${
              showHistory 
                ? "bg-pink-500/20 text-pink-400 border-pink-500/40 shadow-[0_0_15px_rgba(236,72,153,0.3)]" 
                : "bg-white/5 hover:bg-white/10 border-white/10"
            }`}
            title="Toggle Memory Panel & HUD"
          >
            <MessageSquare size={18} className="opacity-90" />
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 cursor-pointer"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70 text-red-400" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
        </div>
      </header>

      {/* Sliding Premium HUD Console Panel */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="absolute top-0 right-0 h-full w-full sm:w-[500px] bg-[#05050b]/92 backdrop-blur-2xl border-l border-white/10 z-30 flex flex-col pt-24 pb-6 px-6 shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden pointer-events-auto"
          >
            {/* Header / Tabs */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="text-violet-400 animate-pulse" size={18} />
                <h2 className="text-lg font-serif tracking-wider font-semibold text-white">Roxy AI HUD Console</h2>
              </div>
              <button 
                onClick={() => setShowHistory(false)}
                className="p-1 rounded-full hover:bg-white/10 text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tab Links */}
            <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 mb-4 select-none justify-between text-xs font-mono select-none shrink-0">
              <button 
                onClick={() => setActiveTab("chat")}
                className={`flex-1 py-1.5 rounded-md text-center cursor-pointer transition-all ${activeTab === "chat" ? "bg-violet-600/30 text-violet-300 font-bold border border-violet-500/25" : "text-white/60 hover:text-white"}`}
              >
                Chat history
              </button>
              <button 
                onClick={() => setActiveTab("sessions")}
                className={`flex-1 py-1.5 rounded-md text-center cursor-pointer transition-all ${activeTab === "sessions" ? "bg-violet-600/30 text-violet-300 font-bold border border-violet-500/25" : "text-white/60 hover:text-white"}`}
              >
                Sessions
              </button>
              <button 
                onClick={() => setActiveTab("voice")}
                className={`flex-1 py-1.5 rounded-md text-center cursor-pointer transition-all ${activeTab === "voice" ? "bg-violet-600/30 text-violet-300 font-bold border border-violet-500/25" : "text-white/60 hover:text-white"}`}
              >
                Voice tuning
              </button>
              <button 
                onClick={() => setActiveTab("memory")}
                className={`flex-1 py-1.5 rounded-md text-center cursor-pointer transition-all ${activeTab === "memory" ? "bg-violet-600/30 text-violet-300 font-bold border border-violet-500/25" : "text-white/60 hover:text-white"}`}
              >
                Memories
              </button>
              <button 
                onClick={() => setActiveTab("logs")}
                className={`flex-1 py-1.5 rounded-md text-center cursor-pointer transition-all ${activeTab === "logs" ? "bg-violet-600/30 text-violet-300 font-bold border border-violet-500/25" : "text-white/60 hover:text-white"}`}
              >
                Logs
              </button>
              <button 
                onClick={() => setActiveTab("settings")}
                className={`flex-1 py-1.5 rounded-md text-center cursor-pointer transition-all ${activeTab === "settings" ? "bg-violet-600/30 text-violet-300 font-bold border border-violet-500/25" : "text-white/60 hover:text-white"}`}
              >
                Settings
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-hide flex flex-col">
              
              {/* TAB 1: MESSAGE LOGS */}
              {activeTab === "chat" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-4">
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-white/40 text-sm italic gap-2 text-center pt-8">
                        <p>Lo, no chats in this room.</p>
                        <p className="text-xs">Type a msg or start a voice session to begin!</p>
                      </div>
                    ) : (
                      messages.map((msg, i) => (
                        <div 
                          key={msg.id || i} 
                          className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                        >
                          <div 
                            className={`
                              max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed
                              ${msg.sender === "user" 
                                ? "bg-violet-600/30 text-violet-100 border border-violet-500/20 rounded-tr-none" 
                                : "bg-pink-600/10 text-pink-100 border border-pink-500/10 rounded-tl-none shadow-[0_0_15px_rgba(236,72,153,0.05)]"
                              }
                            `}
                          >
                            {parseMessageWithCodeBlocks(msg.text).map((part, pIdx) => {
                              if (part.type === "code") {
                                return (
                                  <div key={pIdx} className="my-2 p-3 bg-black/40 border border-white/10 rounded-xl font-mono text-[11px] leading-normal overflow-x-auto select-none">
                                    <div className="flex justify-between items-center text-[9px] text-white/40 uppercase mb-2 font-mono">
                                      <span>{part.language || "code"}</span>
                                      <span className="text-violet-400 font-bold bg-violet-500/10 border border-violet-500/25 px-1.5 py-0.5 rounded">CODE BLOCKS</span>
                                    </div>
                                    <pre className="text-white/80 whitespace-pre-wrap">{part.content.substring(0, 100)}{part.content.length > 100 ? "..." : ""}</pre>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveCodeDetails(part.content);
                                        setActiveCodeLanguage(part.language || "txt");
                                      }}
                                      className="mt-2.5 w-full py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 hover:border-violet-500/50 rounded-lg text-[10px] font-sans font-bold text-violet-300 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <span>🔍 Visual Code Panel</span>
                                    </button>
                                  </div>
                                );
                              }
                              return <span key={pIdx} className="whitespace-pre-wrap">{renderTextWithLinks(part.content)}</span>;
                            })}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-white/30 uppercase font-mono tracking-wider">
                              {msg.sender === "user" ? "You" : "Roxy"}
                            </span>
                            {msg.sender === "roxy" && (
                              <button
                                type="button"
                                onClick={() => {
                                  const codeResult = detectCodeInText(msg.text);
                                  if (codeResult) {
                                    setActiveCodeDetails(codeResult.code);
                                    setActiveCodeLanguage(codeResult.language);
                                  } else {
                                    setActiveCodeDetails(msg.text);
                                    setActiveCodeLanguage("markdown");
                                  }
                                }}
                                className="text-[9px] text-violet-400/80 hover:text-violet-400 font-mono tracking-wider cursor-pointer underline transition-colors"
                              >
                                [🔍 Inspect Details]
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={historyEndRef} />
                  </div>
                  
                  {/* Quick clear messages */}
                  {messages.length > 0 && (
                    <button
                      onClick={async () => {
                        if (confirm("Reset current chat history?")) {
                          await fetch(getApiUrl() + `/api/messages?sessionId=${sessionId}`, { method: "DELETE" });
                          setMessages([]);
                        }
                      }}
                      className="w-full py-2 bg-red-950/20 border border-red-900/40 rounded-lg text-xs font-mono text-red-400 hover:bg-red-900/20 cursor-pointer transition-all flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Reset Session Messages
                    </button>
                  )}
                </div>
              )}

              {/* TAB 2: SESSION MANAGEMENT */}
              {activeTab === "sessions" && (
                <div className="space-y-4">
                  {/* Create New Session */}
                  <form onSubmit={handleCreateSession} className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="New session name/summary..."
                      value={newSessionName}
                      onChange={e => setNewSessionName(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:border-violet-500 outline-none"
                    />
                    <button 
                      type="submit" 
                      className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-mono cursor-pointer flex items-center gap-1"
                    >
                      <Plus size={12} /> Create
                    </button>
                  </form>

                  {/* List Sessions */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono text-white/50 tracking-wider uppercase border-b border-white/5 pb-1">Conversation Rooms</h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {sessions.map((sess) => (
                        <div 
                          key={sess.session_id}
                          onClick={() => setSessionId(sess.session_id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer relative group flex justify-between items-start ${
                            sessionId === sess.session_id 
                              ? "bg-violet-600/10 border-violet-500/40 shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                              : "bg-white/5 border-white/5 hover:border-white/15"
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-xs text-white truncate block">
                                {sess.summary || "Unnamed Chat Session"}
                              </span>
                              {sessionId === sess.session_id && (
                                <span className="bg-violet-500/20 text-violet-300 text-[8px] font-mono px-1.5 py-0.5 rounded-full border border-violet-500/30">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-white/40 block font-mono">
                              ID: {sess.session_id}
                            </span>
                          </div>
                          
                          {/* Delete session option */}
                          {sess.session_id !== "sess_default" && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm("Delete this session entirely? This cascades and wipes all associated messages, logs, and memories.")) {
                                  const success = await deleteSession(sess.session_id);
                                  if (success) {
                                    setSessions(prev => prev.filter(s => s.session_id !== sess.session_id));
                                    if (sessionId === sess.session_id) {
                                      setSessionId("sess_default");
                                    }
                                  }
                                }
                              }}
                              className="p-1 rounded bg-red-950/20 text-red-400 border border-red-900/30 opacity-0 group-hover:opacity-100 hover:bg-red-900/20 transition-all"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: VOICE MODULATION CONFIGURATION */}
              {activeTab === "voice" && (
                <div className="space-y-4">
                  {/* Select active profile */}
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-white/50 tracking-wider uppercase border-b border-white/5 pb-1 block">Active Modulation Profile</label>
                    <div className="grid grid-cols-2 gap-2">
                      {voiceProfiles.map((vp) => (
                        <div 
                          key={vp.profile_id}
                          onClick={() => setActiveVoiceProfileId(vp.profile_id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            activeVoiceProfileId === vp.profile_id
                              ? "bg-pink-500/10 border-pink-500/40 shadow-[0_0_15px_rgba(236,72,153,0.1)]"
                              : "bg-white/5 border-white/5 hover:border-white/10"
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-xs">{vp.name}</span>
                            {activeVoiceProfileId === vp.profile_id && <Check size={12} className="text-pink-400" />}
                          </div>
                          <div className="text-[9px] font-mono text-white/40 space-y-0.5">
                            <div>Pitch: {vp.pitch_shift > 0 ? `+${vp.pitch_shift}` : vp.pitch_shift} semitone</div>
                            <div>Speed: {vp.speed_rate}x</div>
                            <div>Reverb: {vp.reverb_wetness > 0 ? `${vp.reverb_wetness * 100}%` : "None"}</div>
                            <div>ASMR Whisper: {vp.whisper_mode === 1 ? "ON" : "OFF"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Create Custom Modulation Profile */}
                  <div className="border border-white/10 rounded-xl bg-white/5 overflow-hidden">
                    <button
                      onClick={() => setShowVoiceCreator(!showVoiceCreator)}
                      className="w-full p-3 flex justify-between items-center text-xs font-mono tracking-wider font-bold cursor-pointer hover:bg-white/5"
                    >
                      <span>🛠️ CUSTOM PROFILE TUNER</span>
                      <span>{showVoiceCreator ? "-" : "+"}</span>
                    </button>
                    
                    {showVoiceCreator && (
                      <form onSubmit={handleCreateVoiceProfile} className="p-3 border-t border-white/10 space-y-4 text-xs">
                        <div className="space-y-1">
                          <label className="text-[10px] text-white/60 font-mono">Profile Name</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Bangalorean Sassy Roxy"
                            value={newVoiceName}
                            onChange={e => setNewVoiceName(e.target.value)}
                            className="w-full bg-[#050508] border border-white/15 rounded px-2.5 py-1.5 text-xs focus:border-violet-500 outline-none"
                            required
                          />
                        </div>

                        {/* Pitch shift */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-white/60 font-mono">
                            <span>Pitch Tuning (semitones)</span>
                            <span className="text-pink-400 font-bold">{customPitch > 0 ? `+${customPitch}` : customPitch} st</span>
                          </div>
                          <input 
                            type="range" 
                            min="-12" 
                            max="12" 
                            step="0.5" 
                            value={customPitch}
                            onChange={e => setCustomPitch(parseFloat(e.target.value))}
                            className="w-full accent-pink-500 bg-white/10 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Speed rate */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-white/60 font-mono">
                            <span>Playback Speed</span>
                            <span className="text-pink-400 font-bold">{customSpeed}x</span>
                          </div>
                          <input 
                            type="range" 
                            min="0.5" 
                            max="2.0" 
                            step="0.05" 
                            value={customSpeed}
                            onChange={e => setCustomSpeed(parseFloat(e.target.value))}
                            className="w-full accent-pink-500 bg-white/10 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Gain */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-white/60 font-mono">
                            <span>Volume Gain</span>
                            <span className="text-pink-400 font-bold">{customGain > 0 ? `+${customGain}` : customGain} dB</span>
                          </div>
                          <input 
                            type="range" 
                            min="-10" 
                            max="10" 
                            step="0.5" 
                            value={customGain}
                            onChange={e => setCustomGain(parseFloat(e.target.value))}
                            className="w-full accent-pink-500 bg-white/10 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Reverb */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-white/60 font-mono">
                            <span>Room Reverb / Space Echo</span>
                            <span className="text-pink-400 font-bold">{Math.round(customReverb * 100)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0.0" 
                            max="1.0" 
                            step="0.05" 
                            value={customReverb}
                            onChange={e => setCustomReverb(parseFloat(e.target.value))}
                            className="w-full accent-pink-500 bg-white/10 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Whisper mode */}
                        <div className="flex items-center justify-between border-t border-white/5 pt-2">
                          <label className="text-[10px] text-white/60 font-mono">Highpass ASMR Whisperer Mode</label>
                          <input 
                            type="checkbox" 
                            checked={customWhisper}
                            onChange={e => setCustomWhisper(e.target.checked)}
                            className="w-4 h-4 accent-pink-500 cursor-pointer"
                          />
                        </div>

                        <button 
                          type="submit"
                          className="w-full py-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white rounded text-xs font-mono font-bold cursor-pointer transition-all shadow-md"
                        >
                          Save Custom Profile
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: AI CORE RELATIONAL PROFILING & SEMANTIC MEMORIES */}
              {activeTab === "memory" && (
                <div className="space-y-4">
                  {/* Relational profile bonding score */}
                  {userProfile && (
                    <div className="p-4 bg-gradient-to-br from-violet-950/20 to-pink-950/10 border border-violet-500/25 rounded-2xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Heart className="text-red-400 fill-red-400/80" size={16} />
                          <span className="font-serif font-semibold text-xs tracking-wider text-white">Relationship Vibe</span>
                        </div>
                        <span className="text-[10px] font-mono bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded-full text-red-300">
                          SCORE: {userProfile.relationship_score.toFixed(1)}/10
                        </span>
                      </div>
                      <div className="w-full h-2 bg-white/5 border border-white/10 rounded-full overflow-hidden mb-2">
                        <div 
                          className="h-full bg-gradient-to-r from-red-500 to-pink-500 transition-all duration-1000"
                          style={{ width: `${userProfile.relationship_score * 10}%` }}
                        />
                      </div>
                      <div className="text-[10px] font-mono text-white/60 text-right uppercase tracking-wider mb-2">
                        Vibe state: <span className="text-white font-bold">{getRelationshipStatus(userProfile.relationship_score)}</span>
                      </div>

                      {/* Dynamic preferences tags */}
                      {userProfile.dynamic_preferences && Object.keys(userProfile.dynamic_preferences).length > 0 && (
                        <div className="mt-3 border-t border-white/10 pt-3">
                          <span className="text-[10px] font-mono text-white/40 block mb-2 uppercase tracking-widest">Learned preferences:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(userProfile.dynamic_preferences).map(([key, val]: [string, any]) => (
                              <div 
                                key={key}
                                className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono text-violet-300"
                              >
                                <span className="opacity-60">{key.replace("_", " ")}:</span> <span className="text-white font-semibold">{String(val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual memory creation */}
                  <form onSubmit={handleAddMemory} className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Inject custom fact for Roxy to remember..."
                      value={newMemoryText}
                      onChange={e => setNewMemoryText(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:border-violet-500 outline-none"
                    />
                    <button 
                      type="submit"
                      className="px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-xs font-mono cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <Plus size={12} /> Inject Fact
                    </button>
                  </form>

                  {/* Semantic memories list & Cosine Similarity search */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span className="text-xs font-mono text-white/50 tracking-wider uppercase">Factual Long-term Memory Core (RAG)</span>
                      <span className="text-[9px] font-mono bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded border border-violet-500/30">
                        {memories.length} FACTS
                      </span>
                    </div>

                    {/* Semantic Cosine Similarity search console */}
                    <div className="flex gap-1.5 items-center bg-white/5 border border-white/10 rounded-lg p-1">
                      <Search size={14} className="text-white/40 ml-2" />
                      <input 
                        type="text"
                        placeholder="Semantically search memories..."
                        value={memorySearchQuery}
                        onChange={e => setMemorySearchQuery(e.target.value)}
                        onKeyUp={handleSearchMemory}
                        className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder:text-white/30"
                      />
                      {memorySearchQuery && (
                        <button 
                          onClick={() => { setMemorySearchQuery(""); setSearchedMemories(null); }}
                          className="p-1 text-white/40 hover:text-white cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* Memories list */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {(searchedMemories || memories).length === 0 ? (
                        <div className="text-center py-6 text-xs text-white/30 italic">
                          No {searchedMemories ? "matching" : ""} factual memories index found.
                        </div>
                      ) : (
                        (searchedMemories || memories).map((m) => (
                          <div 
                            key={m.memory_id}
                            className="bg-white/5 border border-white/5 p-3 rounded-xl flex justify-between items-start gap-2 relative group hover:border-violet-500/20 transition-all"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs leading-relaxed text-violet-100">
                                "{m.content}"
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 text-[8px] font-mono text-white/30">
                                <span className="uppercase text-violet-400 font-bold">Vector RAG</span>
                                {m.similarity && (
                                  <span className="text-emerald-400 font-bold">
                                    Similarity: {Math.round(m.similarity * 100)}%
                                  </span>
                                )}
                                <span>•</span>
                                <span>{m.created_at ? new Date(m.created_at).toLocaleDateString() : "Auto"}</span>
                              </div>
                            </div>

                            {/* Delete memory entry */}
                            <button
                              onClick={async () => {
                                if (confirm("Delete this specific fact index from RAG memory core?")) {
                                  const success = await deleteMemory(m.memory_id);
                                  if (success) {
                                    setMemories(prev => prev.filter(item => item.memory_id !== m.memory_id));
                                    if (searchedMemories) {
                                      setSearchedMemories(prev => prev ? prev.filter(item => item.memory_id !== m.memory_id) : null);
                                    }
                                  }
                                }
                              }}
                              className="p-1 rounded bg-red-950/20 text-red-400 border border-red-900/30 opacity-0 group-hover:opacity-100 hover:bg-red-900/20 transition-all"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: TECHNICAL LATENCY SPEECH LOGS */}
              {activeTab === "logs" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-white/50 tracking-wider uppercase border-b border-white/5 pb-1 block">Speech-to-Speech Processing Audit</label>
                    {speechLogs.length === 0 ? (
                      <div className="text-center py-8 text-xs text-white/30 italic">
                        No processing modulation records captured yet.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[450px] overflow-y-auto">
                        {speechLogs.map((log) => (
                          <div 
                            key={log.log_id}
                            className="bg-[#050508]/60 border border-white/5 p-3 rounded-xl space-y-2 text-[10px] font-mono"
                          >
                            <div className="flex justify-between items-center text-white/80">
                              <span className="text-violet-400 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1">
                                <Clock size={10} /> {log.profile_name || "Raw Synthesis"}
                              </span>
                              <span className="text-white/40">{new Date(log.created_at).toLocaleTimeString()}</span>
                            </div>
                            
                            <p className="text-xs italic text-white/70 line-clamp-2 border-l border-white/10 pl-2">
                              "{log.text_content}"
                            </p>

                            <div className="grid grid-cols-2 gap-2 text-[9px] text-white/50 pt-1 border-t border-white/5">
                              <div>TTS Latency: <span className="text-white font-bold">{log.generation_latency_ms} ms</span></div>
                              <div>Mod Duration: <span className="text-white font-bold">{log.modulation_duration_ms} ms</span></div>
                              <div>Pitch Shift: <span className="text-pink-400 font-semibold">{log.pitch_shift > 0 ? `+${log.pitch_shift}` : log.pitch_shift} st</span></div>
                              <div>Speed Rate: <span className="text-pink-400 font-semibold">{log.speed_rate}x</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: CONNECTION SETTINGS */}
              {activeTab === "settings" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-white/50 tracking-wider uppercase border-b border-white/5 pb-1 block">Connection Endpoint Settings</label>
                    <form onSubmit={handleSaveSettings} className="space-y-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-mono text-white/70">API SERVER URL</label>
                        <input
                          type="url"
                          value={customApiUrl}
                          onChange={(e) => setCustomApiUrl(e.target.value)}
                          placeholder="e.g. http://192.168.1.100:3000"
                          className="w-full bg-[#050508]/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 transition-colors font-mono"
                        />
                        <p className="text-[9px] text-white/40 font-mono">
                          Leave blank to fallback to window origin.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-mono text-white/70">WEBSOCKET SERVER URL</label>
                        <input
                          type="text"
                          value={customWsUrl}
                          onChange={(e) => setCustomWsUrl(e.target.value)}
                          placeholder="e.g. ws://192.168.1.100:3000"
                          className="w-full bg-[#050508]/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 transition-colors font-mono"
                        />
                        <p className="text-[9px] text-white/40 font-mono">
                          Leave blank to fallback to window host.
                        </p>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] cursor-pointer"
                      >
                        Save & Restart Connection
                      </button>
                    </form>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-white/5">
                    <label className="text-xs font-mono text-white/50 tracking-wider uppercase border-b border-white/5 pb-1 block">User Profile Settings</label>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-mono text-white/70">YOUR NAME</label>
                        <input
                          type="text"
                          value={userProfile?.dynamic_preferences?.name || ""}
                          onChange={async (e) => {
                            const newName = e.target.value;
                            const updated = {
                              ...userProfile,
                              dynamic_preferences: {
                                ...userProfile?.dynamic_preferences,
                                name: newName
                              }
                            };
                            setUserProfile(updated);
                            localStorage.setItem("ROXY_LOCAL_PROFILE", JSON.stringify(updated));
                            try {
                              await fetch(getApiUrl() + "/api/user-profiles", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  username: "lo",
                                  preferences: {
                                    name: newName
                                  }
                                })
                              });
                            } catch (err) {}
                          }}
                          className="w-full bg-[#050508]/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500/50 transition-colors font-sans"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[11px] font-mono text-white/70">YOUR GENDER</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const updated = {
                                ...userProfile,
                                dynamic_preferences: {
                                  ...userProfile?.dynamic_preferences,
                                  gender: "Male"
                                }
                              };
                              setUserProfile(updated);
                              localStorage.setItem("ROXY_LOCAL_PROFILE", JSON.stringify(updated));
                              try {
                                await fetch(getApiUrl() + "/api/user-profiles", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    username: "lo",
                                    preferences: {
                                      gender: "Male"
                                    }
                                  })
                                });
                              } catch (err) {}
                            }}
                            className={`py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                              userProfile?.dynamic_preferences?.gender === "Male"
                                ? "bg-blue-500/10 border-blue-500/50 text-blue-300 font-semibold"
                                : "bg-[#050508]/60 border-white/10 text-white/60 hover:bg-white/5"
                            }`}
                          >
                            Boy / Male
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const updated = {
                                ...userProfile,
                                dynamic_preferences: {
                                  ...userProfile?.dynamic_preferences,
                                  gender: "Female"
                                }
                              };
                              setUserProfile(updated);
                              localStorage.setItem("ROXY_LOCAL_PROFILE", JSON.stringify(updated));
                              try {
                                await fetch(getApiUrl() + "/api/user-profiles", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    username: "lo",
                                    preferences: {
                                      gender: "Female"
                                    }
                                  })
                                });
                              } catch (err) {}
                            }}
                            className={`py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                              userProfile?.dynamic_preferences?.gender === "Female"
                                ? "bg-pink-500/10 border-pink-500/50 text-pink-300 font-semibold"
                                : "bg-[#050508]/60 border-white/10 text-white/60 hover:bg-white/5"
                            }`}
                          >
                            Girl / Female
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="border-t border-white/10 pt-4 mt-4 text-[10px] text-white/30 text-center font-mono shrink-0 flex items-center justify-center gap-1">
              <Database size={10} className="text-cyan-400" />
              <span>Omnitech Database Node Synchronized</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content - Visualizer / Home page */}
      <main className="absolute inset-0 w-full h-full z-10 overflow-hidden pt-24 pb-28 px-4 md:px-12 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {!isSessionActive ? (
            /* ==========================================
               DARK THEME AGENT HOMEPAGE
               ========================================== */
            <motion.div
              key="homepage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-5xl h-full flex flex-col md:flex-row items-stretch gap-6 z-10 overflow-hidden pr-1 pointer-events-auto"
            >
              {/* Left Column: Previous Conversations Panel */}
              <div className="w-full md:w-80 bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col justify-between overflow-hidden shrink-0 select-none">
                <div className="flex flex-col gap-4 overflow-hidden h-full">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-mono font-bold text-violet-400 uppercase tracking-widest">Rooms</span>
                    <button 
                      onClick={async () => {
                        const name = prompt("Enter new session name/summary:");
                        if (name && name.trim()) {
                          const newSess = await createSession("Roxy", name.trim());
                          if (newSess) {
                            setSessions(prev => [newSess, ...prev]);
                            setSessionId(newSess.session_id);
                          }
                        }
                      }}
                      className="p-1 rounded bg-violet-600/20 text-violet-400 border border-violet-500/20 hover:bg-violet-600/30 text-[10px] px-2 font-mono flex items-center gap-1 cursor-pointer animate-pulse"
                    >
                      <Plus size={10} /> New Room
                    </button>
                  </div>
                  
                  {/* Session List */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
                    {sessions.map((sess) => (
                      <div 
                        key={sess.session_id}
                        onClick={() => setSessionId(sess.session_id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer relative group flex justify-between items-center ${
                          sessionId === sess.session_id 
                            ? "bg-violet-600/10 border-violet-500/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                            : "bg-white/0 border-white/5 hover:bg-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-2 text-left">
                          <span className="font-semibold text-xs text-white truncate block">
                            {sess.summary || "Unnamed Chat Session"}
                          </span>
                          <span className="text-[9px] text-white/30 block font-mono mt-0.5">
                            ID: {sess.session_id.substring(0, 10)}...
                          </span>
                        </div>
                        {sessionId === sess.session_id ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)] shrink-0" />
                        ) : (
                          sess.session_id !== "sess_default" && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm("Delete this session entirely?")) {
                                  const success = await deleteSession(sess.session_id);
                                  if (success) {
                                    setSessions(prev => prev.filter(s => s.session_id !== sess.session_id));
                                    if (sessionId === sess.session_id) {
                                      setSessionId("sess_default");
                                    }
                                  }
                                }
                              }}
                              className="p-1 rounded bg-red-950/20 text-red-400 border border-red-900/30 opacity-0 group-hover:opacity-100 hover:bg-red-900/20 transition-all cursor-pointer shrink-0"
                            >
                              <X size={10} />
                            </button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Visualizer & Actions */}
              <div className="flex-1 flex flex-col justify-between items-center overflow-y-auto scrollbar-hide py-2">
                {/* Hero Greeting Section */}
                <div className="text-center mt-4 md:mt-8 space-y-2 select-none">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full text-[10px] font-mono text-violet-300 uppercase tracking-widest"
                  >
                    <Sparkles size={10} className="text-violet-400" />
                    <span>Personal Cognitive Agent</span>
                  </motion.div>
                  
                  <h2 className="text-3xl md:text-5xl font-serif font-semibold tracking-wide text-white bg-clip-text">
                    Hello, I am <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">Roxy</span>
                  </h2>
                  
                  <p className="text-xs md:text-sm text-white/50 max-w-md mx-auto leading-relaxed">
                    Your customized AI companion, technical supervisor, and semantic memory agent. How shall we collaborate today?
                  </p>
                </div>

                {/* Center Rest Orb Trigger */}
                <div className="relative my-8 flex items-center justify-center">
                  {/* Rotating accent rings */}
                  <div className="absolute w-56 h-56 rounded-full border border-white/5 border-dashed animate-[spin_40s_linear_infinite]" />
                  <div className="absolute w-44 h-44 rounded-full border border-violet-500/5 animate-[spin_20s_linear_infinite_reverse]" />
                  
                  {/* Live Orb in Resting (Idle) State */}
                  <div 
                    onClick={toggleListening}
                    className="relative w-48 h-48 flex items-center justify-center cursor-pointer group pointer-events-auto"
                  >
                    {/* Hover ripple rings */}
                    <div className="absolute inset-0 rounded-full bg-violet-600/5 border border-violet-500/10 scale-95 group-hover:scale-110 opacity-0 group-hover:opacity-100 transition-all duration-500" />
                    <div className="absolute inset-2 rounded-full bg-pink-600/5 border border-pink-500/10 scale-90 group-hover:scale-105 opacity-0 group-hover:opacity-100 transition-all duration-700" />
                    
                    <Visualizer state="idle" />

                    {/* Floating click prompt */}
                    <div className="absolute -bottom-1.5 bg-[#020206]/90 border border-white/10 px-3 py-1 rounded-full text-[9px] font-mono text-white/60 tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] z-30">
                      Click to Talk
                    </div>
                  </div>
                </div>

                {/* Premium Action Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl mt-2 select-none">
                  {/* Card 1: Start Voice */}
                  <div 
                    onClick={toggleListening}
                    className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-violet-500/20 p-4 rounded-2xl flex flex-col gap-2.5 cursor-pointer transition-all duration-300 group shadow-lg"
                  >
                    <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
                      <Mic size={16} />
                    </div>
                    <div className="text-left">
                      <span className="font-semibold text-xs text-white block group-hover:text-violet-300 transition-colors">Start Voice Chat</span>
                      <span className="text-[10px] text-white/40 block mt-0.5 leading-normal">Engage in real-time verbal conversations.</span>
                    </div>
                  </div>

                  {/* Card 2: Code Console */}
                  <div 
                    onClick={() => {
                      if (activeCodeDetails === null) {
                        setActiveCodeDetails(`// Welcome to Roxy Code Console\n// Generated code or technical data blocks will render here.\n\nconsole.log("System Status: Synchronized");`);
                        setActiveCodeLanguage("javascript");
                      } else {
                        setActiveCodeDetails(null);
                      }
                    }}
                    className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-pink-500/20 p-4 rounded-2xl flex flex-col gap-2.5 cursor-pointer transition-all duration-300 group shadow-lg"
                  >
                    <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 group-hover:scale-105 transition-transform">
                      <Keyboard size={16} />
                    </div>
                    <div className="text-left">
                      <span className="font-semibold text-xs text-white block group-hover:text-pink-300 transition-colors">Developer Console</span>
                      <span className="text-[10px] text-white/40 block mt-0.5 leading-normal">Inspect compiled scripts, code, and logs.</span>
                    </div>
                  </div>

                  {/* Card 3: Memories */}
                  <div 
                    onClick={() => {
                      setShowHistory(true);
                      setActiveTab("memory");
                    }}
                    className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/20 p-4 rounded-2xl flex flex-col gap-2.5 cursor-pointer transition-all duration-300 group shadow-lg"
                  >
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                      <Database size={16} />
                    </div>
                    <div className="text-left">
                      <span className="font-semibold text-xs text-white block group-hover:text-cyan-300 transition-colors">Memory Core</span>
                      <span className="text-[10px] text-white/40 block mt-0.5 leading-normal">View RAG database facts learned about you.</span>
                    </div>
                  </div>

                  {/* Card 4: Voice Tuner */}
                  <div 
                    onClick={() => {
                      setShowHistory(true);
                      setActiveTab("voice");
                    }}
                    className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-yellow-500/20 p-4 rounded-2xl flex flex-col gap-2.5 cursor-pointer transition-all duration-300 group shadow-lg"
                  >
                    <div className="w-8 h-8 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 group-hover:scale-105 transition-transform">
                      <Sliders size={16} />
                    </div>
                    <div className="text-left">
                      <span className="font-semibold text-xs text-white block group-hover:text-yellow-300 transition-colors">Speech Modulator</span>
                      <span className="text-[10px] text-white/40 block mt-0.5 leading-normal">Configure speed, pitch, reverb, and whisper.</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ==========================================
               ACTIVE VOICE SESSION MODE
               ========================================== */
            <motion.div
              key="activesession"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 30, stiffness: 200 }}
              className="w-full h-full flex items-center justify-between relative pointer-events-none"
            >
              {/* Left Column: Roxy Status */}
              <div className={`flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10 ${activeCodeDetails !== null ? "hidden" : ""}`}>
                <div className="h-6">
                  <AnimatePresence>
                    {appState === "processing" && (
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-2 text-cyan-300/80 text-sm md:text-base italic font-serif"
                      >
                        <Loader2 size={16} className="animate-spin" />
                        Replying...
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Center Visualizer (Morphing active Live Orb) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <Visualizer state={appState} />
              </div>

              {/* Right Column: User Status */}
              <div className={`flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10 ${activeCodeDetails !== null ? "hidden" : ""}`}>
                <div className="h-6 flex justify-end">
                  <AnimatePresence>
                    {appState === "listening" && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-center gap-2 text-violet-300/80 text-sm md:text-base italic"
                      >
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                        Listening...
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Controls & Text input */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4 pointer-events-auto">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-[95%] max-w-md flex items-center gap-2 bg-[#020206]/85 border border-white/10 rounded-full p-2 pl-4 backdrop-blur-md shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message or command to Roxy..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/20 text-xs md:text-sm font-sans"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors cursor-pointer"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-8 py-3.5 rounded-full font-medium tracking-wider text-sm transition-all duration-300 shadow-[0_10px_30px_rgba(0,0,0,0.5)] cursor-pointer select-none
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                  : "bg-white/10 hover:bg-white/20 text-white border border-white/15 hover:scale-105"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={18} />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={18} className="group-hover:animate-bounce" />
                <span>Start Session</span>
              </>
            )}
          </button>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className={`p-3.5 rounded-full border transition-all shadow-2xl cursor-pointer ${
                showTextInput 
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.3)]" 
                  : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
              }`}
              title="Type a text query"
            >
              <Keyboard size={18} className="opacity-70" />
            </button>
          )}
        </div>
      </footer>

      {/* Blocked Popup/Redirect Toast Alert */}
      <AnimatePresence>
        {activeRedirectUrl && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-24 right-6 z-50 max-w-sm w-[90%] bg-black/45 backdrop-blur-xl border border-violet-500/30 rounded-2xl p-4 shadow-[0_20px_50px_rgba(139,92,246,0.3)] flex flex-col gap-3 font-sans pointer-events-auto"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-violet-600/20 border border-violet-500/20 text-violet-400">
                  <Sparkles size={16} className="animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">Web Action Requested</span>
                  <span className="text-[10px] text-white/50 truncate max-w-[200px]">{activeRedirectUrl}</span>
                </div>
              </div>
              <button
                onClick={() => setActiveRedirectUrl(null)}
                className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                type="button"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-white/80 leading-normal">
              Your browser blocked the popup. Click the button below to open the link directly.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => {
                  window.open(activeRedirectUrl, "_blank");
                  setActiveRedirectUrl(null);
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 text-white text-xs font-bold transition-all shadow-[0_5px_15px_rgba(139,92,246,0.4)] flex items-center justify-center gap-1.5 cursor-pointer"
                type="button"
              >
                <span>Open Link</span>
                <span className="text-sm">↗</span>
              </button>
              <button
                onClick={() => setActiveRedirectUrl(null)}
                className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium transition-all border border-white/10 cursor-pointer"
                type="button"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </div>
  );
}
