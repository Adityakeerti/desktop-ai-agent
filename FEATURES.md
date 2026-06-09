# 🤖 Windows Automation Agent — Feature Reference

> **Version:** 2.0  |  **UI:** J.A.R.V.I.S. Full-Window  |  **LLM Chain:** Groq → Gemini → HuggingFace → OpenRouter

---

## 🖥️ UI Changes (agent_ui.py)

| What changed | v1 (old) | v2 (new) |
|---|---|---|
| **Window size** | 380 × 620 floating panel | 1100 × 720 full window, resizable |
| **Window style** | `overrideredirect(True)` no OS chrome | Native window + custom inner title bar |
| **Layout** | Single column: reactor → log → input | **3-zone**: sidebar + chat area + input bar |
| **Conversation display** | Plain log box (text dump) | **Chat bubbles** — user vs agent, timestamps, action tags, result preview |
| **Sidebar** | None | Arc reactor + status + **8 quick-action buttons** + model chain display + clear memory |
| **Arc reactor** | 120 × 120 px | **140 × 140 px** with outer glow ring, inner ring, pulsing core dot |
| **Input field** | Small 270-px fixed entry | **Full-width expandable** entry with placeholder |
| **Command history** | None | ↑ / ↓ arrow keys cycle through past commands |
| **Mic button** | Toggles voice | Same + visual state feedback (🎤 → 🔴 when active) |
| **Window controls** | Only ✕ close | **Minimize, Maximize/Restore, Close** buttons |
| **Status badge** | Simple text label | Colored icon + text (● ONLINE / ◎ PROCESSING / ✓ SUCCESS / ✗ FAILED) |
| **Model info** | None | Sidebar shows active fallback chain |
| **Clear chat** | None | Quick-action button + clears only display |
| **Clear memory** | None | Sidebar button — resets LLM context history |

---

## ⚙️ Agent Features (windows_agent.py)

### ✅ Carried Over From v1

| Action | Description |
|---|---|
| `open_app` | Open any app by name (Notepad, Chrome, Firefox, Edge, VS Code, Spotify, etc.) |
| `open_app` + `url` | Open browser at a specific URL |
| `close_app` | Kill an app by process name |
| `type_text` | Type text at the current keyboard cursor |
| `press_keys` | Press any key combo (e.g. `ctrl+s`, `alt+f4`, `win+d`) |
| `click_element` | Click a UI element by name (UIAutomation, with loose fallback) |
| `right_click` | Right-click at x,y coordinates |
| `double_click` | Double-click at x,y coordinates |
| `scroll` | Scroll up/down by amount |
| `move_mouse` | Move mouse to coordinates |
| `drag` | Drag from one coordinate to another |
| `switch_window` | Bring a window to focus by title substring |
| `maximize_window` | Maximize a window by title |
| `minimize_window` | Minimize a window by title |
| `screenshot` | Capture and save a screenshot to a path |
| `search_web` | Open Google search in Chrome |
| `send_whatsapp` | Send a WhatsApp message to a contact/number |
| `say` | Speak text using text-to-speech |
| `reply` | Return a conversational answer shown in the chat |
| `delete_file` | Delete a file at a given path |

---

### 🆕 New in v2

| Action | Description |
|---|---|
| `open_url` | Open any URL in the default browser |
| `click_at` | Click at exact screen coordinates |
| `get_active_window` | Return the title of the currently focused window |
| `focus_window` | Bring a named window to the foreground |
| `paste_text` | Simulate Ctrl+V to paste clipboard content |
| `create_file` | Create a new file with optional text content |
| `read_file` | Read and display a file's contents (up to 4 KB) |
| `copy_file` | Copy a file from src to dst |
| `move_file` | Move / cut-paste a file |
| `rename_file` | Rename a file to a new name |
| `create_folder` | Create a directory (with parents) |
| `delete_folder` | Recursively delete a directory |
| `list_files` | List files and folders inside a directory |
| `zip_files` | Compress a list of files into a `.zip` archive |
| `download_file` | Download a file from a URL to disk |
| `run_command` | Execute any Windows CMD command and return output |
| `run_powershell` | Execute any PowerShell command and return output |
| `get_system_info` | Report CPU %, RAM usage, and disk usage (via `psutil`) |
| `set_volume` | Set the master system volume to 0–100% |
| `get_clipboard` | Read and return clipboard text content |
| `set_clipboard` | Write text to the clipboard |
| `get_weather` | Fetch live weather for any city (wttr.in or OpenWeatherMap) |
| `set_reminder` | Set a timed reminder that speaks after N seconds |

---

## 🧠 LLM Fallback Chain

```
Groq (llama-3.3-70b)  →  Gemini 2.0 Flash  →  HuggingFace Mistral-7B  →  OpenRouter Mistral-7B
```

- Each provider is tried in order; on failure the next is used automatically.
- Conversation memory (last 10 exchanges) is injected into every prompt.

---

## ⌨️ Keyboard Shortcuts (UI)

| Key | Action |
|---|---|
| `Enter` | Submit current command |
| `↑` | Scroll back through command history |
| `↓` | Scroll forward through command history |

---

## 📁 App Support

The agent recognises and can open/close:

`notepad` · `calculator` · `explorer` · `wordpad` · `mspaint` · `paint` · `cmd` · `powershell` · `taskmgr` · `regedit` · `control` · `snipping tool` · `chrome` · `chromium` · `firefox` · `edge` · `brave` · `vscode` · `microsoft store` · `spotify` · `discord` · `zoom` · `teams` · `slack` · `telegram`

---

## 💬 Example Commands

```
open chrome at youtube.com
take a screenshot and save it to my desktop
get system info
create a file at C:/test.txt with Hello World
list files in C:/Users/adity/Documents
download file from https://example.com/file.zip to C:/downloads/file.zip
run command: ipconfig /all
set volume to 50
get weather for Mumbai
set a reminder to drink water in 5 minutes
send WhatsApp to +91xxxxxxxxxx with message hello
search Google for latest Python tutorials
zip C:/reports/a.pdf and C:/reports/b.pdf into C:/archive.zip
```

---

*Generated automatically by J.A.R.V.I.S. Windows Automation Agent v2.0*
