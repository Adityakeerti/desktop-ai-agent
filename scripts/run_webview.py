import webview
import threading
import sys
import os
# Allow running from repo root or from scripts/ directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import json

# Import backend logic
import backend.windows_agent as _agent_backend
from backend.windows_agent import ask_llm as _ask_llm_backend, execute as _execute_backend, global_memory, listen as _listen_backend

try:
    import psutil
    _PSUTIL = True
except ImportError:
    _PSUTIL = False

try:
    import pyperclip
    _PYPERCLIP = True
except ImportError:
    _PYPERCLIP = False


class Api:
    def __init__(self):
        pass

    # ── Core command pipeline ──────────────────────────────────────────────────
    
    def listen(self):
        """Calls the backend listen function and returns transcribed text."""
        print("[Api] Listening for voice input...")
        try:
            return _listen_backend()
        except Exception as e:
            print(f"[Api] Voice error: {e}")
            raise e


    def ask_llm(self, command: str):
        """
        Takes a string command from React, runs it through the LLM.
        Returns a dict: {"action": "some_action", "result": "raw string", "full": {...}}
        """
        print(f"[Api] Received command: {command}")
        global_memory.add_user(command)

        action_dict = _ask_llm_backend(command, global_memory.get_history())

        if action_dict:
            global_memory.add_agent(action_dict)          # pass dict directly — add_agent does json.dumps internally
            self._last_action = action_dict               # cache for execute_action
            return {
                "action": str(action_dict.get("action", "unknown action")),
                "full":   action_dict,
                "result": "Success",
            }

        self._last_action = None
        return None

    def execute_action(self, action_str: str):
        """
        Executes the last parsed action dict (cached from ask_llm).
        Falls back to parsing history if cache is missing.
        Returns a human-readable result string.
        """
        print(f"[Api] Executing: {action_str}")

        # ── Fast path: use cached action dict from ask_llm ────────────────────
        action_dict = getattr(self, "_last_action", None)

        # ── Fallback: try to recover from memory ──────────────────────────────
        if not action_dict:
            history = global_memory.get_history()
            for item in reversed(history):
                if item.startswith("Agent Action: "):
                    content = item[len("Agent Action: "):]
                    try:
                        parsed = json.loads(content)
                        if isinstance(parsed, dict):
                            action_dict = parsed
                        elif isinstance(parsed, str):
                            import ast
                            action_dict = ast.literal_eval(parsed)
                        break
                    except Exception as e:
                        print(f"[Api] Error parsing action dict from history: {e}")

        if action_dict:
            result = _execute_backend(action_dict)
            print(f"[Api] Execution result: {result}")
            return str(result)
        else:
            return "Error: Could not retrieve action for execution."

    def clear_memory(self):
        print("[Api] Clearing memory")
        global_memory.clear()
        return "Cleared"

    # ── Provider management ────────────────────────────────────────────────────

    def get_providers(self):
        """Returns list of provider names for the dropdown."""
        names = ["Auto (Fallback)"] + [name for name, _ in _agent_backend.PROVIDERS]
        return names

    def set_provider(self, name: str):
        """Pin the LLM to a specific provider, or None for auto fallback."""
        if name == "Auto (Fallback)":
            _agent_backend.SELECTED_PROVIDER = None
        else:
            _agent_backend.SELECTED_PROVIDER = name
        print(f"[Api] Provider pinned to: {name}")
        return f"Provider set to: {name}"

    def get_active_provider(self):
        """Returns the currently selected provider name."""
        return _agent_backend.SELECTED_PROVIDER or "Auto (Fallback)"

    # ── System stats ───────────────────────────────────────────────────────────

    def get_system_info_quick(self):
        """Returns a small dict with CPU%, RAM used/total for the stats bar."""
        if not _PSUTIL:
            return {"cpu": "--", "ram_used": "--", "ram_total": "--", "ram_pct": "--"}
        try:
            cpu = psutil.cpu_percent(interval=0.3)
            vm  = psutil.virtual_memory()
            return {
                "cpu":       round(cpu, 1),
                "ram_used":  round(vm.used  / (1024 ** 3), 1),
                "ram_total": round(vm.total / (1024 ** 3), 1),
                "ram_pct":   round(vm.percent, 1),
            }
        except Exception as e:
            return {"cpu": "--", "ram_used": "--", "ram_total": "--", "ram_pct": "--"}

    # ── Chat log ───────────────────────────────────────────────────────────────

    def save_chat_log(self, text: str):
        """Copies the given text (chat log) to the clipboard."""
        if _PYPERCLIP:
            try:
                pyperclip.copy(text)
                return "Chat log copied to clipboard."
            except Exception as e:
                return f"Clipboard error: {e}"
        return "pyperclip not installed."

    # ── Voice input ────────────────────────────────────────────────────────────

    def listen(self):
        """Records audio from microphone until silence, then transcribes with Google STT."""
        try:
            import sounddevice as sd
            import numpy as np
            from scipy.io.wavfile import write
            import speech_recognition as sr
            import tempfile
            import os
        except ImportError:
            return "Error: Required audio modules not installed (sounddevice, numpy, scipy, SpeechRecognition)."

        print("[Api] Starting microphone recording...")
        
        SAMPLE_RATE = 16000
        CHUNK_DURATION = 0.1
        SILENCE_DURATION = 1.5
        MAX_DURATION = 10.0
        
        chunk_samples = int(SAMPLE_RATE * CHUNK_DURATION)
        max_chunks = int(MAX_DURATION / CHUNK_DURATION)
        silence_chunks_limit = int(SILENCE_DURATION / CHUNK_DURATION)
        
        try:
            print("[Api] Calibrating noise floor...")
            calibration_audio = sd.rec(int(SAMPLE_RATE * 0.5), samplerate=SAMPLE_RATE, channels=1, dtype='int16')
            sd.wait()
            noise_floor = np.sqrt(np.mean(calibration_audio.astype(np.float32)**2))
            threshold = max(noise_floor * 2.5, 150)
            
            print(f"[Api] Noise floor: {noise_floor:.2f}, Threshold: {threshold:.2f}")
            
            audio_data = []
            silence_chunks = 0
            
            with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='int16') as stream:
                print("[Api] Listening...")
                for i in range(max_chunks):
                    chunk, overflowed = stream.read(chunk_samples)
                    audio_data.append(chunk)
                    
                    volume = np.sqrt(np.mean(chunk.astype(np.float32)**2))
                    if volume > threshold:
                        silence_chunks = 0
                    else:
                        silence_chunks += 1
                    
                    if silence_chunks >= silence_chunks_limit and i > (1.0 / CHUNK_DURATION):
                        print("[Api] Silence detected, stopping recording.")
                        break

            recording = np.concatenate(audio_data, axis=0)
            temp_wav = os.path.join(tempfile.gettempdir(), "rage_voice_cmd.wav")
            write(temp_wav, SAMPLE_RATE, recording)
            
            print("[Api] Transcribing audio...")
            r = sr.Recognizer()
            with sr.AudioFile(temp_wav) as source:
                audio = r.record(source)
            transcript = r.recognize_google(audio)
            print(f"[Api] Transcription: {transcript}")
            return transcript
        except sr.UnknownValueError:
            return "Error: Could not understand audio."
        except sr.RequestError as e:
            return f"Error: STT service unavailable ({e})."
        except Exception as e:
            return f"Error: {e}"

    # ── Window control ─────────────────────────────────────────────────────────

    def close_window(self):
        """Closes the webview window gracefully."""
        try:
            webview.windows[0].destroy()
        except Exception:
            pass

    def minimize_window(self):
        """Minimizes the webview window."""
        try:
            webview.windows[0].minimize()
        except Exception:
            pass

    def toggle_fullscreen(self):
        """Toggles fullscreen mode on the webview window."""
        try:
            win = webview.windows[0]
            win.toggle_fullscreen()
            return True
        except Exception as e:
            print(f"[Api] toggle_fullscreen error: {e}")
            return False

    def is_fullscreen(self):
        """Returns current fullscreen state."""
        try:
            return bool(webview.windows[0].fullscreen)
        except Exception:
            return False


if __name__ == '__main__':
    api = Api()

    # Path to the React built files — works whether launched from root or scripts/
    _here = os.path.dirname(os.path.abspath(__file__))
    frontend_path = os.path.join(_here, '..', 'frontend', 'dist', 'index.html')
    frontend_path = os.path.normpath(frontend_path)

    if not os.path.exists(frontend_path):
        print(f"Error: Could not find built React app at {frontend_path}")
        print("Please run 'npm run build' inside the 'frontend' directory.")
        sys.exit(1)

    window = webview.create_window(
        title='R.A.G.E. - Windows Automation Agent',
        url=f'file:///{frontend_path.replace(os.sep, "/")}',
        js_api=api,
        width=1200,
        height=760,
        min_size=(900, 600),
        background_color='#0d0505',
        frameless=True,
        easy_drag=False,
    )

    webview.start(debug=False)
