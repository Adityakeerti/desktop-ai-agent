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
    history_str = ""
    if history:
        history_str = "PREVIOUS CONTEXT:\n" + "\n".join(history) + "\n\n"

    # Fix #5 — inject actual screen resolution into prompt so LLM generates correct coords
    screen_w, screen_h = _get_screen_size()

    return f"""You are an advanced Windows PC automation controller. Parse the user's command into ONE action JSON object.

{history_str}CURRENT COMMAND: "{command}"

SCREEN INFO: The user's primary display is {screen_w}×{screen_h} pixels. Use coordinates within this range.

CRITICAL RULES:
1. Respond with ONLY valid JSON — no markdown fences, no extra text whatsoever
2. Extract numeric values and names accurately
3. For app names use lowercase. CRITICAL: If the user requests a specific app/browser (e.g. 'brave', 'edge'), use that exact name. Do NOT default to 'chrome'.
4. For file paths use forward slashes or escaped backslashes
5. CRITICAL: If the user asks to type or do something in a specific app, your VERY FIRST action MUST be to `open_app` or `switch_window`. Do NOT use `type_text` blindly!
6. For coordinate actions, ensure x is between 0-{screen_w - 1} and y is between 0-{screen_h - 1}
7. CRITICAL: Do NOT autocorrect or modify URLs, paths, or names. Copy them EXACTLY as typed by the user (e.g. gehu.ac.in must stay gehu.ac.in).
8. CRITICAL: If asked to open a website in a SPECIFIC browser, use "open_app" AND include the "url" field (e.g., {{"action":"open_app", "value":"brave", "url":"https://google.com"}}).

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


def ask_ollama(command: str, history: list = None) -> dict:
    """Local Ollama — primary provider, runs gemma4:e4b entirely offline."""
    resp = requests.post(
        "http://localhost:11434/v1/chat/completions",
        json={
            "model": "gemma4:e4b",
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
    resp = requests.post(
        "http://localhost:11434/v1/chat/completions",
        json={
            "model": "gemma4:31b-cloud",
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
                # ── Windows Search fallback (Fix #3) ──────────────────────
                # Poll for the Start Menu / Search window instead of blind sleep
                old = pyautogui.FAILSAFE
                pyautogui.FAILSAFE = False
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
                    time.sleep(4.0)  # Wait for search results to populate (slower load safety)

                    # 3. Select first result
                    # Pressing down arrow moves focus to the top search result
                    pyautogui.press("down")
                    time.sleep(0.3)
                    pyautogui.press("enter")
                    time.sleep(1.5)  # Wait for chat to open

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
