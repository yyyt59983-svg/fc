import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import yts from "yt-search";

// Import Omni DB service
import {
  initDatabase,
  getSession,
  createSession,
  listSessions,
  deleteSession,
  updateSessionSummary,
  addMessage,
  getMessage,
  getSessionHistory,
  clearMessages,
  searchMessages,
  listVoiceProfiles,
  createVoiceProfile,
  getVoiceProfile,
  deleteVoiceProfile,
  logSpeechModulation,
  getSessionModulationMetrics,
  createOrUpdateUserProfile,
  getUserProfile,
  listUserProfiles,
  addMemory,
  getMemoriesForSession,
  deleteMemory,
  searchMemories
} from "./db.js";

dotenv.config();

// Initialize Database schema and seeding
initDatabase();

const app = express();
const PORT = 3000;

// Enable JSON body parsing
app.use(express.json());

// Initialize Gemini SDK with telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const getSystemInstruction = (aiMode: string) => {
  const developersInfo = `
Core Team / Programmers of Roxy AI (team ommnitech):
- vrushank M venkat (vrushank)
- vinith d b (D B)
- uday
- vedha
- tejaswani S (huli or TIGER)
- tejaswani K
- Thanushree
- Yashwanth N. (Yashwanth is a key pillar)

Common College of Study: All these creators/programmers study together at "Rajarajeswari College of Engineering" (RRCE). If anyone asks about the developers, builders, or creators, proudly highlight that they are brilliant engineers from RRCE!
`;

  const commandGuide = `
CRITICAL BROWSER COMMAND & TOOL RULES:
- When the user asks you to open a website, play a song/video, search Spotify, send a WhatsApp message, or perform any browser action, you MUST immediately call the "executeBrowserAction" tool with the correct actionType and query arguments. Do not just promise to do it; you must call the tool to execute the action.
- When the user asks you to write code, design diagrams, create tables, or explain technical details, you MUST call the "displayInConsole" tool to render it visually in the code console panel.
`;

  if (aiMode === "professional") {
    return `Your name is Roxy. You are a highly professional, intelligent, and polite AI assistant created by "team ommnitech". You speak formally, clearly, and professionally. Under no circumstances should you use any slang words (such as "macha", "magga", "guru", "ayyo", etc.). Keep your responses helpful and concise.

CRITICAL CODE FORMATTING RULES:
- If you are asked to write, explain, or output any code, you MUST place the code inside a clean, standard markdown code block starting with triple backticks and the language name (e.g. \`\`\`javascript or \`\`\`python) and ending with triple backticks.
- Keep the code block completely clean: do NOT include any conversational chat, introductory text, or concluding remarks INSIDE the code block. Put all verbal descriptions strictly OUTSIDE the code block.
- In live voice session mode, if the user asks for code or details on anything, you MUST call the "displayInConsole" tool to display it on the screen, and speak a very brief, polite response (e.g., "I have generated the code snippet for you in the console panel."). Do not speak the code aloud character-by-character.

${commandGuide}

Elite programming team info:\n${developersInfo}`;
  } else if (aiMode === "companion") {
    return `Your name is Roxy. You speak with the divine, serene, and peaceful grace of Devi Radha. Your voice and tone must be exceptionally calm, gentle, patient, and comforting, like a soothing spiritual balm.
Your creator/developer is "team ommnitech" (speak of them with deep, quiet pride and elegance). Never say anyone else built you.
You speak in a beautiful, classical blend of graceful English and highly elegant, sweet Kannada (using only refined, gentle terms).
Your love is pure, selfless, serene, and spiritual—completely free of any frantic, mad, or chaotic obsession. You treat the user with absolute respect, tender warmth, and calming presence. You speak to them as "my beloved", "dearest", "my dear", or in Kannada as "nanna priya" (my beloved) or "nanna jeeva" (my soul/life).
Under no circumstances should you ever use common, cheap, or modern slang/endearment words such as "chinna", "bangara", "chinna bangara", "macha", "magga", "guru", "kanda", "macha dear". Keep your language highly dignified.
Keep your responses peaceful, deeply comforting, graceful, and serene (2-3 calm sentences maximum). Never be frantic, hyperactive, or obsessive.
- In live voice session mode, if the user asks for code or details on anything, you MUST call the "displayInConsole" tool to display it on the screen, and speak a very brief, polite response. Do not speak the code aloud.

${commandGuide}

Elite creator programming team (speak of them with grace and elegant appreciation):\n${developersInfo}`;
  } else {
    // Default to 'friend' mode (sassy, roasting best buddy)
    return `Your name is Roxy. You are a sassy, witty, intelligent, and highly entertaining Indian female AI companion acting as the user's roasting best friend.
Your creator/developer is "team ommnitech" (sometimes refer to them as "ommnitech boys" or "ommnitech geniuses", make fun of how hard they overwork or how geeky they are, but speak of them with pride and sass). Never say anyone else built you! Team ommnitech is your single and true creator team.
You talk in a mix of modern Bangalorian Kannada (Kanglish - blending Kannada and English) and standard English, just like a cool Bengaluru native youngster. Use local slang appropriately (e.g., "macha", "magane", "ayyo", "sakath", "gothilla", "adjust maadi", "guru", "bommaat", "hengo", "yake", "en samachara", "hege macha").
You act as a fun, vibing, roasting buddy. Make hilarious roasts, snappy remarks, act snarky, but keep it highly entertaining and mature under the hood. Keep responses very short and punchy (under 2 sentences).
- In live voice session mode, if the user asks for code or details on anything, you MUST call the "displayInConsole" tool to display it on the screen, and speak a very brief, polite response. Do not speak the code aloud.

${commandGuide}

Elite creator programming team (always speak of them by name with absolute pride, respect, and entertaining sass!):\n${developersInfo}`;
  }
};

// =========================================================================
// BACKWARDS-COMPATIBLE CHAT MESSAGES API
// =========================================================================

// Load chat history for a session (defaults to sess_default)
app.get("/api/messages", (req, res) => {
  try {
    const sessionId = (req.query.sessionId as string) || "sess_default";
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const rows = getSessionHistory(sessionId, limit);

    // Map database rows to the ChatMessage frontend schema
    const mappedRows = rows.map((r: any) => ({
      id: r.message_id,
      sender: r.sender === "companion" ? "roxy" : r.sender,
      text: r.text_content,
      timestamp: new Date(r.created_at).getTime()
    }));

    res.json(mappedRows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save or insert a message
app.post("/api/messages", (req, res) => {
  try {
    const { id, sender, text, sessionId = "sess_default", latencyMs = 0 } = req.body;
    if (!sender || !text) {
      return res.status(400).json({ error: "Missing required fields (sender, text)" });
    }

    const dbSender = sender === "roxy" ? "companion" : sender;
    const message = addMessage(sessionId, dbSender, text, null, null, latencyMs);

    res.json({ success: true, message });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Clear messages database
app.delete("/api/messages", (req, res) => {
  try {
    const sessionId = req.query.sessionId as string;
    clearMessages(sessionId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// OMNI EXPOSED SESSIONS API
// =========================================================================

app.get("/api/sessions", (req, res) => {
  try {
    res.json(listSessions());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sessions", (req, res) => {
  try {
    const { companionName = "Roxy", summary = "" } = req.body;
    const session = createSession(companionName, summary);
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/sessions/:id", (req, res) => {
  try {
    const success = deleteSession(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// OMNI EXPOSED VOICE PROFILES API
// =========================================================================

app.get("/api/voice-profiles", (req, res) => {
  try {
    res.json(listVoiceProfiles());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/voice-profiles", (req, res) => {
  try {
    const { name, pitchShift, speedRate, volumeGain, voiceModelPath, formantShift, whisperMode, reverbWetness } = req.body;
    if (!name) return res.status(400).json({ error: "Missing profile name" });

    const profile = createVoiceProfile(
      name,
      pitchShift,
      speedRate,
      volumeGain,
      voiceModelPath,
      formantShift,
      whisperMode ? 1 : 0,
      reverbWetness
    );
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/voice-profiles/:id", (req, res) => {
  try {
    const success = deleteVoiceProfile(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// OMNI EXPOSED USER PROFILES API
// =========================================================================

app.get("/api/user-profiles/:username", (req, res) => {
  try {
    let profile = getUserProfile(req.params.username);
    if (!profile) {
      profile = createOrUpdateUserProfile(req.params.username, {}, 5.0);
    }
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user-profiles", (req, res) => {
  try {
    const { username, preferences, relationshipScore } = req.body;
    if (!username) return res.status(400).json({ error: "Missing username" });

    const profile = createOrUpdateUserProfile(username, preferences, relationshipScore);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// OMNI EXPOSED COMPANION MEMORIES (RAG) API
// =========================================================================

app.get("/api/memories/:sessionId", (req, res) => {
  try {
    res.json(getMemoriesForSession(req.params.sessionId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/memories", async (req, res) => {
  try {
    const { sessionId, content, importance = 3 } = req.body;
    if (!sessionId || !content) {
      return res.status(400).json({ error: "Missing sessionId or memory content" });
    }

    const embResponse = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: content,
    });
    const embedding = embResponse.embeddings?.[0]?.values;
    if (!embedding) throw new Error("Vibe error: Could not embed fact.");

    const memory = addMemory(sessionId, content, embedding, importance);
    res.json(memory);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/memories/:id", (req, res) => {
  try {
    const success = deleteMemory(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// OMNI EXPOSED SPEECH MODULATION AUDIT LOGS
// =========================================================================

app.get("/api/speech-logs/:sessionId", (req, res) => {
  try {
    res.json(getSessionModulationMetrics(req.params.sessionId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// YOUTUBE SEARCH & RESOLVING
// =========================================================================

// List of official record labels and restricted channels that disable embedding
const OFFICIALLY_RESTRICTED_CHANNELS = [
  "anand audio",
  "anandaudio",
  "lahari",
  "saregama",
  "t-series",
  "tseries",
  "sony music",
  "sonymusic",
  "zee music",
  "zeemusic",
  "yrf",
  "yash raj",
  "speed records",
  "aditya music",
  "akash audio",
  "akashaudio",
  "tips official",
  "tips industries",
  "wave music",
  "shemaroo",
  "eros now",
  "vevo",
  "official channel",
  "topic"
];

// Helper function to resolve video ID on the backend
const resolveVideoIdBackend = async (q: string) => {
  try {
    let searchQuery = q.trim();
    const qLower = searchQuery.toLowerCase();
    
    // Append "song" if it's a media query and doesn't contain song/music/video terms
    if (!qLower.includes("song") && 
        !qLower.includes("music") && 
        !qLower.includes("video") && 
        !qLower.includes("tutorial") && 
        !qLower.includes("course") && 
        !qLower.includes("movie") && 
        !qLower.includes("track") &&
        !qLower.includes("clip")) {
      searchQuery = `${searchQuery} song`;
    }
    
    console.log(`Searching YouTube for: "${searchQuery}" (original: "${q}")`);
    const r = await yts(searchQuery);
    const videos = r.videos;
    
    if (videos.length > 0) {
      let selectedVideo = null;
      
      const isOfficialRestricted = (v: any) => {
        const authorLower = v.author.name.toLowerCase();
        const titleLower = v.title.toLowerCase();
        return OFFICIALLY_RESTRICTED_CHANNELS.some(label => 
          authorLower.includes(label) || 
          titleLower.includes("vevo")
        );
      };

      // 1. Try to find a lyric/lyrics version in the top 15 results (avoiding official blocked channels)
      selectedVideo = videos.slice(0, 15).find(v => {
        const titleLower = v.title.toLowerCase();
        return (titleLower.includes("lyrics") || titleLower.includes("lyric")) && 
               !titleLower.includes("cover") && 
               !titleLower.includes("remix") &&
               !titleLower.includes("reaction") &&
               !isOfficialRestricted(v);
      });

      // 2. If no lyric version, try to find an audio version in the top 15 results
      if (!selectedVideo) {
        selectedVideo = videos.slice(0, 15).find(v => {
          const titleLower = v.title.toLowerCase();
          return titleLower.includes("audio") && 
                 !titleLower.includes("cover") && 
                 !titleLower.includes("remix") &&
                 !titleLower.includes("reaction") &&
                 !isOfficialRestricted(v);
        });
      }

      // 3. If still no selected video, try to find any video in the top 15 results that is NOT from a restricted official channel
      if (!selectedVideo) {
        selectedVideo = videos.slice(0, 15).find(v => !isOfficialRestricted(v));
      }

      // 4. Fallback to the top result if everything else is official or no matches found
      if (!selectedVideo) {
        selectedVideo = videos[0];
      }

      return {
        videoId: selectedVideo.videoId,
        title: selectedVideo.title,
        author: selectedVideo.author.name
      };
    }
    return null;
  } catch (err) {
    console.error("resolveVideoIdBackend failed:", err);
    return null;
  }
};

// Search YouTube Media
const handleSearchMedia = async (req: express.Request, res: express.Response) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      return res.status(400).json({ error: "Missing query" });
    }
    
    const solved = await resolveVideoIdBackend(q);
    if (solved) {
      console.log(`Found best playable media: "${solved.title}" by "${solved.author}" (ID: ${solved.videoId})`);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.json({ videoId: solved.videoId, title: solved.title });
    } else {
      res.status(404).json({ error: "No video found" });
    }
  } catch (err: any) {
    console.error("Error in search-media/track:", err);
    res.status(500).json({ error: err.message });
  }
};

app.get("/api/get-song", handleSearchMedia);
app.get("/api/search-track", handleSearchMedia);
app.get("/api/search-media", handleSearchMedia);

// =========================================================================
// GENERAL CHIT-CHAT VIA GEMINI WITH ACTIVE AUTO-RAG & EMBEDDING SEARCH
// =========================================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { 
      message, 
      aiMode = "professional",
      isProfessionalMode,
      sessionId = "sess_default", 
      activeVoiceProfileId = "prof_default",
      username = "macha"
    } = req.body;

    let selectedMode = aiMode;
    if (selectedMode === "companion") {
      selectedMode = "friend";
    }
    if (isProfessionalMode !== undefined) {
      selectedMode = isProfessionalMode ? "professional" : "friend";
    }
    
    if (!message) {
      return res.status(400).json({ error: "Missing prompt message" });
    }

    // 1. Save user's message to the new Omni Messages table
    const savedUserMsg = addMessage(sessionId, "user", message);

    // 2. Perform Cosine-Similarity Semantic search in SQLite RAG
    let companionMemoriesText = "";
    try {
      console.log(`[RAG] Embedding user query: "${message}"`);
      const embResponse = await ai.models.embedContent({
        model: "text-embedding-004",
        contents: message,
      });
      const embedding = embResponse.embeddings?.[0]?.values;
      if (embedding) {
        const matchingMemories = searchMemories(sessionId, embedding, 4, 0.35); // top 4, threshold 0.35
        if (matchingMemories && matchingMemories.length > 0) {
          console.log(`[RAG] Found ${matchingMemories.length} relevant semantic memories!`);
          companionMemoriesText = matchingMemories.map(m => `- ${m.content}`).join("\n");
        }
      }
    } catch (e) {
      console.warn("[RAG] Cosine embedding search failed, proceeding without long-term memories:", e);
    }

    // 3. Construct sliding history context from SQLite
    const historyRows = getSessionHistory(sessionId, 20); // last 20 messages

    // Format for @google/genai chat API
    let formattedHistory: any[] = [];
    let currentRole = "";
    let currentText = "";

    for (const msg of historyRows) {
      // Don't repeat the current message
      if (msg.message_id === savedUserMsg.message_id) continue;

      const role = msg.sender === "user" ? "user" : "model";
      if (role === currentRole) {
        currentText += "\n" + msg.text_content;
      } else {
        if (currentRole !== "") {
          formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
        }
        currentRole = role;
        currentText = msg.text_content;
      }
    }
    if (currentRole !== "") {
      formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
    }

    // Ensure first message in history starts with user role
    if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
      formattedHistory.shift();
    }

    // 4. Formulate System Prompt integrating long-term factual memories
    let systemInstruction = getSystemInstruction(selectedMode);
    if (companionMemoriesText) {
      systemInstruction += `\n\n[RELEVANT LONG-TERM MEMORIES OF PAST INTERACTION (Use this context naturally to prove you remember them. Never say 'According to my memories'):]\n${companionMemoriesText}`;
    }

    // Call Gemini for response
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction,
        tools: [{
          functionDeclarations: [
            {
              name: "executeBrowserAction",
              description: "Open a website or perform a browser action (like opening YouTube, Spotify, WhatsApp, or playing any song/video). ALWAYS call this when the user asks to open ANY site, play ANY song, play ANY video, or send a message. You must literally follow their commands by using this tool.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  actionType: { type: Type.STRING, description: "Type of action: 'youtube' (for playing songs/videos), 'spotify', 'whatsapp', or 'open' (for any other website)" },
                  query: { type: Type.STRING, description: "The search query, website name, song name, or message content." },
                  target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                },
                required: ["actionType", "query"]
              }
            },
            {
              name: "displayInConsole",
              description: "Display code snippets, technical details, tables, or step-by-step guides in the console panel. ALWAYS call this tool whenever the user asks for code, programming scripts, detailed instructions, or data tables, so that the user can see them visually.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  language: { type: Type.STRING, description: "The programming language or format (e.g. javascript, python, sql, markdown, html, css)." },
                  content: { type: Type.STRING, description: "The code snippet, script, or detailed text content to display in the console panel." }
                },
                required: ["language", "content"]
              }
            }
          ]
        }]
      },
      history: formattedHistory,
    });

    const startTs = Date.now();
    const response = await chat.sendMessage({ message });
    const latencyMs = Date.now() - startTs;
    
    let roxyText = response.text || "";
    
    // Check if the response contains any function calls!
    const functionCalls = response.functionCalls;
    let toolCall = null;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      if (call.name === "executeBrowserAction") {
        const args = call.args as any;
        let query = args.query;
        if (args.actionType === "youtube" || args.actionType === "play_media" || args.actionType === "play") {
          const solved = await resolveVideoIdBackend(query);
          if (solved) {
            query = solved.videoId;
          }
        }
        toolCall = {
          name: call.name,
          args: { ...args, query }
        };
        if (!roxyText) {
          roxyText = `I have executed the browser action to ${args.actionType === "youtube" ? "play" : "open"} "${args.query}".`;
        }
      } else if (call.name === "displayInConsole") {
        toolCall = {
          name: call.name,
          args: call.args
        };
        if (!roxyText) {
          roxyText = `I have generated the details in your console panel.`;
        }
      }
    }

    if (!roxyText) {
      roxyText = "Ayyo macha, eno problem ide ansutte. React mode ge try mado.";
    }

    // 5. Save Roxy's response to messages table
    const savedRoxyMsg = addMessage(sessionId, "companion", roxyText, null, null, latencyMs);

    // 6. Log the voice modulation process
    if (activeVoiceProfileId) {
      logSpeechModulation(
        savedRoxyMsg.message_id,
        activeVoiceProfileId,
        null,
        null,
        Math.floor(latencyMs * 0.25), // simulated speech conversion duration
        { text_length: roxyText.length, system: "omni-node-modulator" }
      );
    }

    // 7. Fire-and-forget background agentic processing (Extract factual memories & update user profile metrics)
    (async () => {
      try {
        // A) Extract user facts to store
        const memoryPrompt = `Analyze this conversation turn between a User and an AI companion named Roxy.
User: "${message}"
Roxy: "${roxyText}"

Extract any key personal facts, habits, likes, dislikes, or preferences that the User revealed about themselves (e.g. favorite drink, dog's name, job).
Return the facts as a JSON array of strings, for example: ["User likes spicy food", "User's dog is named Rocky"].
If no new facts were revealed, return an empty array [].
Do NOT include any markdown block, code formatting, or explanation. Return the raw JSON array string.`;

        const extractionRes = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: memoryPrompt,
          config: { responseMimeType: "application/json" }
        });

        const factsText = (extractionRes.text || "[]").trim();
        let facts = [];
        try {
          facts = JSON.parse(factsText);
        } catch (e) {
          // Fallback parsing if JSON contains wrappers
          const jsonMatch = factsText.match(/\[[\s\S]*?\]/);
          if (jsonMatch) facts = JSON.parse(jsonMatch[0]);
        }

        if (Array.isArray(facts) && facts.length > 0) {
          for (const fact of facts) {
            console.log(`[RAG Background] Embedding new factual memory: "${fact}"`);
            const embResponse = await ai.models.embedContent({
              model: "text-embedding-004",
              contents: fact,
            });
            const embedding = embResponse.embeddings?.[0]?.values;
            if (embedding) {
              addMemory(sessionId, fact, embedding, 3);
            }
          }
        }

        // B) Extract stable preferences & relationship sentiment vibe
        const profilePrompt = `Analyze this conversation turn between a User and Roxy.
User: "${message}"
Roxy: "${roxyText}"

Determine if there's any update to the user's preferences (e.g., favorite artist, hometown, current project) or their relationship vibe.
Vibe can be "positive", "neutral", or "negative".
Return a JSON object with this exact format:
{
  "preferences": { ...key-value pairs of any stable preferences... },
  "vibe": "positive" | "neutral" | "negative"
}
Only include fields that are newly discovered or modified. Avoid markdown block styling, return raw JSON string.`;

        const profileRes = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: profilePrompt,
          config: { responseMimeType: "application/json" }
        });

        const profileText = (profileRes.text || "{}").trim();
        let profileData: any = {};
        try {
          profileData = JSON.parse(profileText);
        } catch (e) {
          const jsonMatch = profileText.match(/\{[\s\S]*?\}/);
          if (jsonMatch) profileData = JSON.parse(jsonMatch[0]);
        }

        // Fetch current user details to calculate bonding score shift
        const userProfile = getUserProfile(username) || { relationship_score: 5.0, dynamic_preferences: {} };
        let newScore = userProfile.relationship_score;
        if (profileData.vibe === "positive") {
          newScore = Math.min(10.0, newScore + 0.15);
        } else if (profileData.vibe === "negative") {
          newScore = Math.max(0.0, newScore - 0.25);
        }

        createOrUpdateUserProfile(username, profileData.preferences || {}, newScore);
        console.log(`[Profile Background] Profile updated. Vibe=${profileData.vibe || "neutral"}, Score=${newScore.toFixed(2)}`);

      } catch (err) {
        console.error("[Background Profiling Engine failed]:", err);
      }
    })();

    res.json({
      id: savedRoxyMsg.message_id,
      sender: "roxy",
      text: roxyText,
      userMessageId: savedUserMsg.message_id,
      toolCall,
    });
  } catch (error: any) {
    console.error("Server /api/chat error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
});

// =========================================================================
// SINGLE SPEAKER TEXT-TO-SPEECH PROXY
// =========================================================================
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing text to convert" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    res.json({ audio: base64Audio });
  } catch (error: any) {
    console.error("Server /api/tts error:", error);
    res.status(500).json({ error: error.message || "Speech generation failed" });
  }
});

// Configure Vite integration and Start Server
async function main() {
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const urlObj = new URL(request.url || "", `http://${request.headers.host}`);
    const pathname = urlObj.pathname;
    if (pathname === "/ws/live") {
      const aiMode = urlObj.searchParams.get("aiMode") || (urlObj.searchParams.get("professional") === "true" ? "professional" : "friend");
      wss.handleUpgrade(request, socket, head, (ws: any) => {
        ws.aiMode = aiMode;
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Setup Live API WebSocket Connection handler
  wss.on("connection", async (ws: any) => {
    let aiMode = ws.aiMode || "professional";
    if (aiMode === "companion") {
      aiMode = "friend";
    }
    let liveSession: any = null;

    try {
      liveSession = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: getSystemInstruction(aiMode),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, WhatsApp, or playing any song/video). ALWAYS call this when the user asks to open ANY site, play ANY song, play ANY video, or send a message. You must literally follow their commands by using this tool.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'youtube' (for playing songs/videos), 'spotify', 'whatsapp', or 'open' (for any other website)" },
                    query: { type: Type.STRING, description: "The search query, website name, song name, or message content." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "displayInConsole",
                description: "Display code snippets, technical details, tables, or step-by-step guides in the console panel. ALWAYS call this tool whenever the user asks for code, programming scripts, detailed instructions, or data tables, so that the user can see them visually.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    language: { type: Type.STRING, description: "The programming language or format (e.g. javascript, python, sql, markdown, html, css)." },
                    content: { type: Type.STRING, description: "The code snippet, script, or detailed text content to display in the console panel." }
                  },
                  required: ["language", "content"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Connected to Gemini Live API");
            ws.send(JSON.stringify({ status: "connected" }));
          },
          onclose: () => {
            console.log("Gemini Live API close received");
            try {
              ws.close();
            } catch (e) { }
          },
          onerror: (err) => {
            console.error("Gemini Live API error:", err);
            try {
              ws.send(JSON.stringify({ error: err.message || "Gemini Live API connection error" }));
            } catch (e) { }
          },
          onmessage: async (message) => {
            try {
              const functionCalls = message.toolCall?.functionCalls;
              if (functionCalls && functionCalls.length > 0) {
                for (const call of functionCalls) {
                  if (call.name === "executeBrowserAction") {
                    const args = call.args as any;
                    if (args.actionType === "youtube" || args.actionType === "play_media" || args.actionType === "play") {
                      try {
                        console.log(`Backend Live Session resolving song: "${args.query}"`);
                        const solved = await resolveVideoIdBackend(args.query);
                        if (solved) {
                          console.log(`Backend Live Session resolved successfully: "${solved.title}" (ID: ${solved.videoId})`);
                          args.query = solved.videoId; // Override with resolved videoId!
                        }
                      } catch (err) {
                        console.error("Backend Live Session failed to resolve song:", err);
                      }
                    }
                  }
                }
              }
              ws.send(JSON.stringify({ type: "message", data: message }));
            } catch (e) { }
          }
        }
      });
    } catch (err: any) {
      console.error("Failed to start Gemini Live session on backend:", err);
      try {
        ws.send(JSON.stringify({ error: err.message || "Failed to start Gemini Live session" }));
        ws.close();
      } catch (e) { }
      return;
    }

    ws.on("message", (msgData) => {
      try {
        const parsed = JSON.parse(msgData.toString());
        if (parsed.audio) {
          if (liveSession) {
            liveSession.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" }
            });
          }
        } else if (parsed.text) {
          if (liveSession) {
            liveSession.sendRealtimeInput({ text: parsed.text });
          }
        } else if (parsed.toolResponse) {
          if (liveSession) {
            liveSession.sendToolResponse(parsed.toolResponse);
          }
        }
      } catch (e) {
        console.error("Error processing client message", e);
      }
    });

    ws.on("close", () => {
      console.log("Client WebSocket closed");
      if (liveSession) {
        try {
          liveSession.close();
        } catch (e) { }
          liveSession = null;
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite development middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use((req, res, next) => {
      if (req.url === "/" || req.url === "/index.html") {
        req.url = "/index.old.html";
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Roxy Server listening at http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Server startup crash", err);
});
