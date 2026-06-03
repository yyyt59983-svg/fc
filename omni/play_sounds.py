# play_sounds.py
# Relational Database Audio Player Demo
# Generates real physical .wav files, saves them in the database, and plays them out loud!

import os
import wave
import struct
import math
import time
import winsound
from db_manager import AICompanionDB

def generate_tone_wav(file_path, frequency=440, duration=0.8, robotic=False):
    """Generates a real, playable 16-bit mono PCM .wav audio file."""
    sample_rate = 44100
    num_samples = int(sample_rate * duration)
    
    # Make sure folder exists
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    
    with wave.open(file_path, 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        
        for i in range(num_samples):
            t = i / sample_rate
            # Synthesize tone
            if robotic:
                # Robotic ring-modulated pulse wave
                v = math.sin(2.0 * math.pi * frequency * t) * math.sin(2.0 * math.pi * 35 * t)
                value = int(25000.0 * (1.0 if v > 0 else -1.0) * (1.0 - t/duration))
            else:
                # Cheerful sine wave tone with brief decay
                value = int(28000.0 * math.sin(2.0 * math.pi * frequency * t) * math.exp(-3.0 * t / duration))
                
            data = struct.pack('<h', value)
            wav_file.writeframesraw(data)

def main():
    print("=================================================================")
    print("          AI COMPANION PHYSICAL AUDIO PLAYBACK DEMO             ")
    print("=================================================================\n")

    # 1. Initialize the optimized database
    db = AICompanionDB(
        db_path="companion.db",
        schema_path="schema.sql",
        recordings_dir="data/recordings"
    )

    # 2. Create the Voice Profiles if they do not already exist
    if not db.get_voice_profile("Cheerful Assistant"):
        db.create_voice_profile("Cheerful Assistant", pitch_shift=3.0)
    if not db.get_voice_profile("Cybernetic Bot"):
        db.create_voice_profile("Cybernetic Bot", pitch_shift=-5.5)

    # 3. Start a conversation session
    session = db.create_session("Aura", "Live audio sound test session")
    session_id = session["session_id"]
    
    temp_user_wav = "data/temp_user.wav"
    temp_bot_wav = "data/temp_bot.wav"

    # 4. Generate actual sound waves
    print("[1/3] Generating physical audio frequencies...")
    # Generate 600Hz clean chime for user/cheerful response
    generate_tone_wav(temp_user_wav, frequency=600, duration=0.6, robotic=False)
    # Generate 150Hz vibrating buzzing pulse for cybernetic bot
    generate_tone_wav(temp_bot_wav, frequency=150, duration=1.0, robotic=True)
    
    # Read the physical sound files as binary blobs
    with open(temp_user_wav, "rb") as f:
        user_audio_bytes = f.read()
    with open(temp_bot_wav, "rb") as f:
        bot_audio_bytes = f.read()

    # 5. Store the messages (This automatically saves the speech files on disk under the session folder)
    print("[2/3] Saving physical speech to database and external storage...")
    user_msg = db.add_message(
        session_id=session_id,
        sender="user",
        text_content="Aura, speak to me in Cheerful voice!",
        audio_blob=user_audio_bytes
    )
    
    bot_msg = db.add_message(
        session_id=session_id,
        sender="companion",
        text_content="[BEEP-BOOP] DIGITAL CHIME INITIATED. COMMENCING SOUND PLAYBACK.",
        audio_blob=bot_audio_bytes
    )

    # 6. Retrieve and play the audio files out loud!
    print("\n[3/3] Retrieving from DB and playing through speakers...")
    
    # Play User / Cheerful chime
    user_file_path = os.path.normpath(user_msg["audio_path"])
    print(f"\n>>> Playing User Audio (Path: {user_file_path})")
    print("    [Sound: High-pitched digital chime]")
    # Play native audio through Windows sound card
    winsound.PlaySound(user_file_path, winsound.SND_FILENAME)
    
    time.sleep(0.5)

    # Play Companion Robotic beep
    bot_file_path = os.path.normpath(bot_msg["audio_path"])
    print(f"\n>>> Playing Companion Audio (Path: {bot_file_path})")
    print("    [Sound: Robotic vibrating pulse]")
    winsound.PlaySound(bot_file_path, winsound.SND_FILENAME)

    # 7. Clean up the temp files outside DB
    if os.path.exists(temp_user_wav): os.remove(temp_user_wav)
    if os.path.exists(temp_bot_wav): os.remove(temp_bot_wav)
    
    print("\n=================================================================")
    print("   Sound playbacks complete! Storage and playback fully verified. ")
    print("=================================================================")

if __name__ == "__main__":
    main()
