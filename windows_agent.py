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

import os
import json
import time
import shutil
import zipfile
import threading
import subprocess
import requests
import pyautogui
import pygetwindow as gw
import speech_recognition as sr
import pyttsx3
import uiautomation as auto
import urllib.parse
from collections import deque
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

# ──────────────────────────────────────────────────────────────
# CONFIG — API keys loaded from environment
# ──────────────────────────────────────────────────────────────
KEYS = {
    "groq":        os.getenv("GROQ_API_KEY",      ""),
    "gemini":      os.getenv("GEMINI_API_KEY",    ""),
    "huggingface": os.getenv("HF_API_KEY",        ""),
    "openrouter":  os.getenv("OPENROUTER_API_KEY",""),
    "weather":     os.getenv("WEATHER_API_KEY",   ""),   # openweathermap.org free key
}

pyautogui.PAUSE    = 0.3
pyautogui.FAILSAFE = True  # move mouse to top-left corner to emergency stop

# ──────────────────────────────────────────────────────────────
# APP PATHS  (common Windows apps with fallbacks)
# ──────────────────────────────────────────────────────────────
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
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
    "chromium": [
        "chromium.exe",
        "C:\\Program Files\\Chromium\\Application\\chromium.exe",
    ],
    "firefox": [
        "firefox.exe",
        "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
        "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
    ],
    "edge": [
        "msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
    "brave": [
        "brave.exe",
        "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    ],
    "vscode": [
        "code.exe",
        "C:\\Program Files\\Microsoft VS Code\\Code.exe",
        "C:\\Users\\" + os.getenv("USERNAME","") + "\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
    ],
    "vs code": [
        "code.exe",
        "C:\\Program Files\\Microsoft VS Code\\Code.exe",
    ],
    "microsoft store": "start ms-windows-store:",
    "spotify": [
        "Spotify.exe",
        "C:\\Users\\" + os.getenv("USERNAME","") + "\\AppData\\Roaming\\Spotify\\Spotify.exe",
    ],
    "discord": [
        "Discord.exe",
        "C:\\Users\\" + os.getenv("USERNAME","") + "\\AppData\\Local\\Discord\\app-*\\Discord.exe",
    ],
    "zoom": [
        "Zoom.exe",
        "C:\\Users\\" + os.getenv("USERNAME","") + "\\AppData\\Roaming\\Zoom\\bin\\Zoom.exe",
    ],
    "teams": [
        "Teams.exe",
        "C:\\Users\\" + os.getenv("USERNAME","") + "\\AppData\\Local\\Microsoft\\Teams\\current\\Teams.exe",
    ],
    "slack": [
        "slack.exe",
        "C:\\Users\\" + os.getenv("USERNAME","") + "\\AppData\\Local\\slack\\slack.exe",
    ],
    "telegram": [
        "Telegram.exe",
        "C:\\Users\\" + os.getenv("USERNAME","") + "\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe",
    ],
}


def _resolve_app_path(app_name: str) -> str:
    """Find the best executable path for an app, trying multiple locations."""
    app_lower = app_name.lower().strip()
    if app_lower not in APP_PATHS:
        return app_name  # Assume directly executable or in PATH

    paths = APP_PATHS[app_lower]
    if isinstance(paths, str):
        return paths

    for path in paths:
        if "*" in path:
            import glob
            matches = glob.glob(path)
            if matches:
                return f'"{matches[0]}"'
        elif os.path.exists(path):
            return f'"{path}"'

    return paths[0]  # Fall back to first (usually in PATH)


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
    history_str = ""
    if history:
        history_str = "PREVIOUS CONTEXT:\n" + "\n".join(history) + "\n\n"

    return f"""You are an advanced Windows PC automation controller. Parse the user's command into ONE action JSON object.

{history_str}CURRENT COMMAND: "{command}"

CRITICAL RULES:
1. Respond with ONLY valid JSON — no markdown fences, no extra text whatsoever
2. Extract numeric values and names accurately
3. For app names use lowercase: notepad, calculator, chrome, firefox, explorer, edge, vscode, spotify
4. For file paths use forward slashes or escaped backslashes
5. CRITICAL: If the user asks to type or do something in a specific app (like Notepad), your VERY FIRST action MUST be to `open_app` or `switch_window`. Do NOT use `type_text` blindly without focusing the target app first!

AVAILABLE ACTIONS (pick exactly one):

=== APP / WINDOW ===
{{"action":"open_app","value":"chrome"}}                          - open an application
{{"action":"open_app","value":"chrome","url":"https://..."}}      - open browser at URL
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
{{"action":"click_element","value":"Submit"}}                     - click UI element by name
{{"action":"click_at","x":500,"y":300}}                           - click at screen coordinates
{{"action":"right_click","x":500,"y":300}}                        - right-click at coordinates
{{"action":"double_click","x":500,"y":300}}                       - double-click at coordinates
{{"action":"scroll","direction":"down","amount":5}}               - scroll (up/down, amount 1-10)
{{"action":"move_mouse","x":500,"y":300}}                         - move mouse to coordinates
{{"action":"drag","from_x":100,"from_y":100,"to_x":400,"to_y":400}} - drag from→to

=== SCREEN / MEDIA ===
{{"action":"screenshot","path":"C:/Users/user/Desktop/shot.png"}} - save screenshot
{{"action":"get_active_window"}}                                  - query focused window title

=== FILES / FOLDERS ===
{{"action":"create_file","path":"C:/test.txt","content":"Hello"}} - create file with content
{{"action":"read_file","path":"C:/test.txt"}}                     - read and return file content
{{"action":"delete_file","path":"C:/test.txt"}}                   - delete a file
{{"action":"copy_file","src":"C:/a.txt","dst":"C:/b.txt"}}        - copy file
{{"action":"move_file","src":"C:/a.txt","dst":"C:/b.txt"}}        - move/rename file
{{"action":"rename_file","path":"C:/a.txt","new_name":"b.txt"}}   - rename file
{{"action":"create_folder","path":"C:/MyFolder"}}                 - create directory
{{"action":"delete_folder","path":"C:/MyFolder"}}                 - delete directory tree
{{"action":"list_files","path":"C:/Users"}}                       - list files in directory
{{"action":"zip_files","files":["a.txt","b.txt"],"output":"out.zip"}} - compress files
{{"action":"download_file","url":"https://...","path":"C:/file.zip"}} - download a file

=== SYSTEM ===
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


def ask_groq(command: str, history: list = None) -> dict:
    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {KEYS['groq']}"},
        json={
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": build_prompt(command, history)}],
            "temperature": 0,
        },
        timeout=12,
    )
    resp.raise_for_status()
    return _parse_json(resp.json()["choices"][0]["message"]["content"])


def ask_gemini(command: str, history: list = None) -> dict:
    resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={KEYS['gemini']}",
        json={"contents": [{"parts": [{"text": build_prompt(command, history)}]}]},
        timeout=12,
    )
    resp.raise_for_status()
    text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    return _parse_json(text)


def ask_huggingface(command: str, history: list = None) -> dict:
    resp = requests.post(
        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
        headers={"Authorization": f"Bearer {KEYS['huggingface']}"},
        json={"inputs": build_prompt(command, history), "parameters": {"max_new_tokens": 200}},
        timeout=25,
    )
    resp.raise_for_status()
    raw = resp.json()
    text = raw[0].get("generated_text", "") if isinstance(raw, list) else raw.get("generated_text", "")
    start = text.rfind("{")
    end   = text.rfind("}") + 1
    return json.loads(text[start:end])


def ask_openrouter(command: str, history: list = None) -> dict:
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {KEYS['openrouter']}",
            "HTTP-Referer": "https://github.com/local-agent",
        },
        json={
            "model": "mistralai/mistral-7b-instruct:free",
            "messages": [{"role": "user", "content": build_prompt(command, history)}],
            "temperature": 0,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return _parse_json(resp.json()["choices"][0]["message"]["content"])


# ──────────────────────────────────────────────────────────────
# FALLBACK CHAIN
# ──────────────────────────────────────────────────────────────
PROVIDERS = [
    ("Groq",        ask_groq),
    ("Gemini",      ask_gemini),
    ("HuggingFace", ask_huggingface),
    ("OpenRouter",  ask_openrouter),
]


def ask_llm(command: str, history: list = None) -> dict:
    """Tries providers in sequence until one succeeds."""
    print("  [LLM] Routing command through LLM matrix...")
    for name, func in PROVIDERS:
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
# ACTION EXECUTOR  — v2.0 (all new actions added)
# ──────────────────────────────────────────────────────────────

def _safe_coords(action: dict, xk="x", yk="y", default_x=500, default_y=300):
    """Return (x, y) clamped to safe screen bounds."""
    x = max(5, min(int(action.get(xk, default_x)), 3840))
    y = max(5, min(int(action.get(yk, default_y)), 2160))
    return x, y


def execute(action: dict) -> str:
    """
    Execute an action dict and return a human-readable result string.
    Raises no exceptions — all errors are caught and returned as strings.
    """
    try:
        a = action.get("action", "")
        v = action.get("value", "")

        # ── App / Window ─────────────────────────────────────────────────────
        if a == "open_app":
            app_path = _resolve_app_path(str(v))
            url = action.get("url", "")
            if app_path == v and not str(v).lower().endswith(".exe") and not str(v).startswith("start "):
                # Use Windows Search
                old = pyautogui.FAILSAFE
                pyautogui.FAILSAFE = False
                try:
                    pyautogui.press("win"); time.sleep(0.5)
                    pyautogui.write(str(v), interval=0.02); time.sleep(1.0)
                    pyautogui.press("enter")
                finally:
                    pyautogui.FAILSAFE = old
                return f"Opened via Windows Search: {v}"
            else:
                cmd = f'{app_path} "{url}"' if url else app_path
                subprocess.Popen(cmd, shell=True)
                return f"Opened: {v}" + (f" at {url}" if url else "")

        elif a == "close_app":
            app_name = APP_PATHS.get(str(v).lower(), v)
            if isinstance(app_name, list):
                app_name = os.path.basename(app_name[0])
            elif isinstance(app_name, str) and not app_name.startswith("start"):
                app_name = os.path.basename(app_name)
            os.system(f"taskkill /f /im {app_name} 2>nul")
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
            old = pyautogui.FAILSAFE; pyautogui.FAILSAFE = False
            try:
                text_to_type = str(v)
                if "\n" in text_to_type or len(text_to_type) > 50:
                    # Fast paste for multiline or long text
                    import pyperclip
                    pyperclip.copy(text_to_type)
                    time.sleep(0.1)
                    pyautogui.hotkey("ctrl", "v")
                else:
                    pyautogui.write(text_to_type, interval=0.01)
            finally:
                pyautogui.FAILSAFE = old
            return f"Typed: {v[:50]}..."

        elif a == "press_keys":
            old = pyautogui.FAILSAFE; pyautogui.FAILSAFE = False
            try:
                keys = [k.strip() for k in str(v).split("+")]
                pyautogui.hotkey(*keys)
            finally:
                pyautogui.FAILSAFE = old
            return f"Pressed: {v}"

        elif a == "click_element":
            try:
                el = auto.Control(Name=str(v), depth=5)
                if el.Exists(2):
                    el.Click(simulateMove=False)
                    return f"Clicked element: {v}"
                else:
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
            x1 = max(5, min(int(action.get("from_x", 100)), 3840))
            y1 = max(5, min(int(action.get("from_y", 100)), 2160))
            x2 = max(5, min(int(action.get("to_x",   300)), 3840))
            y2 = max(5, min(int(action.get("to_y",   300)), 2160))
            pyautogui.moveTo(x1, y1, duration=0.2)
            pyautogui.drag(x2 - x1, y2 - y1, duration=0.4)
            return f"Dragged ({x1},{y1}) → ({x2},{y2})"

        elif a == "paste_text":
            old = pyautogui.FAILSAFE; pyautogui.FAILSAFE = False
            try:
                pyautogui.hotkey("ctrl", "v")
            finally:
                pyautogui.FAILSAFE = old
            return "Pasted clipboard content"

        # ── Screen ────────────────────────────────────────────────────────────
        elif a == "screenshot":
            path = action.get("path") or str(v) or f"screenshot_{int(time.time())}.png"
            path = os.path.expandvars(os.path.expanduser(path))
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
                shutil.rmtree(path)
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
        elif a == "run_command":
            result = subprocess.run(
                str(v), shell=True, capture_output=True,
                text=True, timeout=30, encoding="utf-8", errors="replace"
            )
            out = (result.stdout + result.stderr).strip()
            return f"Command output:\n{out[:2000]}"

        elif a == "run_powershell":
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", str(v)],
                capture_output=True, text=True, timeout=30,
                encoding="utf-8", errors="replace"
            )
            out = (result.stdout + result.stderr).strip()
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
            try:
                # Use pycaw — the proper Windows CoreAudio API
                from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
                from ctypes import cast, POINTER
                from comtypes import CLSCTX_ALL
                devices   = AudioUtilities.GetSpeakers()
                interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
                vol_ctrl  = cast(interface, POINTER(IAudioEndpointVolume))
                vol_ctrl.SetMasterVolumeLevelScalar(level / 100.0, None)
                return f"Volume set to {level}%"
            except Exception as e:
                return f"Volume error: {e}"

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
            try:
                chrome_path = _resolve_app_path("chrome")
                subprocess.Popen(f'{chrome_path} "{url}"', shell=True)
            except Exception:
                subprocess.Popen(f'start "" "{url}"', shell=True)
            return f"Searched Google: {v}"

        # ── Messaging ─────────────────────────────────────────────────────────
        elif a == "send_whatsapp":
            contact = str(action.get("contact", ""))
            message = str(action.get("message", ""))
            if contact and message:
                if contact[0].isdigit() or contact.startswith("+"):
                    # Direct number link
                    safe_msg = urllib.parse.quote(message)
                    url = f"whatsapp://send?phone={contact}&text={safe_msg}"
                    os.system(f'start "" "{url}"')
                    time.sleep(3)
                    pyautogui.press("enter")
                    return f"Sent WhatsApp to {contact}"
                else:
                    # Named contact - dynamic search via UI
                    os.system('start whatsapp:')
                    time.sleep(3)
                    
                    # 1. Open search (Ctrl+F)
                    pyautogui.hotkey("ctrl", "f")
                    time.sleep(1)
                    
                    # 2. Type contact name
                    pyautogui.write(contact, interval=0.05)
                    time.sleep(2)  # Wait for search results
                    
                    # 3. Select first result and open chat
                    pyautogui.press("down")
                    time.sleep(0.5)
                    pyautogui.press("enter")
                    time.sleep(1)
                    
                    # 4. Type and send message
                    pyautogui.write(message, interval=0.02)
                    time.sleep(0.5)
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
            return f"Agent: {v}"

        else:
            return f"Unknown action: {a}"

    except Exception as e:
        return f"Error executing '{action.get('action','?')}': {type(e).__name__}: {e}"


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
    r = sr.Recognizer()
    with sr.Microphone() as source:
        print("  [VOICE] Listening...")
        r.adjust_for_ambient_noise(source, duration=0.5)
        audio = r.listen(source, timeout=5)
    return r.recognize_google(audio)


# ──────────────────────────────────────────────────────────────
# BATCH TESTING
# ──────────────────────────────────────────────────────────────
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
                result = execute(action)
                print(f"  ↳ {result}")
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
                result = execute(action)
                print(f"  ↳ {result}")
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
