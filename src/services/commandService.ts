export function processCommand(command: string): {
  action: string;
  url?: string;
  actionType?: "play_media" | "open_url";
} {
  const lowerCmd = command.toLowerCase().trim();

  // Media Playback: "Play [song/video]"
  // Handle both "play X on youtube" and just "play X"
  const playMatch = lowerCmd.match(/play\s+(.+)$/);
  if (playMatch) {
    let query = playMatch[1].trim();
    query = query.replace(/[\.\?\!]+$/, "").trim(); // remove trailing punctuation
    query = query.replace(/\s+on\s+(youtube|spotify)$/i, "").trim();
    
    return {
      action: `Playing ${query} for you.`,
      url: encodeURIComponent(query), // We pass the query as URL for play_media, App.tsx will handle it
      actionType: "play_media",
    };
  }

  // General Browsing: "Open [website name]"
  const openMatch = lowerCmd.match(/^open\s+(.+)$/);
  if (openMatch) {
    let website = openMatch[1].trim().replace(/\s+/g, "");
    if (!website.includes(".")) {
      website += ".com";
    }
    return {
      action: `Opening ${openMatch[1]} for you, ugh.`,
      url: `https://www.${website}`,
      actionType: "open_url",
    };
  }

  // Spotify Search
  const spotifyMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = encodeURIComponent(spotifyMatch[1].trim());
    return {
      action: `Searching ${spotifyMatch[1]} on Spotify. Hope it's a banger.`,
      url: `https://open.spotify.com/search/${query}`,
      actionType: "open_url",
    };
  }

  // WhatsApp Web
  const waMatch = lowerCmd.match(
    /^send\s+a\s+whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/,
  );
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(waMatch[2].trim());
    return {
      action: `Sending your message. Let's hope they reply, lo.`,
      url: `https://web.whatsapp.com/send?phone=${number}&text=${message}`,
      actionType: "open_url",
    };
  }

  return { action: "" };
}
