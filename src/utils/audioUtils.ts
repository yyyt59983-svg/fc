export interface VoiceProfile {
  profile_id?: string;
  name?: string;
  pitch_shift?: number;
  speed_rate?: number;
  volume_gain?: number;
  voice_model_path?: string;
  formant_shift?: number;
  whisper_mode?: number | boolean;
  reverb_wetness?: number;
}

export async function playPCM(base64Data: string, profile?: VoiceProfile): Promise<void> {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("AudioContext not supported");
      return;
    }
    
    const audioCtx = new AudioContextClass({ sampleRate: 24000 });
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const buffer = new Int16Array(bytes.buffer);
    const audioBuffer = audioCtx.createBuffer(1, buffer.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      channelData[i] = buffer[i] / 32768.0;
    }
    
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;

    let lastNode: AudioNode = source;

    // 1. Pitch & Speed Modulation (via PlaybackRate multiplier)
    if (profile) {
      const pitch = profile.pitch_shift ?? 0.0;
      const speed = profile.speed_rate ?? 1.0;
      // semitone to frequency ratio formula: f = f0 * 2^(n/12)
      const pitchMultiplier = Math.pow(2, pitch / 12);
      source.playbackRate.value = speed * pitchMultiplier;
    }

    // 2. Whisper Mode Filter (breathy highpass filtering)
    if (profile && (profile.whisper_mode === 1 || profile.whisper_mode === true)) {
      const highpassFilter = audioCtx.createBiquadFilter();
      highpassFilter.type = "highpass";
      highpassFilter.frequency.value = 2200; // filter out bass for a thin breathy ASMR whisper
      highpassFilter.Q.value = 1.0;
      
      lastNode.connect(highpassFilter);
      lastNode = highpassFilter;
    }

    // 3. Volume Gain Control
    if (profile && profile.volume_gain !== undefined && profile.volume_gain !== 0) {
      const gainNode = audioCtx.createGain();
      // dB to linear conversion formula: gain = 10^(dB/20)
      const linearGain = Math.pow(10, profile.volume_gain / 20);
      gainNode.gain.value = linearGain;

      lastNode.connect(gainNode);
      lastNode = gainNode;
    }

    // 4. Space Reverb / Echo Echo
    if (profile && profile.reverb_wetness !== undefined && profile.reverb_wetness > 0) {
      const delayNode = audioCtx.createDelay();
      delayNode.delayTime.value = 0.12; // 120ms echo spacing

      const feedbackNode = audioCtx.createGain();
      feedbackNode.gain.value = Math.min(0.7, profile.reverb_wetness * 0.45); // decay rate

      const wetNode = audioCtx.createGain();
      wetNode.gain.value = Math.min(1.0, profile.reverb_wetness * 0.6); // blend weight

      // Feedback delay loop
      lastNode.connect(delayNode);
      delayNode.connect(feedbackNode);
      feedbackNode.connect(delayNode);

      // Connect dry signal directly to destination
      lastNode.connect(audioCtx.destination);

      // Connect wet signal from delay line
      delayNode.connect(wetNode);
      wetNode.connect(audioCtx.destination);
    } else {
      // Connect to output destination
      lastNode.connect(audioCtx.destination);
    }

    source.start();
    
    return new Promise<void>(resolve => {
      source.onended = () => {
        try {
          audioCtx.close();
        } catch (e) {}
        resolve();
      };
    });
  } catch (error) {
    console.error("Error playing modulated audio:", error);
  }
}

