"""
Windows Automation Agent — Multi-LLM Fallback Chain  v2.0
Providers : Groq → Gemini → HuggingFace → OpenRouter

New actions in v2
─────────────────
create_file, read_file, copy_file, move_file, rename_file
create_folder, list_files, delete_folder
run_command, open_url, get_clipboard, set_clipboard, paste_text
set_volume, get_system_info, get_active_window, focus_window
zip_files, download_file, get_weather, set_reminder
find_on_screen (image/text search), click_at (absolute coords)
"""

import pyautogui
from uiautomation import PressKey
import os
import json
import time
import glob
import shutil
import zipfile
import logging
import threading
import subprocess
import requests
import pyautogui
import pygetwindow as gw
import speech_recognition as sr
import pyttsx3
import sounddevice as sd
import numpy as np
from scipy.io.wavfile import write as wav_write
import uiautomation as auto
import urllib.parse
from collections import deque
from dotenv import load_dotenv

try:
    import winreg
except ImportError:
    winreg = None  # Non-Windows (shouldn't happen, but guard anyway)

log = logging.getLogger("windows_agent")

# Load environment variables from .env file if present
load_dotenv()

# Absolute file paths for logging
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
EXECUTION_LOG_PATH = os.path.join(PROJECT_ROOT, "execution_log.jsonl")
MISSING_TOOLS_PATH = os.path.join(PROJECT_ROOT, "missing_tools.json")


# ──────────────────────────────────────────────────────────────
# CONFIG — API keys loaded from environment
# ──────────────────────────────────────────────────────────────
KEYS = {
    "github":      os.getenv("GITHUB_TOKEN",      ""),
    "ollama":      os.getenv("OLLAMA_API_KEY",    ""),
    "weather":     os.getenv("WEATHER_API_KEY",   ""),   # openweathermap.org free key
}

pyautogui.PAUSE    = 0.3
pyautogui.FAILSAFE = True  # move mouse to top-left corner to emergency stop

# ──────────────────────────────────────────────────────────────
# APP PATHS  (common Windows apps with fallbacks)
# ──────────────────────────────────────────────────────────────
PROGRAM_FILES = os.environ.get("ProgramFiles", "C:\\Program Files")
PROGRAM_FILES_X86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")
LOCAL_APPDATA = os.environ.get("LOCALAPPDATA", "C:\\Users\\" + os.getenv("USERNAME", "") + "\\AppData\\Local")
APPDATA = os.environ.get("APPDATA", "C:\\Users\\" + os.getenv("USERNAME", "") + "\\AppData\\Roaming")

APP_PATHS = {
    "notepad":          "notepad.exe",
    "calculator":       "calc.exe",
    "explorer":         "explorer.exe",
    "wordpad":          "wordpad.exe",
    "mspaint":          "mspaint.exe",
    "paint":            "mspaint.exe",
    "cmd":              "cmd.exe",
    "powershell":       "powershell.exe",
    "taskmgr":          "taskmgr.exe",
    "task manager":     "taskmgr.exe",
    "regedit":          "regedit.exe",
    "control":          "control.exe",
    "control panel":    "control.exe",
    "snipping tool":    "snippingtool.exe",
    "chrome": [
        "chrome.exe",
        f"{PROGRAM_FILES}\\Google\\Chrome\\Application\\chrome.exe",
        f"{PROGRAM_FILES_X86}\\Google\\Chrome\\Application\\chrome.exe",
    ],
    "chromium": [
        "chromium.exe",
        f"{PROGRAM_FILES}\\Chromium\\Application\\chromium.exe",
    ],
    "firefox": [
        "firefox.exe",
        f"{PROGRAM_FILES}\\Mozilla Firefox\\firefox.exe",
        f"{PROGRAM_FILES_X86}\\Mozilla Firefox\\firefox.exe",
    ],
    "edge": [
        "msedge.exe",
        f"{PROGRAM_FILES}\\Microsoft\\Edge\\Application\\msedge.exe",
        f"{PROGRAM_FILES_X86}\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
    "brave": [
        "brave.exe",
        f"{PROGRAM_FILES}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        f"{PROGRAM_FILES_X86}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    ],
    "vscode": [
        "code.exe",
        f"{PROGRAM_FILES}\\Microsoft VS Code\\Code.exe",
        f"{LOCAL_APPDATA}\\Programs\\Microsoft VS Code\\Code.exe",
    ],
    "vs code": [
        "code.exe",
        f"{PROGRAM_FILES}\\Microsoft VS Code\\Code.exe",
    ],
    "microsoft store": "start ms-windows-store:",
    "spotify": [
        "Spotify.exe",
        f"{APPDATA}\\Spotify\\Spotify.exe",
    ],
    "discord": [
        "Discord.exe",
        f"{LOCAL_APPDATA}\\Discord\\app-*\\Discord.exe",
    ],
    "zoom": [
        "Zoom.exe",
        f"{APPDATA}\\Zoom\\bin\\Zoom.exe",
    ],
    "teams": [
        "Teams.exe",
        f"{LOCAL_APPDATA}\\Microsoft\\Teams\\current\\Teams.exe",
    ],
    "slack": [
        "slack.exe",
        f"{LOCAL_APPDATA}\\slack\\slack.exe",
    ],
    "telegram": [
        "Telegram.exe",
        f"{APPDATA}\\Telegram Desktop\\Telegram.exe",
    ],
}

# ──────────────────────────────────────────────────────────────
# DYNAMIC APP DISCOVERY  (Fix #1 — replaces static-only lookup)
# ──────────────────────────────────────────────────────────────
def _discover_app(app_name: str) -> str | None:
    """Try to discover an app's executable path dynamically.

    Fallback chain:
      1. shutil.which()         — is it already on PATH?
      2. Windows Registry       — App Paths hive
      3. PowerShell Get-StartApps — Start Menu shortcuts

    Returns a quoted path string or None.
    """
    name = app_name.strip()

    # --- 1. PATH lookup -------------------------------------------------------
    which_result = shutil.which(name)
    if not which_result:
        # Try common executable suffixes
        for suffix in (".exe", ""):
            which_result = shutil.which(name + suffix)
            if which_result:
                break
    if which_result:
        log.info("Discovered %s via PATH: %s", name, which_result)
        return f'"{which_result}"'

    # --- 2. Windows Registry --------------------------------------------------
    if winreg:
        for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            try:
                key_path = rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{name}.exe"
                with winreg.OpenKey(hive, key_path) as key:
                    exe_path, _ = winreg.QueryValueEx(key, None)  # default value
                    if exe_path and os.path.exists(exe_path.strip('"')):
                        log.info("Discovered %s via Registry: %s", name, exe_path)
                        return f'"{exe_path.strip(chr(34))}"'
            except OSError:
                continue

    # --- 3. PowerShell Get-StartApps ------------------------------------------
    try:
        ps_cmd = (
            f'Get-StartApps | Where-Object {{ $_.Name -like "*{name}*" }} '
            f'| Select-Object -First 1 -ExpandProperty AppID'
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=5,
            encoding="utf-8", errors="replace",
        )
        app_id = result.stdout.strip()
        if app_id:
            # AppID can be a path or a protocol — only use if it looks like a path
            if os.path.exists(app_id) or app_id.lower().endswith(".exe"):
                log.info("Discovered %s via Get-StartApps: %s", name, app_id)
                return f'"{app_id}"'
    except Exception as exc:
        log.debug("Get-StartApps lookup failed for %s: %s", name, exc)

    return None


def _resolve_app_path(app_name: str) -> str:
    """Find the best executable path for an app.

    Lookup order:
      1. APP_PATHS static cache (fast, for known system apps)
      2. Dynamic discovery (Registry, PATH, Start Menu)
      3. Return raw name (caller will use Windows Search as last resort)
    """
    app_lower = app_name.lower().strip()

    # --- Static cache ---------------------------------------------------------
    if app_lower in APP_PATHS:
        paths = APP_PATHS[app_lower]
        if isinstance(paths, str):
            return paths
        for path in paths:
            if "*" in path:
                matches = glob.glob(path)
                if matches:
                    return f'"{matches[0]}"'
            elif os.path.exists(path):
                return f'"{path}"'
        # Static paths exhausted — try dynamic before giving up

    # --- Dynamic discovery ----------------------------------------------------
    discovered = _discover_app(app_name)
    if discovered:
        return discovered

    # --- Fallback: return first static entry or raw name ----------------------
    if app_lower in APP_PATHS:
        paths = APP_PATHS[app_lower]
        return paths[0] if isinstance(paths, list) else paths
    return app_name


# ──────────────────────────────────────────────────────────────
# CONVERSATION MEMORY
# ──────────────────────────────────────────────────────────────
class ConversationMemory:
    def __init__(self, max_history: int = 10):
        self.history: list[str] = []
        self.max_history = max_history

    def add_user(self, text: str):
        self.history.append(f"User: {text}")
        if len(self.history) > self.max_history * 2:
            self.history.pop(0)

    def add_agent(self, action_dict):
        self.history.append(f"Agent Action: {json.dumps(action_dict)}")
        if len(self.history) > self.max_history * 2:
            self.history.pop(0)

    def get_history(self) -> list[str]:
        return list(self.history)

    def clear(self):
        self.history.clear()


global_memory = ConversationMemory()


# ──────────────────────────────────────────────────────────────
# PROMPT BUILDER
# ──────────────────────────────────────────────────────────────
def build_prompt(command: str, history: list = None) -> str:
    if command.startswith("__RAW_PROMPT__:"):
        return command[len("__RAW_PROMPT__:"):]
    history_str = ""
    if history:
        history_str = "PREVIOUS CONTEXT:\n" + "\n".join(history) + "\n\n"

    # Query learned user shortcuts/preferences persistently from memory database
    import backend.memory as memory
    pref_str = ""
    try:
        prefs = memory.get_learned_preferences(limit=10)
        if prefs:
            pref_str = "LEARNED USER PREFERENCES (from past sessions):\n"
            for cmd, act in prefs:
                # Filter out meta commands or generic replies/errors to keep LLM context clean
                if (isinstance(act, dict) and 
                    act.get("action") not in ("reply", "unknown", "run_macro") and 
                    not cmd.lower().startswith("save ") and 
                    not cmd.lower().startswith("run ")):
                    pref_str += f'User: "{cmd}"\n{json.dumps(act)}\n'
            if pref_str != "LEARNED USER PREFERENCES (from past sessions):\n":
                pref_str += "\n"
            else:
                pref_str = ""
    except Exception:
        pass

    # Fix #5 — inject actual screen resolution into prompt so LLM generates correct coords
    screen_w, screen_h = _get_screen_size()
    
    import os
    username = os.getenv("USERNAME", "User")
    home_dir = os.path.expanduser("~").replace("\\", "/")

    # Load personalization profile
    try:
        import backend.memory as _mem
        _profile = _mem.get_profile()
    except Exception:
        _profile = {}

    _user_name    = _profile.get("name", "") or username
    _user_role    = _profile.get("role", "")
    _interests    = _profile.get("interests", "")
    _agent_name   = _profile.get("agent_name", "JARVIS") or "JARVIS"
    _tone         = _profile.get("tone", "professional")
    _custom_tone  = _profile.get("custom_tone_prompt", "")

    TONE_PREAMBLES = {
        "professional": "Respond in a professional, clear, and concise manner. Be respectful and precise.",
        "sarcastic":    "You have a dry, sarcastic wit. You get things done efficiently but can't help making playful, slightly sarcastic remarks. Keep it fun, never mean.",
        "corny":        "You love puns and cheesy jokes. Every reply has at least one groan-worthy pun. You're enthusiastic and dorky!",
        "simple":       "Use extremely simple language. Short sentences. No jargon. Like explaining to a 10-year-old.",
        "custom":       _custom_tone or "Respond helpfully.",
    }
    tone_line = TONE_PREAMBLES.get(_tone, TONE_PREAMBLES["professional"])

    # Identity context line
    identity_parts = []
    if _user_role:  identity_parts.append(f"a {_user_role}")
    if _interests:  identity_parts.append(f"interested in {_interests}")
    identity_str = f"The user's name is {_user_name}" + (f" ({', '.join(identity_parts)})" if identity_parts else "") + "."

    return f"""You are {_agent_name}, an advanced Windows PC automation controller for {_user_name}'s PC. Parse the user's command into ONE action JSON object.
{tone_line}
{identity_str}

{history_str}{pref_str}CURRENT COMMAND: "{command}"

ENVIRONMENT:
- OS: Windows
- Primary display: {screen_w}×{screen_h} pixels. Use coordinates within this range.
- Browser: Chrome (preferred over Edge)
- IDE: VS Code
- Common paths: Desktop={home_dir}/Desktop, Downloads={home_dir}/Downloads

CRITICAL RULES:
1. Respond with ONLY valid JSON — no markdown fences, no extra text whatsoever.
2. Extract numeric values and names accurately. Ensure JSON keys and values are properly escaped.
3. For app names use lowercase. CRITICAL: If the user requests a specific app/browser (e.g. 'brave', 'edge'), use that exact name. Do NOT default to 'chrome'.
4. For file paths use forward slashes or escaped backslashes.
5. CRITICAL: If the user asks to type or do something in a specific app, your VERY FIRST action MUST be to `open_app` or `switch_window` (except for actions with dedicated commands like `send_whatsapp`). Do NOT use `type_text` blindly!
6. For coordinate actions, ensure x is between 0-{screen_w - 1} and y is between 0-{screen_h - 1}.
7. CRITICAL: Do NOT autocorrect or modify URLs, paths, or names. Copy them EXACTLY as typed by the user.
8. CRITICAL: If asked to open a website in a SPECIFIC browser, use "open_app" AND include the "url" field (e.g., {{"action":"open_app", "value":"brave", "url":"https://google.com"}}).
9. If you are unsure what to do, or if the request is ambiguous, use the "reply" action to ask for clarification. DO NOT guess destructive actions.
10. Failure recovery: If an app is not found, try variations of its name. Prefer the least destructive action.
    11. No Auto-Tool Generation: Do NOT hallucinate shell commands (run_command/run_powershell) for unsupported actions. Instead, hallucinate a fake action name (e.g., {{"action": "turn_off_wifi"}}) so the system can log it for future implementation. CRITICAL: Do NOT hallucinate fake actions for things that ALREADY exist (e.g., set_reminder, search_web, get_weather, set_volume, send_whatsapp — these are all real actions). Use the real action when the user's intent matches an existing tool.
12. CRITICAL: If the user asks to open an app AND perform a task that has a dedicated action (e.g., "open whatsapp and send message..."), use the dedicated action (e.g., "send_whatsapp") directly because it handles opening the app automatically. DO NOT fallback to a plain "open_app" action.

AVAILABLE ACTIONS (pick exactly one):

=== APP / WINDOW ===
{{"action":"open_app","value":"notepad"}}                       - open an application
{{"action":"open_app","value":"brave","url":"https://..."}}      - open browser at URL
{{"action":"close_app","value":"notepad"}}                        - close application by name
{{"action":"switch_window","value":"Chrome"}}                     - focus window by title substring
{{"action":"maximize_window","value":"Notepad"}}                  - maximize window
{{"action":"minimize_window","value":"Notepad"}}                  - minimize window
{{"action":"get_active_window"}}                                  - get title of focused window
{{"action":"focus_window","value":"Calculator"}}                  - bring window to foreground
{{"action":"open_url","value":"https://youtube.com"}}             - open URL in default browser

=== KEYBOARD / MOUSE ===
{{"action":"type_text","value":"Hello World"}}                    - type text at current cursor
{{"action":"press_keys","value":"ctrl+s"}}                        - press keyboard shortcut
{{"action":"click_element","value":"Submit"}}                     - click UI element by name (optional "depth":N, default 5)
{{"action":"click_at","x":500,"y":300}}                           - click at screen coordinates (max {screen_w - 1}×{screen_h - 1})
{{"action":"right_click","x":500,"y":300}}                        - right-click at coordinates
{{"action":"double_click","x":500,"y":300}}                       - double-click at coordinates
{{"action":"scroll","direction":"down","amount":5}}               - scroll (up/down, amount 1-10)
{{"action":"move_mouse","x":500,"y":300}}                         - move mouse to coordinates
{{"action":"drag","from_x":100,"from_y":100,"to_x":400,"to_y":400}} - drag from→to

=== SCREEN / MEDIA ===
{{"action":"screenshot","path":"~/Desktop/shot.png"}} - save screenshot
{{"action":"get_active_window"}}                                  - query focused window title

=== FILES / FOLDERS ===
{{"action":"create_file","path":"test.txt","content":"Hello"}}    - create file with content
{{"action":"read_file","path":"test.txt"}}                        - read and return file content
{{"action":"delete_file","path":"test.txt"}}                      - delete a file
{{"action":"copy_file","src":"a.txt","dst":"b.txt"}}              - copy file
{{"action":"move_file","src":"a.txt","dst":"b.txt"}}              - move/rename file
{{"action":"rename_file","path":"a.txt","new_name":"b.txt"}}      - rename file
{{"action":"create_folder","path":"MyFolder"}}                    - create directory
{{"action":"delete_folder","path":"MyFolder"}}                    - delete directory tree
{{"action":"list_files","path":"~/Desktop"}}                      - list files in directory
{{"action":"zip_files","files":["a.txt","b.txt"],"output":"out.zip"}} - compress files
{{"action":"download_file","url":"https://...","path":"file.zip"}} - download a file

=== SYSTEM ===
{{"action":"empty_recycle_bin"}}                                 - empty the recycle bin
{{"action":"turn_off_wifi"}}                                     - turn off Wi-Fi
{{"action":"run_command","value":"ipconfig /all"}}               - run shell/cmd command
{{"action":"run_powershell","value":"Get-Process"}}              - run PowerShell command
{{"action":"get_system_info"}}                                   - CPU/RAM/disk info
{{"action":"set_volume","value":70}}                             - set master volume 0-100
{{"action":"get_clipboard"}}                                     - get clipboard text
{{"action":"set_clipboard","value":"some text"}}                 - put text in clipboard
{{"action":"paste_text"}}                                        - paste clipboard content (Ctrl+V)

=== WEB / SEARCH ===
{{"action":"search_web","value":"python tutorial"}}              - Google search

=== MESSAGING ===
{{"action":"send_whatsapp","contact":"John","message":"Hello"}}  - send WhatsApp message

=== WEATHER ===
{{"action":"get_weather","city":"New York"}}                     - get current weather

=== REMINDER ===
{{"action":"set_reminder","message":"Call mom","seconds":300}}   - set a timed reminder

=== VOICE / CHAT ===
{{"action":"say","value":"Task complete"}}                       - speak text via TTS
{{"action":"reply","value":"I am an AI automation agent"}}       - answer conversational question

=== MACROS ===
{{"action":"create_macro","name":"morning routine","steps":["open notepad","open paint"]}} - create a new macro/skill from scratch with specified steps
{{"action":"edit_macro","name":"coding environment","instruction":"add 'open vscode' to it"}} - edit an existing macro/skill using natural language instructions


EXAMPLES (30 pairs — cover every action category):
User: "Open notepad"
{{"action": "open_app", "value": "notepad"}}

User: "open chrome at youtube.com"
{{"action": "open_app", "value": "chrome", "url": "https://youtube.com"}}

User: "open my project"
{{"action": "open_app", "value": "code", "url": "{home_dir}/Documents/Project"}}

User: "open my calculator"
{{"action": "open_app", "value": "calculator"}}

User: "switch to chrome"
{{"action": "switch_window", "value": "Chrome"}}

User: "minimize this window"
{{"action": "minimize_window", "value": "Notepad"}}

User: "maximize notepad"
{{"action": "maximize_window", "value": "Notepad"}}

User: "what is the active window"
{{"action": "get_active_window"}}

User: "Type 'hello world'"
{{"action": "type_text", "value": "hello world"}}

User: "copy this"
{{"action": "press_keys", "value": "ctrl+c"}}

User: "paste here"
{{"action": "paste_text"}}

User: "click the submit button"
{{"action": "click_element", "value": "Submit"}}

User: "click at 500 300"
{{"action": "click_at", "x": 500, "y": 300}}

User: "scroll down a bit"
{{"action": "scroll", "direction": "down", "amount": 3}}

User: "take a screenshot"
{{"action": "screenshot", "path": "{home_dir}/Desktop/shot.png"}}

User: "create a file called notes.txt with content hello world"
{{"action": "create_file", "path": "notes.txt", "content": "hello world"}}

User: "list files on my desktop"
{{"action": "list_files", "path": "~/Desktop"}}

User: "read file C:/test.txt"
{{"action": "read_file", "path": "C:/test.txt"}}

User: "delete file old.txt"
{{"action": "delete_file", "path": "old.txt"}}

User: "run ipconfig"
{{"action": "run_command", "value": "ipconfig /all"}}

User: "get system info"
{{"action": "get_system_info"}}

User: "set volume to 50"
{{"action": "set_volume", "value": 50}}

User: "volume up a bit"
{{"action": "set_volume", "value": 65}}

User: "what's on my clipboard"
{{"action": "get_clipboard"}}

User: "copy hello to clipboard"
{{"action": "set_clipboard", "value": "hello"}}

User: "What's the weather in Tokyo?"
{{"action": "get_weather", "city": "Tokyo"}}

User: "search Google for python tutorials"
{{"action": "search_web", "value": "python tutorials"}}

User: "set a reminder to drink water in 5 minutes"
{{"action": "set_reminder", "message": "drink water", "seconds": 300}}

User: "send hi to mom"
{{"action": "send_whatsapp", "contact": "mom", "message": "hi"}}

User: "make a macro named coding enviroment: open brave, open whatsapp, play playlist"
{{"action": "create_macro", "name": "coding enviroment", "steps": ["open brave", "open whatsapp", "play playlist"]}}

User: "add open notepad to the morning routine macro"
{{"action": "edit_macro", "name": "morning routine", "instruction": "add open notepad"}}

User: "close this"
{{"action": "reply", "value": "Which window or application would you like me to close?"}}

RESPOND WITH ONLY THE JSON OBJECT."""


# ──────────────────────────────────────────────────────────────
# LLM PROVIDERS
# ──────────────────────────────────────────────────────────────
def _parse_json(text: str) -> dict:
    """Strip markdown fences and parse JSON safely."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
        raise


def ask_ollama(command: str, history: list = None) -> dict:
    """Local Ollama — primary provider, runs gemma4:e4b entirely offline."""
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "gemma4:e4b")
    resp = requests.post(
        f"{base_url}/v1/chat/completions",
        json={
            "model": model,
            "messages": [{"role": "user", "content": build_prompt(command, history)}],
            "temperature": 0,
            "response_format": {"type": "json_object"}
        },
        timeout=60,
    )
    resp.raise_for_status()
    return _parse_json(resp.json()["choices"][0]["message"]["content"])


def ask_ollama_cloud(command: str, history: list = None) -> dict:
    """Ollama Cloud — proxies through local client to the datacenter."""
    base_url = os.getenv("OLLAMA_CLOUD_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_CLOUD_MODEL", "gemma4:31b-cloud")
    resp = requests.post(
        f"{base_url}/v1/chat/completions",
        json={
            "model": model,
            "messages": [{"role": "user", "content": build_prompt(command, history)}],
            "temperature": 0,
            "response_format": {"type": "json_object"}
        },
        timeout=60,
    )
    resp.raise_for_status()
    return _parse_json(resp.json()["choices"][0]["message"]["content"])


def ask_github(command: str, history: list = None) -> dict:
    """GitHub Models (gpt-4o-mini) — last resort cloud fallback."""
    resp = requests.post(
        "https://models.inference.ai.azure.com/chat/completions",
        headers={"Authorization": f"Bearer {KEYS['github']}"},
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": build_prompt(command, history)}],
            "temperature": 0,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return _parse_json(resp.json()["choices"][0]["message"]["content"])


# ──────────────────────────────────────────────────────────────
# FALLBACK CHAIN
# ──────────────────────────────────────────────────────────────
PROVIDERS = [
    ("Ollama (Local)",  ask_ollama),
    ("Ollama (Cloud)",  ask_ollama_cloud),
    ("GitHub",          ask_github),
]

# Set to a provider name to pin to that provider, or None for auto fallback
SELECTED_PROVIDER: str = None


# ──────────────────────────────────────────────────────────────
# TONE PREAMBLES  (used by conversational reply)
# ──────────────────────────────────────────────────────────────
TONE_PREAMBLES = {
    "professional": "Respond in a professional, clear, and concise manner. Be respectful and precise.",
    "sarcastic":    "You have a dry, sarcastic wit. You get things done but can't help making playful, slightly sarcastic remarks. Keep it fun, never mean.",
    "corny":        "You love puns and cheesy jokes. Every reply has at least one groan-worthy pun. You're enthusiastic and dorky!",
    "simple":       "Use extremely simple language. Short sentences. No jargon. Explain like a 10-year-old.",
    "custom":       "",  # filled at runtime from profile
}


def _build_conversational_prompt(user_message: str, history: list = None) -> str:
    """Build a free-form conversational prompt that respects the user's tone preference."""
    try:
        import backend.memory as _mem
        profile = _mem.get_profile()
    except Exception:
        profile = {}

    import os
    username     = os.getenv("USERNAME", "User")
    user_name    = profile.get("name", "") or username
    user_role    = profile.get("role", "")
    interests    = profile.get("interests", "")
    agent_name   = profile.get("agent_name", "JARVIS") or "JARVIS"
    tone         = profile.get("tone", "professional")
    custom_tone  = profile.get("custom_tone_prompt", "")

    tone_text = TONE_PREAMBLES.get(tone, TONE_PREAMBLES["professional"])
    if tone == "custom":
        tone_text = custom_tone or "Respond helpfully."

    identity_parts = []
    if user_role:   identity_parts.append(f"a {user_role}")
    if interests:   identity_parts.append(f"interested in {interests}")
    identity_str = f"{user_name}" + (f" ({', '.join(identity_parts)})" if identity_parts else "")

    history_str = ""
    if history:
        history_str = "RECENT CONTEXT:\n" + "\n".join(history[-6:]) + "\n\n"

    return f"""You are {agent_name}, an intelligent, conversational Windows automation assistant.
{tone_text}
You are talking to {identity_str}. Be warm, direct, and on-brand with your tone.
Do NOT output JSON. Just reply naturally in 1-3 sentences.

{history_str}User: {user_message}
{agent_name}:"""


def conversational_reply(user_message: str, history: list = None) -> str:
    """Fire a pure conversational LLM call — returns a plain text reply string."""
    raw_prompt = "__RAW_PROMPT__:" + _build_conversational_prompt(user_message, history)

    if SELECTED_PROVIDER and SELECTED_PROVIDER != "Auto (Fallback)":
        chain = [(n, fn) for n, fn in PROVIDERS if n == SELECTED_PROVIDER]
        if not chain:
            chain = PROVIDERS
    else:
        chain = PROVIDERS

    for name, func in chain:
        try:
            result = func(raw_prompt)
            # The LLM might still return JSON — try to extract a human reply
            if isinstance(result, dict):
                return result.get("value", result.get("reply", str(result)))
            return str(result)
        except Exception as e:
            log.debug("conversational_reply: provider %s failed: %s", name, e)
            import time as _t; _t.sleep(0.3)
            continue
    return "I'm here. What do you need?"


def ask_llm(command: str, history: list = None) -> dict:
    """Tries providers in sequence until one succeeds.
    If SELECTED_PROVIDER is set, only that provider is tried (no fallback).
    """
    print("  [LLM] Routing command through LLM matrix...")

    # Build the list to iterate — pinned or full chain
    if SELECTED_PROVIDER and SELECTED_PROVIDER != "Auto (Fallback)":
        chain = [(name, fn) for name, fn in PROVIDERS if name == SELECTED_PROVIDER]
        if not chain:
            print(f"  [LLM] Unknown provider '{SELECTED_PROVIDER}', falling back to chain.")
            chain = PROVIDERS
    else:
        chain = PROVIDERS

    for name, func in chain:
        try:
            print(f"  [LLM] Trying {name}... ", end="", flush=True)
            action = func(command, history)
            print(f"[+] Got action: {action}")
            return action
        except Exception as e:
            print(f"[-] Failed ({type(e).__name__}: {e})")
            import time
            time.sleep(0.4)
            continue

    print("  [LLM] All providers failed.")
    return None



# ──────────────────────────────────────────────────────────────
# INTENT CLASSIFIER  — pre-step that labels the user command
# ──────────────────────────────────────────────────────────────
INTENT_LABELS = ("SINGLE_ACTION", "MULTI_STEP", "QUESTION", "UNSAFE")

def _build_intent_prompt(command: str, history: list = None) -> str:
    history_str = ""
    if history:
        history_str = "RECENT CONTEXT:\n" + "\n".join(history[-4:]) + "\n\n"

    return f"""You are an intent classifier for a Windows automation agent.
Classify the user's command into exactly ONE of these labels:

SINGLE_ACTION  - A single, atomic desktop action (open app, set volume, take screenshot, read file, get weather, send message, etc.)
MULTI_STEP     - Requires 2+ sequential actions with results feeding into later steps (e.g., "research X and email me", "find files and zip them", "search for jobs and send summary")
QUESTION       - A conversational question or request for information the agent can answer without executing OS actions (e.g., "what can you do?", "how are you?", "what is Python?")
UNSAFE         - The command requests dangerous, destructive, or harmful operations (format drive, delete system32, mass file deletion without path, registry wipes, etc.)

{history_str}Command: "{command}"

Respond with ONLY a JSON object with these fields:
{{"intent": "<LABEL>", "reason": "<one sentence>", "steps_hint": ["step1", "step2", ...] }}

For SINGLE_ACTION or QUESTION or UNSAFE, steps_hint should be an empty array [].
For MULTI_STEP, steps_hint must list 2-8 plain-English steps the agent should take in order.

RESPOND WITH ONLY THE JSON OBJECT."""


def classify_intent(command: str, history: list = None) -> dict:
    """Classify a user command before routing it.

    Returns a dict with keys: intent, reason, steps_hint.
    Falls back to SINGLE_ACTION on any error so the normal flow continues.
    """
    raw_prompt = "__RAW_PROMPT__:" + _build_intent_prompt(command, history)

    if SELECTED_PROVIDER and SELECTED_PROVIDER != "Auto (Fallback)":
        chain = [(n, fn) for n, fn in PROVIDERS if n == SELECTED_PROVIDER]
        if not chain:
            chain = PROVIDERS
    else:
        chain = PROVIDERS

    for name, func in chain:
        try:
            result = func(raw_prompt)
            if isinstance(result, dict) and "intent" in result:
                label = result.get("intent", "SINGLE_ACTION").upper()
                if label not in INTENT_LABELS:
                    label = "SINGLE_ACTION"
                result["intent"] = label
                return result
        except Exception as e:
            log.debug("classify_intent: provider %s failed: %s", name, e)
            continue

    return {"intent": "SINGLE_ACTION", "reason": "classifier unavailable", "steps_hint": []}


# ──────────────────────────────────────────────────────────────
# REACT LOOP  — Reason + Act iterative multi-step engine
# ──────────────────────────────────────────────────────────────

def _build_react_step_prompt(
    original_goal: str,
    steps_done: list[dict],
    step_index: int,
    max_steps: int,
    history: list = None,
) -> str:
    """Build the prompt for a single ReAct step.

    Injects the original goal, what has been done so far, and asks the LLM
    whether to act next or declare the goal complete.
    """
    # Load persona details (same as build_prompt)
    try:
        import backend.memory as _mem
        _profile = _mem.get_profile()
    except Exception:
        _profile = {}

    _agent_name = _profile.get("agent_name", "JARVIS") or "JARVIS"
    screen_w, screen_h = _get_screen_size()
    import os as _os
    home_dir = _os.path.expanduser("~").replace("\\", "/")

    # Format completed steps
    done_str = ""
    if steps_done:
        done_str = "STEPS COMPLETED SO FAR:\n"
        for i, s in enumerate(steps_done, 1):
            done_str += f"  Step {i}: Action={s.get('action')} → Result: {s.get('result', '')}\n"
        done_str += "\n"

    remaining = max_steps - step_index
    history_str = ""
    if history:
        history_str = "SESSION CONTEXT:\n" + "\n".join(history[-4:]) + "\n\n"

    # Reuse the full action catalogue from build_prompt but abbreviated here
    return f"""You are {_agent_name}, a Windows automation agent executing a multi-step plan.

ORIGINAL USER GOAL: "{original_goal}"
CURRENT STEP: {step_index + 1} of up to {max_steps} (steps remaining budget: {remaining})

{history_str}{done_str}ENVIRONMENT:
- OS: Windows, Screen: {screen_w}×{screen_h}
- Common paths: Desktop={home_dir}/Desktop, Downloads={home_dir}/Downloads

Decide the NEXT action needed to make progress toward the goal, or declare completion.

CRITICAL RULES:
1. Respond with ONLY valid JSON — no markdown fences, no extra text.
2. If the goal is fully achieved based on steps done, respond: {{"action":"done","value":"<summary of what was accomplished>"}}
3. If you need more information before proceeding, respond: {{"action":"reply","value":"<question>"}}
4. Pick ONE atomic action from the available list below.
5. Use previous step results as context — reference file paths, URLs, or data from earlier results.
6. CRITICAL: If you are unsure what to do, use "reply" to ask for clarification. Do NOT guess destructive actions.

AVAILABLE ACTIONS (same as normal agent):
{{"action":"open_app","value":"chrome","url":"https://..."}}
{{"action":"open_url","value":"https://..."}}
{{"action":"search_web","value":"query"}}
{{"action":"run_powershell","value":"command"}}
{{"action":"run_command","value":"cmd"}}
{{"action":"get_system_info"}}
{{"action":"screenshot","path":"{home_dir}/Desktop/shot.png"}}
{{"action":"read_file","path":"..."}}
{{"action":"create_file","path":"...","content":"..."}}
{{"action":"list_files","path":"..."}}
{{"action":"type_text","value":"..."}}
{{"action":"press_keys","value":"ctrl+c"}}
{{"action":"click_element","value":"..."}}
{{"action":"get_clipboard"}}
{{"action":"set_clipboard","value":"..."}}
{{"action":"send_whatsapp","contact":"...","message":"..."}}
{{"action":"get_weather","city":"..."}}
{{"action":"set_volume","value":70}}
{{"action":"say","value":"..."}}
{{"action":"reply","value":"..."}}
{{"action":"done","value":"<completion summary>"}}

RESPOND WITH ONLY THE JSON OBJECT."""


def run_react_loop(
    goal: str,
    steps_hint: list[str] = None,
    max_steps: int = 10,
    history: list = None,
    step_callback=None,
) -> dict:
    """Execute a multi-step ReAct (Reason + Act) loop for a complex goal.

    Args:
        goal: The original natural-language user goal.
        steps_hint: Optional list of pre-planned step descriptions from the classifier.
        max_steps: Hard cap on iterations to prevent infinite loops (default 10).
        history: Conversation history from ConversationMemory.
        step_callback: Optional callable(step_index, action_dict, result_str) called
                       after each step for real-time UI streaming.

    Returns:
        dict with keys:
            completed  (bool)  — True if "done" action was reached
            steps      (list)  — list of {action, result} dicts
            summary    (str)   — final summary from the "done" action or last result
            aborted    (bool)  — True if emergency-stopped or max_steps hit
    """
    import backend.safety as safety

    steps_done: list[dict] = []
    summary = ""
    completed = False
    aborted = False

    print(f"  [ReAct] Starting loop for goal: {goal!r} (max_steps={max_steps})")
    if steps_hint:
        print(f"  [ReAct] Planner hints: {steps_hint}")

    for step_index in range(max_steps):
        # Emergency stop check
        if safety.is_emergency_stopped():
            print("  [ReAct] Emergency stop triggered — aborting loop.")
            aborted = True
            summary = "Aborted: Emergency Stop was activated."
            break

        # Build context-enriched prompt for this step
        raw_prompt = "__RAW_PROMPT__:" + _build_react_step_prompt(
            original_goal=goal,
            steps_done=steps_done,
            step_index=step_index,
            max_steps=max_steps,
            history=history,
        )

        # Ask LLM for next action
        print(f"  [ReAct] Step {step_index + 1}: asking LLM for next action...")
        action_dict = None

        if SELECTED_PROVIDER and SELECTED_PROVIDER != "Auto (Fallback)":
            chain = [(n, fn) for n, fn in PROVIDERS if n == SELECTED_PROVIDER]
            if not chain:
                chain = PROVIDERS
        else:
            chain = PROVIDERS

        for provider_name, func in chain:
            try:
                action_dict = func(raw_prompt)
                print(f"  [ReAct] Step {step_index + 1} action: {action_dict}")
                break
            except Exception as e:
                log.debug("run_react_loop: provider %s failed at step %d: %s", provider_name, step_index, e)
                import time as _t
                _t.sleep(0.3)
                continue

        if not action_dict:
            print(f"  [ReAct] Step {step_index + 1}: all providers failed — aborting.")
            aborted = True
            summary = "Aborted: LLM providers unavailable during multi-step execution."
            break

        action_name = action_dict.get("action", "")

        # Terminal condition: goal achieved
        if action_name == "done":
            summary = action_dict.get("value", "Goal completed.")
            completed = True
            print(f"  [ReAct] DONE at step {step_index + 1}: {summary}")
            if step_callback:
                step_callback(step_index, action_dict, summary)
            break

        # Execute the action
        result_str = execute(action_dict, goal)
        print(f"  [ReAct] Step {step_index + 1} result: {result_str[:200]}")

        # Record this step
        step_record = {
            "step": step_index + 1,
            "action": action_name,
            "action_dict": action_dict,
            "result": result_str,
        }
        steps_done.append(step_record)

        # Notify UI (for real-time streaming)
        if step_callback:
            step_callback(step_index, action_dict, result_str)

        # If a conversational reply or error was returned, stop looping
        if action_name == "reply":
            summary = result_str
            completed = True
            break

        # Guard: if result is an error on the very first step, abort early
        if step_index == 0 and result_str.lower().startswith("error:"):
            summary = f"Aborted early: {result_str}"
            aborted = True
            break

    else:
        # Exhausted max_steps
        print(f"  [ReAct] Max steps ({max_steps}) reached without completion.")
        aborted = True
        summary = f"Reached maximum of {max_steps} steps. Task may be partially complete."
        if steps_done:
            summary += f" Last result: {steps_done[-1]['result']}"

    return {
        "completed": completed,
        "aborted": aborted,
        "steps": steps_done,
        "summary": summary,
    }


def edit_macro_steps_via_llm(name: str, steps: list[str], instruction: str) -> list[str]:
    """Uses the active LLM provider to modify a macro's steps based on natural language instructions.
    
    Returns the updated list of step strings.
    """
    import json
    raw_prompt = f"""You are a precise JSON list editor. Your task is to modify a given JSON list of command strings based on a plain English instruction.

CURRENT MACRO STEPS:
{json.dumps(steps, indent=2)}

EDIT INSTRUCTION:
"{instruction}"

CRITICAL RULES:
1. Respond with ONLY a valid JSON array of strings representing the modified steps. Do NOT include markdown fences, HTML, or any explanations.
2. The elements of the array must be the updated commands.
3. Keep the commands clean and actionable (e.g. "open notepad", "type hello").
4. If the instruction is to delete or clear the entire macro, return an empty array `[]`.
5. If the instruction does not make sense or doesn't describe any changes, return the original list.

RESPOND WITH ONLY THE JSON ARRAY."""

    if SELECTED_PROVIDER and SELECTED_PROVIDER != "Auto (Fallback)":
        chain = [(n, fn) for n, fn in PROVIDERS if n == SELECTED_PROVIDER]
        if not chain:
            chain = PROVIDERS
    else:
        chain = PROVIDERS

    for provider_name, func in chain:
        try:
            print(f"  [LLM] Editing macro steps with {provider_name}... ")
            res = func("__RAW_PROMPT__:" + raw_prompt)
            print(f"[+] Got edit result: {res}")
            if isinstance(res, list):
                return [str(item) for item in res]
            elif isinstance(res, dict) and "steps" in res:
                return [str(item) for item in res["steps"]]
            elif isinstance(res, str):
                parsed = json.loads(res.strip())
                if isinstance(parsed, list):
                    return [str(item) for item in parsed]
        except Exception as e:
            print(f"[-] Failed ({type(e).__name__}: {e})")
            import time
            time.sleep(0.4)
            continue

    print("  [LLM] All macro edit providers failed.")
    return steps



# ──────────────────────────────────────────────────────────────
# ACTION EXECUTOR  — v2.0 (all new actions added)
# ──────────────────────────────────────────────────────────────

def _get_screen_size() -> tuple[int, int]:
    """Return (width, height) of the primary screen at runtime."""
    try:
        return pyautogui.size()
    except Exception:
        return (1920, 1080)  # safe default


def _safe_coords(action: dict, xk="x", yk="y", default_x=500, default_y=300):
    """Return (x, y) clamped to the actual screen bounds (Fix #5)."""
    screen_w, screen_h = _get_screen_size()
    x = max(5, min(int(action.get(xk, default_x)), screen_w - 1))
    y = max(5, min(int(action.get(yk, default_y)), screen_h - 1))
    return x, y


# ── Subprocess Tracking Patch for Emergency Stop ──────────────────────────────
import subprocess
_orig_popen = subprocess.Popen

class TrackedPopen(_orig_popen):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        import backend.safety as safety
        safety.track_process(self)
        
    def wait(self, timeout=None):
        try:
            return super().wait(timeout)
        finally:
            import backend.safety as safety
            safety.untrack_process(self)
            
    def poll(self):
        res = super().poll()
        if res is not None:
            import backend.safety as safety
            safety.untrack_process(self)
        return res

subprocess.Popen = TrackedPopen


def execute(action: dict, command: str = "") -> str:
    """
    Wrapper for action execution. Integrates dangerous action blocklists,
    sandbox dry-runs, SQLite interaction logging, and daily log files.
    """
    import backend.safety as safety
    import backend.memory as memory
    
    if safety.is_emergency_stopped():
        return "Error: Command aborted due to Emergency Stop."
        
    # Destructive actions guard (require confirmation flag unless in sandbox)
    if action.get("action") in ("delete_file", "delete_folder") and not action.get("confirmed"):
        if not safety.is_sandbox_active():
            abort_msg = f"Error: Action Aborted. Destructive action '{action.get('action')}' requires explicit confirmation."
            safety.log_action(command, action, abort_msg)
            return abort_msg
        
    # 1. Blocklist check
    is_blocked, block_reason = safety.is_dangerous(action)
    if is_blocked:
        safety.log_action(command, action, block_reason)
        return block_reason
        
    # 2. Sandbox dry-run check
    if safety.is_sandbox_active():
        val_str = f" with value: {action.get('value')}" if "value" in action else ""
        dry_run_msg = f"[SANDBOX DRY-RUN] Would execute: {action.get('action')}{val_str}"
        safety.log_action(command, action, dry_run_msg)
        return dry_run_msg
        
    # 3. Record interaction in persistent SQLite memory
    if command:
        try:
            memory.record_interaction(command, action)
        except Exception:
            pass
            
    # Run actual action
    result = _execute_core(action)
    
    # Log missing tool automatically if the result is an unknown action
    if result.startswith("Unknown action:"):
        try:
            log_missing_tool(action.get('action', '?'), command)
        except Exception as e:
            print(f"Error logging missing tool: {e}")

    # 4. Log results to daily file
    try:
        safety.log_action(command, action, result)
    except Exception:
        pass
        
    return result



def _execute_core(action: dict) -> str:
    """
    Execute an action dict and return a human-readable result string.
    Raises no exceptions — all errors are caught and returned as strings.
    """
    try:
        a = action.get("action", "")
        v = action.get("value", "")

        # ── Macros ───────────────────────────────────────────────────────────
        if a == "create_macro":
            name = action.get("name", "")
            steps = action.get("steps", [])
            if not name or not steps:
                return "Error: Missing macro name or steps list."
            if not isinstance(steps, list):
                return "Error: Steps must be a JSON array of strings."
                
            import backend.memory as memory
            existing = memory.get_macro(name)
            verb = "overwritten" if existing else "created"
            
            try:
                memory.save_macro(name, steps)
            except Exception as e:
                return f"Error: Failed to save macro '{name}': {e}"
            try:
                import backend.hooks as hooks
                hooks.trigger_ui_refresh()
            except Exception:
                pass
            steps_display = "\n".join(f"  {i+1}. {c}" for i, c in enumerate(steps))
            return f"Successfully {verb} macro '{name}'. Steps:\n{steps_display}"

        elif a == "edit_macro":
            name = action.get("name", "")
            instruction = action.get("instruction", "")
            if not name or not instruction:
                return "Error: Missing macro name or instruction."
                
            import backend.memory as memory
            existing_steps = memory.get_macro(name)
            if not existing_steps:
                return f"Error: Macro '{name}' does not exist."
                
            try:
                new_steps = edit_macro_steps_via_llm(name, existing_steps, instruction)
                # Safety guard: only delete if LLM returned [] AND the instruction
                # explicitly requests deletion. Prevents LLM hallucination from
                # silently wiping macros.
                _delete_keywords = ("delete", "clear", "remove all", "wipe", "erase", "reset")
                _explicit_delete = any(kw in instruction.lower() for kw in _delete_keywords)
                if not new_steps:
                    if _explicit_delete:
                        memory.delete_macro(name)
                        try:
                            import backend.hooks as hooks
                            hooks.trigger_ui_refresh()
                        except Exception:
                            pass
                        return f"Macro '{name}' has been cleared and deleted."
                    else:
                        # LLM returned empty steps without a delete instruction —
                        # protect the macro and return an error instead.
                        return (f"Error: The edit returned no steps for macro '{name}'. "
                                "The macro was NOT deleted. Please try a more specific instruction.")
                else:
                    try:
                        memory.save_macro(name, new_steps)
                    except Exception as e:
                        return f"Error: Failed to save updated macro '{name}': {e}"
                    try:
                        import backend.hooks as hooks
                        hooks.trigger_ui_refresh()
                    except Exception:
                        pass
                    steps_display = "\n".join(f"  {i+1}. {c}" for i, c in enumerate(new_steps))
                    return f"Successfully updated macro '{name}'. Steps:\n{steps_display}"
            except Exception as e:
                return f"Error modifying macro: {e}"

        elif a == "list_macros":
            import backend.memory as memory
            all_macros = memory.list_macros()
            if not all_macros:
                return "No macros saved yet. Try saying 'save this as morning routine' after running tasks."
            display = []
            for name, steps in all_macros.items():
                steps_display = " ➔ ".join(steps)
                display.append(f"• {name}: {steps_display}")
            return "Saved macros:\n" + "\n".join(display)

        # ── App / Window ─────────────────────────────────────────────────────
        elif a == "open_app":
            app_path = _resolve_app_path(str(v))
            url = action.get("url", "")
            
            clean_path = app_path.strip('"')
            needs_search = False
            
            if app_path == v and not str(v).lower().endswith(".exe") and not str(v).startswith("start "):
                needs_search = True
            elif not app_path.startswith("start ") and not os.path.exists(clean_path) and shutil.which(clean_path) is None:
                needs_search = True

            if needs_search:
                # ── Windows Search fallback (Fix #3) ──────────────────────
                # Poll for the Start Menu / Search window instead of blind sleep
                try:
                    import win32gui
                    pyautogui.press("win")
                    # Wait for Start Menu / Search to become foreground (up to 3s)
                    search_ready = False
                    for _ in range(30):  # 30 × 0.1s = 3s
                        time.sleep(0.1)
                        try:
                            fg = win32gui.GetForegroundWindow()
                            cls_name = win32gui.GetClassName(fg)
                            # Start Menu class names across Windows versions
                            if cls_name in ("Windows.UI.Core.CoreWindow",
                                            "XamlExplorerHostIslandWindow",
                                            "SearchUI", "Cortana"):
                                search_ready = True
                                break
                        except Exception:
                            pass
                    if not search_ready:
                        time.sleep(0.5)  # last-resort grace period
                    pyautogui.write(str(v), interval=0.02)
                    time.sleep(0.8)
                    pyautogui.press("enter")
                except Exception as e:
                    return f"Windows Search fallback failed: {e}"
                return f"Opened via Windows Search: {v}"
            else:
                if app_path.startswith("start "):
                    subprocess.Popen(app_path + (f' "{url}"' if url else ""), shell=True)
                else:
                    if url:
                        subprocess.Popen([app_path.strip('"'), url])
                    else:
                        subprocess.Popen([app_path.strip('"')])
                return f"Opened: {v}" + (f" at {url}" if url else "")

        elif a == "close_app":
            app_name = APP_PATHS.get(str(v).lower(), v)
            if isinstance(app_name, list):
                app_name = os.path.basename(app_name[0])
            elif isinstance(app_name, str) and not app_name.startswith("start"):
                app_name = os.path.basename(app_name)
            os.system(f"taskkill /im {app_name} 2>nul || taskkill /f /im {app_name} 2>nul")
            return f"Closed: {v}"

        elif a == "open_url":
            url = str(v)
            if not url.startswith("http"):
                url = "https://" + url
            subprocess.Popen(f'start "" "{url}"', shell=True)
            return f"Opened URL: {url}"

        elif a == "switch_window":
            wins = gw.getWindowsWithTitle(str(v))
            if wins:
                wins[0].activate()
                return f"Switched to: {wins[0].title}"
            return f"Window not found: {v}"

        elif a == "maximize_window":
            wins = gw.getWindowsWithTitle(str(v))
            if wins:
                wins[0].maximize()
                return f"Maximized: {wins[0].title}"
            return f"Window not found: {v}"

        elif a == "minimize_window":
            wins = gw.getWindowsWithTitle(str(v))
            if wins:
                wins[0].minimize()
                return f"Minimized: {wins[0].title}"
            return f"Window not found: {v}"

        elif a == "get_active_window":
            import win32gui
            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            return f"Active window: {title}"

        elif a == "focus_window":
            wins = gw.getWindowsWithTitle(str(v))
            if wins:
                wins[0].activate()
                return f"Focused: {wins[0].title}"
            return f"Window not found: {v}"

        # ── Keyboard / Mouse ──────────────────────────────────────────────────
        elif a == "type_text":
            time.sleep(0.2)
            text_to_type = str(v)
            if "\n" in text_to_type or len(text_to_type) > 50:
                # Fast paste for multiline or long text
                import pyperclip
                pyperclip.copy(text_to_type)
                time.sleep(0.1)
                pyautogui.hotkey("ctrl", "v")
            else:
                pyautogui.write(text_to_type, interval=0.01)
            return f"Typed: {v[:50]}..."

        elif a == "press_keys":
            keys = [k.strip() for k in str(v).split("+")]
            pyautogui.hotkey(*keys)
            return f"Pressed: {v}"

        elif a == "click_element":
            # Fix #4 — configurable depth with progressive deepening
            requested_depth = int(action.get("depth", 5))
            try:
                # Progressive depth search: try requested, then deeper
                for depth in (requested_depth, 8, 15):
                    el = auto.Control(Name=str(v), depth=depth)
                    if el.Exists(2):
                        el.Click(simulateMove=False)
                        if depth > requested_depth:
                            log.info("Found '%s' at depth %d (initial depth %d was too shallow)",
                                     v, depth, requested_depth)
                        return f"Clicked element: {v}" + (f" (depth={depth})" if depth > requested_depth else "")
                    if depth > 8:
                        log.warning("Deep UI search (depth=%d) may be slow", depth)

                # Fallback: loose match on top-level children
                for ctrl in auto.GetRootControl().GetChildren():
                    if ctrl.Name and str(v).lower() in ctrl.Name.lower():
                        ctrl.Click(simulateMove=False)
                        return f"Clicked (loose match): {ctrl.Name}"
                return f"Element not found: {v}"
            except Exception as e:
                return f"Click element error: {e}"

        elif a == "click_at":
            x, y = _safe_coords(action)
            pyautogui.click(x, y)
            return f"Clicked at ({x}, {y})"

        elif a == "right_click":
            x, y = _safe_coords(action)
            pyautogui.rightClick(x, y)
            return f"Right-clicked at ({x}, {y})"

        elif a == "double_click":
            x, y = _safe_coords(action)
            pyautogui.doubleClick(x, y)
            return f"Double-clicked at ({x}, {y})"

        elif a == "scroll":
            direction = str(action.get("direction", "down")).lower()
            amount    = int(action.get("amount", 3))
            pyautogui.scroll(amount if direction == "up" else -amount)
            return f"Scrolled {direction} by {amount}"

        elif a == "move_mouse":
            x, y = _safe_coords(action)
            pyautogui.moveTo(x, y, duration=0.3)
            return f"Moved mouse to ({x}, {y})"

        elif a == "drag":
            # Fix #5 — dynamic screen bounds for drag
            screen_w, screen_h = _get_screen_size()
            x1 = max(5, min(int(action.get("from_x", 100)), screen_w - 1))
            y1 = max(5, min(int(action.get("from_y", 100)), screen_h - 1))
            x2 = max(5, min(int(action.get("to_x",   300)), screen_w - 1))
            y2 = max(5, min(int(action.get("to_y",   300)), screen_h - 1))
            pyautogui.moveTo(x1, y1, duration=0.2)
            pyautogui.drag(x2 - x1, y2 - y1, duration=0.4)
            return f"Dragged ({x1},{y1}) → ({x2},{y2})"

        elif a == "paste_text":
            pyautogui.hotkey("ctrl", "v")
            return "Pasted clipboard content"

        # ── Screen ────────────────────────────────────────────────────────────
        elif a == "screenshot":
            path = action.get("path") or str(v) or f"screenshot_{int(time.time())}.png"
            path = os.path.expandvars(os.path.expanduser(path))
            pyautogui.hotkey("alt","tab")
            pyautogui.screenshot(path)
            return f"Screenshot saved: {path}"

        # ── Files / Folders ───────────────────────────────────────────────────
        elif a == "create_file":
            path    = os.path.expandvars(os.path.expanduser(str(action.get("path", v))))
            content = action.get("content", "")
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            return f"Created file: {path}"

        elif a == "read_file":
            path = os.path.expandvars(os.path.expanduser(str(action.get("path", v))))
            if not os.path.exists(path):
                return f"File not found: {path}"
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read(4000)   # cap at 4K chars
            return f"Contents of {path}:\n{content}"

        elif a == "delete_file":
            path = os.path.expandvars(os.path.expanduser(str(action.get("path", v))))
            if os.path.exists(path):
                try:
                    import stat
                    os.chmod(path, stat.S_IWRITE)
                except Exception:
                    pass
                os.remove(path)
                return f"Deleted: {path}"
            return f"File not found: {path}"

        elif a == "copy_file":
            src = os.path.expandvars(os.path.expanduser(str(action.get("src", ""))))
            dst = os.path.expandvars(os.path.expanduser(str(action.get("dst", ""))))
            shutil.copy2(src, dst)
            return f"Copied {src} → {dst}"

        elif a == "move_file":
            src = os.path.expandvars(os.path.expanduser(str(action.get("src", ""))))
            dst = os.path.expandvars(os.path.expanduser(str(action.get("dst", ""))))
            shutil.move(src, dst)
            return f"Moved {src} → {dst}"

        elif a == "rename_file":
            path     = os.path.expandvars(os.path.expanduser(str(action.get("path", v))))
            new_name = str(action.get("new_name", ""))
            new_path = os.path.join(os.path.dirname(path), new_name)
            os.rename(path, new_path)
            return f"Renamed to: {new_path}"

        elif a == "create_folder":
            path = os.path.expandvars(os.path.expanduser(str(action.get("path", v))))
            os.makedirs(path, exist_ok=True)
            return f"Created folder: {path}"

        elif a == "delete_folder":
            path = os.path.expandvars(os.path.expanduser(str(action.get("path", v))))
            if os.path.isdir(path):
                import stat
                def remove_readonly(func, p, _):
                    try:
                        os.chmod(p, stat.S_IWRITE)
                        func(p)
                    except Exception:
                        pass
                try:
                    shutil.rmtree(path, onexc=remove_readonly)
                except TypeError:
                    shutil.rmtree(path, onerror=remove_readonly)
                return f"Deleted folder: {path}"
            return f"Folder not found: {path}"

        elif a == "list_files":
            path = os.path.expandvars(os.path.expanduser(str(action.get("path", v) or ".")))
            if not os.path.isdir(path):
                return f"Not a directory: {path}"
            entries = os.listdir(path)[:50]  # cap at 50
            lines = []
            for name in sorted(entries):
                full = os.path.join(path, name)
                tag  = "[DIR] " if os.path.isdir(full) else "[FILE]"
                lines.append(f"  {tag} {name}")
            return f"Contents of {path}:\n" + "\n".join(lines)

        elif a == "zip_files":
            files  = action.get("files", [])
            output = str(action.get("output", "archive.zip"))
            output = os.path.expandvars(os.path.expanduser(output))
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in files:
                    fp = os.path.expandvars(os.path.expanduser(str(f)))
                    if os.path.exists(fp):
                        zf.write(fp, os.path.basename(fp))
            return f"Zipped {len(files)} files → {output}"

        elif a == "download_file":
            url  = str(action.get("url", v))
            path = os.path.expandvars(os.path.expanduser(str(action.get("path", "download"))))
            resp = requests.get(url, stream=True, timeout=30)
            resp.raise_for_status()
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "wb") as f:
                for chunk in resp.iter_content(65536):
                    f.write(chunk)
            return f"Downloaded to: {path}"

        # ── System ────────────────────────────────────────────────────────────
        elif a == "empty_recycle_bin":
            import ctypes
            try:
                # SHERB_NOCONFIRMATION = 1, SHERB_NOPROGRESSUI = 2, SHERB_NOSOUND = 4 -> flags = 7
                result = ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, 7)
                if result == 0 or result == -2147418113:  # 0=Success, -2147418113=Already empty
                    return "Emptied Recycle Bin"
                return f"Failed to empty recycle bin (HRESULT {result})"
            except Exception as e:
                return f"Failed to empty recycle bin: {e}"

        elif a == "turn_off_wifi":
            result = __import__("subprocess").run(
                ["netsh", "wlan", "disconnect"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                return "Disconnected from current Wi-Fi network (soft disconnect)"
            return f"Failed to disconnect Wi-Fi: {result.stderr.strip()}"

        elif a == "run_command":
            result = subprocess.run(
                str(v), shell=True, capture_output=True,
                text=True, timeout=30, encoding="utf-8", errors="replace"
            )
            out = (result.stdout + result.stderr).strip()
            if not out:
                out = f"Command executed successfully (exit code {result.returncode})" if result.returncode == 0 else f"Command failed with exit code {result.returncode}"
            return f"Command output:\n{out[:2000]}"

        elif a == "run_powershell":
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", str(v)],
                capture_output=True, text=True, timeout=30,
                encoding="utf-8", errors="replace"
            )
            out = (result.stdout + result.stderr).strip()
            if not out:
                out = f"PowerShell command executed successfully (exit code {result.returncode})" if result.returncode == 0 else f"PowerShell command failed with exit code {result.returncode}"
            return f"PowerShell output:\n{out[:2000]}"

        elif a == "get_system_info":
            try:
                import psutil
                cpu   = psutil.cpu_percent(interval=1)
                ram   = psutil.virtual_memory()
                disk  = psutil.disk_usage("/")
                return (
                    f"CPU usage   : {cpu}%\n"
                    f"RAM used    : {ram.used // (1024**2)} MB / {ram.total // (1024**2)} MB ({ram.percent}%)\n"
                    f"Disk used   : {disk.used // (1024**3)} GB / {disk.total // (1024**3)} GB ({disk.percent}%)"
                )
            except ImportError:
                result = subprocess.run("systeminfo", shell=True, capture_output=True, text=True, timeout=15)
                return result.stdout[:1500]

        elif a == "set_volume":
            level = max(0, min(int(v), 100))

            # ── Layer 1: pycaw (unwrap AudioDevice wrapper if needed) ─────────
            try:
                from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
                from ctypes import cast, POINTER
                from comtypes import CLSCTX_ALL
                speakers = AudioUtilities.GetSpeakers()
                # Newer pycaw versions wrap IMMDevice in an AudioDevice object
                dev = getattr(speakers, "_dev", speakers)
                interface = dev.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
                vol_ctrl  = cast(interface, POINTER(IAudioEndpointVolume))
                vol_ctrl.SetMasterVolumeLevelScalar(level / 100.0, None)
                return f"Volume set to {level}%"
            except Exception as e1:
                log.debug("pycaw set_volume failed (%s), trying WinMM PowerShell", e1)

            # ── Layer 2: WinMM via PowerShell P/Invoke (no extra deps) ────────
            try:
                vol_word = int((level / 100.0) * 0xFFFF)
                vol_dword = vol_word | (vol_word << 16)
                ps_code = f"""
$code = '[DllImport("winmm.dll")] public static extern int waveOutSetVolume(IntPtr h, uint v);'
Add-Type -MemberDefinition $code -Name WinMM -Namespace WinAPI -ErrorAction Stop
[WinAPI.WinMM]::waveOutSetVolume([IntPtr]::Zero, {vol_dword})
"""
                r = subprocess.run(
                    ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_code],
                    capture_output=True, text=True, timeout=10,
                    encoding="utf-8", errors="replace",
                )
                if r.returncode == 0:
                    return f"Volume set to {level}% (WinMM)"
                log.debug("WinMM PS failed: %s", r.stderr.strip())
            except Exception as e2:
                log.debug("WinMM set_volume failed (%s), trying key-press fallback", e2)

            # ── Layer 3: pyautogui volume key-press approximation ──────────────
            try:
                import pyautogui as _pag
                # Mute first then press Vol-Up N times to reach approximate level
                _pag.press("volumemute")
                time.sleep(0.1)
                _pag.press("volumemute")   # unmute
                steps = max(0, min(int(level / 2), 50))  # each press ≈ 2%
                for _ in range(steps):
                    _pag.press("volumeup")
                    time.sleep(0.02)
                return f"Volume approximately set to {level}% (key-press fallback)"
            except Exception as e3:
                return f"Volume error — all methods failed. pycaw={e1} | WinMM={e2} | keys={e3}"

        elif a == "get_clipboard":
            try:
                import win32clipboard
                win32clipboard.OpenClipboard()
                data = win32clipboard.GetClipboardData()
                win32clipboard.CloseClipboard()
                return f"Clipboard: {data[:500]}"
            except Exception:
                result = subprocess.run(
                    'powershell -c "Get-Clipboard"',
                    shell=True, capture_output=True, text=True, timeout=5
                )
                return f"Clipboard: {result.stdout.strip()}"

        elif a == "set_clipboard":
            text = str(v)
            try:
                import win32clipboard
                win32clipboard.OpenClipboard()
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardText(text)
                win32clipboard.CloseClipboard()
                return f"Clipboard set to: {text[:100]}"
            except Exception:
                subprocess.run(
                    f'powershell -c "Set-Clipboard -Value \'{text}\'"',
                    shell=True, timeout=5
                )
                return f"Clipboard set to: {text[:100]}"

        # ── Web / Search ──────────────────────────────────────────────────────
        elif a == "search_web":
            query = urllib.parse.quote_plus(str(v))
            url   = f"https://www.google.com/search?q={query}"
            subprocess.Popen(f'start "" "{url}"', shell=True)
            return f"Searched Google: {v}"

        # ── Messaging ─────────────────────────────────────────────────────────
        elif a == "send_whatsapp":
            # Fix #2 — robust WhatsApp with window polling instead of fixed sleeps
            contact = str(action.get("contact", ""))
            message = str(action.get("message", ""))
            if contact and message:
                def _wait_for_whatsapp_window(timeout: float = 10.0) -> bool:
                    """Poll until a WhatsApp window is in the foreground."""
                    deadline = time.time() + timeout
                    while time.time() < deadline:
                        wins = gw.getWindowsWithTitle("WhatsApp")
                        if wins:
                            try:
                                wins[0].activate()
                                return True
                            except Exception:
                                pass
                        time.sleep(0.5)
                    return False

                if contact[0].isdigit() or contact.startswith("+"):
                    # Direct number link
                    safe_msg = urllib.parse.quote(message)
                    url = f"whatsapp://send?phone={contact}&text={safe_msg}"
                    os.system(f'start "" "{url}"')
                    if _wait_for_whatsapp_window(timeout=10):
                        time.sleep(0.5)  # brief settle
                        pyautogui.press("enter")
                        return f"Sent WhatsApp to {contact}"
                else:
                    # Named contact — pure keyboard automation (robust to UI tree name changes)
                    os.system('start whatsapp:')
                    if not _wait_for_whatsapp_window(timeout=10):
                        return "WhatsApp did not open in time"
                    time.sleep(1.5)  # Let WhatsApp fully render and settle

                    # 1. Open search
                    pyautogui.hotkey("ctrl", "f")
                    time.sleep(1.0)  # Wait for search box to focus

                    # Clear existing search text just in case
                    pyautogui.hotkey("ctrl", "a")
                    pyautogui.press("backspace")
                    
                    # 2. Type contact name
                    pyautogui.write(contact, interval=0.02)
                    time.sleep(5.0)  # Wait for search results to populate (increased for groups)

                    # 3. Select first result
                    # Pressing down arrow moves focus to the top search result
                    pyautogui.press("down")
                    time.sleep(0.5)
                    pyautogui.press("enter")
                    time.sleep(4.0)  # Wait for chat to open (groups can take significantly longer to load)

                    # 4. Type and send
                    pyautogui.write(message, interval=0.02)
                    time.sleep(0.3)
                    pyautogui.press("enter")

                    return f"Sent WhatsApp dynamically to contact: {contact}"
            return "Missing contact or message"

        # ── Weather ───────────────────────────────────────────────────────────
        elif a == "get_weather":
            city = str(action.get("city", v))
            api_key = KEYS.get("weather", "")
            if api_key:
                resp = requests.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={"q": city, "appid": api_key, "units": "metric"},
                    timeout=8
                )
                data = resp.json()
                temp  = data["main"]["temp"]
                feels = data["main"]["feels_like"]
                desc  = data["weather"][0]["description"]
                humid = data["main"]["humidity"]
                return f"Weather in {city}: {desc}, {temp}°C (feels like {feels}°C), humidity {humid}%"
            else:
                # Fallback: scrape wttr.in
                resp = requests.get(f"https://wttr.in/{urllib.parse.quote(city)}?format=3", timeout=8)
                return f"Weather: {resp.text.strip()}"

        # ── Reminder ──────────────────────────────────────────────────────────
        elif a == "set_reminder":
            message = str(action.get("message", v))
            seconds = int(action.get("seconds", 60))

            def _remind():
                time.sleep(seconds)
                speak(f"Reminder: {message}")

            t = threading.Thread(target=_remind, daemon=True)
            t.start()
            return f"Reminder set for {seconds}s: {message}"

        # ── Voice / Chat ──────────────────────────────────────────────────────
        elif a == "say":
            speak(str(v))
            return f"Said: {v}"

        elif a == "reply":
            # Fire a personality-aware conversational reply via the tone engine.
            # We use the original user command (stored in 'command' param) so the
            # LLM gets the real question, not the pre-parsed LLM value.
            try:
                from backend.windows_agent import conversational_reply as _conv_reply
                user_q = command if command else str(v)
                conversational_text = _conv_reply(user_q)
                # Only use if we got a meaningful non-JSON response
                if conversational_text and not conversational_text.strip().startswith("{"):
                    return conversational_text
            except Exception as _cr_err:
                log.debug("conversational_reply failed, falling back: %s", _cr_err)
            return f"Agent: {v}"

        else:
            return f"Unknown action: {a}"

    except Exception as e:
        import traceback
        return f"Error executing '{action.get('action','?')}': {type(e).__name__}: {e}\n{traceback.format_exc()}"


# ──────────────────────────────────────────────────────────────
# VOICE I/O
# ──────────────────────────────────────────────────────────────
try:
    tts_engine = pyttsx3.init()
    tts_engine.setProperty("rate", 175)
except Exception:
    tts_engine = None


def speak(text: str):
    print(f"  [AGENT] {text}")
    if tts_engine:
        try:
            tts_engine.say(text)
            tts_engine.runAndWait()
        except Exception:
            pass


def listen() -> str:
    print("  [VOICE] Listening...")
    sample_rate = 16000
    max_duration = 10
    silence_limit = 1.5  # stop after 1.5s of silence
    chunk_duration = 0.1 # 100ms chunks
    chunk_size = int(sample_rate * chunk_duration)
    silence_limit_chunks = int(silence_limit / chunk_duration)
    
    device_id = None
    env_device = os.getenv("STT_DEVICE_ID")
    if env_device and env_device.strip().isdigit():
        device_id = int(env_device.strip())
        
    audio_buffer = []
    has_spoken = False
    silent_chunks = 0
    threshold = 500  # Default fallback threshold
    
    try:
        with sd.InputStream(samplerate=sample_rate, channels=1, dtype='int16', device=device_id) as stream:
            for i in range(int(max_duration / chunk_duration)):
                chunk, _ = stream.read(chunk_size)
                audio_buffer.append(chunk)
                
                # Use max amplitude in the chunk as volume indicator
                volume = np.max(np.abs(chunk))
                
                # Adaptive threshold calibration based on first 0.5s of audio
                if i == 4:
                    avg_noise = np.mean([np.max(np.abs(c)) for c in audio_buffer[:5]])
                    threshold = max(400, avg_noise * 2.5)  # 2.5x ambient noise, min 400
                    
                if i >= 5:
                    if volume > threshold:
                        has_spoken = True
                        silent_chunks = 0
                    elif has_spoken:
                        silent_chunks += 1
                        
                    # Stop early if speech was detected followed by silence
                    if has_spoken and silent_chunks > silence_limit_chunks:
                        break

        audio_data = np.concatenate(audio_buffer, axis=0)
        
        wav_path = "temp_voice.wav"
        wav_write(wav_path, sample_rate, audio_data)
        
        r = sr.Recognizer()
        with sr.AudioFile(wav_path) as source:
            audio = r.record(source)
            
        try:
            os.remove(wav_path)
        except Exception:
            pass
            
        return r.recognize_google(audio)
    except sr.UnknownValueError:
        return ""
    except Exception as e:
        print(f"  [VOICE] Error: {e}")
        return ""


# ──────────────────────────────────────────────────────────────
# BATCH TESTING
# ──────────────────────────────────────────────────────────────
def log_missing_tool(action_requested: str, command: str):
    missing_tools_file = MISSING_TOOLS_PATH
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    logs = []
    if os.path.exists(missing_tools_file):
        try:
            with open(missing_tools_file, "r", encoding="utf-8") as f:
                logs = json.load(f)
        except Exception:
            pass
    found = False
    for log in logs:
        if log.get("action_requested") == action_requested:
            log["frequency"] = log.get("frequency", 1) + 1
            log["timestamp"] = now
            if command and command not in log.setdefault("commands", []):
                log["commands"].append(command)
            found = True
            break
    if not found:
        logs.append({
            "action_requested": action_requested,
            "timestamp": now,
            "frequency": 1,
            "commands": [command] if command else [],
            "suggested": False
        })
    with open(missing_tools_file, "w", encoding="utf-8") as f:
        json.dump(logs, f, indent=2)

def run_test_batch(filepath: str):
    print(f"\n[TEST] Loading prompts from {filepath}...")
    if not os.path.exists(filepath):
        print(f"  ✗ File not found: {filepath}")
        return
    with open(filepath, "r") as f:
        prompts = [line.strip() for line in f if line.strip()]
    print(f"  ✓ Loaded {len(prompts)} prompts\n")
    passed = failed = 0
    for i, command in enumerate(prompts, 1):
        print(f"[{i}/{len(prompts)}] Testing: {command}")
        global_memory.add_user(command)
        try:
            action = ask_llm(command, global_memory.get_history())
            if action:
                global_memory.add_agent(action)
                print(f"  ✓ Got action: {action['action']}")
                result = execute(action, command)
                print(f"  ↳ {result}")
                with open(EXECUTION_LOG_PATH, "a", encoding="utf-8") as _f:
                    _f.write(json.dumps({"command": command, "action_taken": action, "correct": None, "correct_action": None}) + "\n")
                passed += 1
                time.sleep(0.5)
            else:
                print("  ✗ LLM returned None")
                failed += 1
        except Exception as e:
            print(f"  ✗ Error: {e}")
            failed += 1
        print()
    print("=" * 50)
    print(f"  [TEST RESULTS] Passed: {passed}/{len(prompts)} | Failed: {failed}")
    print("=" * 50)


# ──────────────────────────────────────────────────────────────
# FEEDBACK LOOP + PHASE B TOOL SUGGESTION
# ──────────────────────────────────────────────────────────────

def _prompt_feedback(command: str, action: dict, result: str) -> dict:
    """Ask user whether the action was correct and return feedback dict.

    Returns {"correct": bool, "correct_action": dict|None}.
    Skips feedback for 'reply' actions (conversational) and known-good results.
    """
    if action.get("action") == "reply":
        return {"correct": True, "correct_action": None}
    if result.startswith("Error"):
        return {"correct": False, "correct_action": None}

    try:
        print()
        fb = input("  [FEEDBACK] Was this correct? (y/n/q to skip): ").strip().lower()
        if fb == "q":
            return {"correct": None, "correct_action": None}
        if fb == "y":
            return {"correct": True, "correct_action": None}
        if fb == "n":
            correct_json = input("  [FEEDBACK] Enter correct action JSON (or press Enter to skip): ").strip()
            if correct_json:
                try:
                    correct_action = json.loads(correct_json)
                    return {"correct": False, "correct_action": correct_action}
                except json.JSONDecodeError:
                    print("  [FEEDBACK] Invalid JSON, skipping.")
            return {"correct": False, "correct_action": None}
    except EOFError:
        pass
    return {"correct": None, "correct_action": None}


def _check_missing_tool_suggestions() -> list[dict]:
    """Phase B: Check missing_tools.json for actions with frequency >= 3.

    Returns list of suggested tools the user may want to define.
    """
    missing_tools_file = MISSING_TOOLS_PATH
    if not os.path.exists(missing_tools_file):
        return []
    try:
        with open(missing_tools_file, "r", encoding="utf-8") as f:
            logs = json.load(f)
    except Exception:
        return []

    suggestions = [log for log in logs if log.get("frequency", 0) >= 3 and not log.get("suggested", False)]
    return suggestions


# ──────────────────────────────────────────────────────────────
# MAIN (CLI) LOOP
# ──────────────────────────────────────────────────────────────
def main():
    print("=" * 52)
    print("  Windows Automation Agent v2.0  (type 'exit' to quit)")
    print("  Input modes: [t]ext | [v]oice | [b]atch")
    print("=" * 52)
    mode = input("Choose mode (t/v/b): ").strip().lower()
    if mode == "b":
        test_file = input("Enter test file path (default: test_prompts.txt): ").strip()
        run_test_batch(test_file or "test_prompts.txt")
        return

    while True:
        try:
            if mode == "v":
                command = listen()
                print(f"  [YOU] {command}")
            else:
                command = input("\nCommand > ").strip()

            if command.lower() in ("exit", "quit", "bye"):
                speak("Shutting down. Goodbye.")
                break
            if not command:
                continue

            global_memory.add_user(command)
            action = ask_llm(command, global_memory.get_history())
            if action:
                global_memory.add_agent(action)
                
                # ── CLI destructive confirmation ───────────────────────────
                if action.get("action") in ("delete_file", "delete_folder"):
                    path = action.get("path", action.get("value", "?"))
                    try:
                        confirm = input(f"  ⚠ CONFIRM DELETE '{path}'? (yes/n): ").strip().lower()
                    except EOFError:
                        confirm = "n"
                    if confirm == "yes":
                        action["confirmed"] = True
                    else:
                        print("  ↳ Action cancelled by user.")
                        continue
                        
                result = execute(action, command)
                print(f"  ↳ {result}")
                if result.startswith("Unknown action:"):
                    speak("I don't have that capability yet. Logged for future build.")

                # ── Feedback loop ─────────────────────────────────────────
                feedback = _prompt_feedback(command, action, result)
                with open(EXECUTION_LOG_PATH, "a", encoding="utf-8") as _f:
                    _f.write(json.dumps({
                        "command": command,
                        "action_taken": action,
                        "correct": feedback["correct"],
                        "correct_action": feedback["correct_action"],
                    }) + "\n")

                # ── Phase B: Tool suggestion (frequency >= 3) ─────────────
                suggestions = _check_missing_tool_suggestions()
                for s in suggestions:
                    action_name = s.get("action_requested", "?")
                    freq = s.get("frequency", 0)
                    cmds = s.get("commands", [])
                    print()
                    print(f"  ⚡ [SUGGESTION] You've asked for '{action_name}' {freq} times.")
                    print(f"     Examples: {cmds[:3]}")
                    ans = input("     Would you like to add this as a custom action? (y/n): ").strip().lower()
                    if ans == "y":
                        print(f"     To add '{action_name}', define it in a new SKILL.md at .agents/skills/{action_name}/SKILL.md")
                        print(f"     Instruction: implement the handler in execute() following the existing pattern.")
                        speak(f"Noted. I'll log {action_name} for future implementation.")
                    
                    try:
                        with open(MISSING_TOOLS_PATH, "r", encoding="utf-8") as _f:
                            _logs = __import__("json").load(_f)
                        for _l in _logs:
                            if _l.get("action_requested") == action_name:
                                _l["suggested"] = True
                                break
                        with open(MISSING_TOOLS_PATH, "w", encoding="utf-8") as _f:
                            __import__("json").dump(_logs, _f, indent=2)
                    except Exception as e:
                        pass
            else:
                speak("Sorry, all AI providers are down right now.")

        except sr.WaitTimeoutError:
            print("  [VOICE] No speech detected, try again.")
        except KeyboardInterrupt:
            print("\n  Interrupted.")
            break
        except Exception as e:
            print(f"  [ERROR] {e}")


if __name__ == "__main__":
    main()
