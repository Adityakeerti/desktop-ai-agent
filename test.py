import os
import time
import sounddevice as sd
from scipy.io.wavfile import write
import requests
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

# ==========================================
# CONFIGURATION
# ==========================================
RECORD_SECONDS = 5
SAMPLE_RATE = 16000
AUDIO_FILE = "test_recording.wav"

# Add your API keys here or in a .env file
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY", "")
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "")

# ==========================================
# RECORD AUDIO
# ==========================================
def select_device():
    print("Available Input Devices:")
    devices = sd.query_devices()
    input_devices = []
    default_device = sd.default.device[0]
    
    for i, dev in enumerate(devices):
        if dev['max_input_channels'] > 0:
            input_devices.append(i)
            default_marker = " > " if i == default_device else "   "
            print(f"{default_marker}[{i}] {dev['name']}")
    
    while True:
        try:
            choice = input("\nEnter the device ID to use (or press Enter for default): ")
            if not choice.strip():
                return None
            device_id = int(choice)
            if device_id in input_devices:
                return device_id
            print("Invalid device ID. Please select from the list.")
        except ValueError:
            print("Please enter a valid number.")

def record_audio(device_id=None):
    if device_id is not None:
        device_name = sd.query_devices(device_id)['name']
        print(f"\n🎤 Recording for {RECORD_SECONDS} seconds using [{device_id}] {device_name}... Speak now!")
        audio_data = sd.rec(int(RECORD_SECONDS * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype='int16', device=device_id)
    else:
        print(f"\n🎤 Recording for {RECORD_SECONDS} seconds using Default Microphone... Speak now!")
        audio_data = sd.rec(int(RECORD_SECONDS * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype='int16')
        
    sd.wait()  # Wait until recording is finished
    write(AUDIO_FILE, SAMPLE_RATE, audio_data)  # Save as WAV file 
    print(f"✅ Audio saved to {AUDIO_FILE}\n")

# ==========================================
# STT TEST FUNCTIONS
# ==========================================
def test_groq():
    if not GROQ_API_KEY:
        print("⏭️  Skipping Groq: GROQ_API_KEY not set.")
        return
    print("🚀 Testing Groq API (Whisper-large-v3)...")
    try:
        start_time = time.time()
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
        with open(AUDIO_FILE, "rb") as file:
            files = {
                "file": (AUDIO_FILE, file, "audio/wav"),
                "model": (None, "whisper-large-v3"),
            }
            # Using standard requests to avoid needing the 'groq' package
            response = requests.post("https://api.groq.com/openai/v1/audio/transcriptions", headers=headers, files=files)
            response.raise_for_status()
            transcript = response.json().get("text", "")
            
        duration = time.time() - start_time
        print(f"⏱️  Time: {duration:.2f}s")
        print(f"📝 Output: {transcript}\n")
    except Exception as e:
        print(f"❌ Groq Error: {e}\n")

def test_deepgram():
    if not DEEPGRAM_API_KEY:
        print("⏭️  Skipping Deepgram: DEEPGRAM_API_KEY not set.")
        return
    print("🚀 Testing Deepgram API (Nova-2)...")
    try:
        start_time = time.time()
        headers = {
            "Authorization": f"Token {DEEPGRAM_API_KEY}",
            "Content-Type": "audio/wav"
        }
        with open(AUDIO_FILE, "rb") as file:
            # Using standard requests to avoid needing the 'deepgram-sdk' package
            response = requests.post(
                "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
                headers=headers,
                data=file
            )
            response.raise_for_status()
            data = response.json()
            transcript = data["results"]["channels"][0]["alternatives"][0]["transcript"]
            
        duration = time.time() - start_time
        print(f"⏱️  Time: {duration:.2f}s")
        print(f"📝 Output: {transcript}\n")
    except Exception as e:
        print(f"❌ Deepgram Error: {e}\n")

def test_assemblyai():
    if not ASSEMBLYAI_API_KEY:
        print("⏭️  Skipping AssemblyAI: ASSEMBLYAI_API_KEY not set.")
        return
    print("🚀 Testing AssemblyAI...")
    try:
        import assemblyai as aai
        aai.settings.api_key = ASSEMBLYAI_API_KEY
        transcriber = aai.Transcriber()
        
        start_time = time.time()
        transcript = transcriber.transcribe(AUDIO_FILE)
        duration = time.time() - start_time
        
        print(f"⏱️  Time: {duration:.2f}s")
        print(f"📝 Output: {transcript.text}\n")
    except ImportError:
        print("⏭️  Skipping AssemblyAI: python package 'assemblyai' not installed.")
    except Exception as e:
        print(f"❌ AssemblyAI Error: {e}\n")

def test_google():
    print("🚀 Testing Google STT (Free Web API)...")
    try:
        import speech_recognition as sr
        r = sr.Recognizer()
        
        start_time = time.time()
        with sr.AudioFile(AUDIO_FILE) as source:
            audio = r.record(source)
        transcript = r.recognize_google(audio)
        duration = time.time() - start_time
        
        print(f"⏱️  Time: {duration:.2f}s")
        print(f"📝 Output: {transcript}\n")
    except ImportError:
        print("⏭️  Skipping Google STT: python package 'SpeechRecognition' not installed.")
        print("   (Run: pip install SpeechRecognition)")
    except Exception as e:
        print(f"❌ Google Error: {e}\n")

def test_azure():
    if not AZURE_SPEECH_KEY or not AZURE_SPEECH_REGION:
        print("⏭️  Skipping Microsoft Azure STT: AZURE_SPEECH_KEY or AZURE_SPEECH_REGION not set in .env")
        return
    print("🚀 Testing Microsoft Azure STT...")
    try:
        import azure.cognitiveservices.speech as speechsdk
        start_time = time.time()
        
        speech_config = speechsdk.SpeechConfig(subscription=AZURE_SPEECH_KEY, region=AZURE_SPEECH_REGION)
        audio_config = speechsdk.AudioConfig(filename=AUDIO_FILE)
        speech_recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

        result = speech_recognizer.recognize_once_async().get()
        duration = time.time() - start_time
        
        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            print(f"⏱️  Time: {duration:.2f}s")
            print(f"📝 Output: {result.text}\n")
        else:
            print(f"❌ Azure Error: {result.reason}\n")
    except ImportError:
        print("⏭️  Skipping Microsoft Azure STT: python package 'azure-cognitiveservices-speech' not installed.")
        print("   (Run: pip install azure-cognitiveservices-speech)")
    except Exception as e:
        print(f"❌ Azure Error: {e}\n")


if __name__ == "__main__":
    print("==================================================")
    print("   Speech-to-Text (STT) Benchmarking Script       ")
    print("==================================================\n")
    
    print("Which provider do you want to test?")
    print("  [1] Groq API")
    print("  [2] Deepgram API")
    print("  [3] AssemblyAI")
    print("  [4] Google STT (Free)")
    print("  [5] Microsoft Azure")
    print("  [6] Test All Providers")
    
    while True:
        provider_choice = input("\nEnter choice (1-6): ").strip()
        if provider_choice in ["1", "2", "3", "4", "5", "6"]:
            break
        print("Invalid choice. Please enter 1-6.")

    # 1. Select Device
    selected_device = select_device()
    
    # 2. Record Audio
    record_audio(selected_device)
    
    # 3. Run Tests
    if provider_choice == "1":
        test_groq()
    elif provider_choice == "2":
        test_deepgram()
    elif provider_choice == "3":
        test_assemblyai()
    elif provider_choice == "4":
        test_google()
    elif provider_choice == "5":
        test_azure()
    elif provider_choice == "6":
        test_groq()
        test_deepgram()
        test_assemblyai()
        test_google()
        test_azure()
    
    print("=== Benchmarking Complete ===")
    print(f"The audio recording has been saved as '{AUDIO_FILE}'.")
    print("You can listen to it to verify the source audio.")
