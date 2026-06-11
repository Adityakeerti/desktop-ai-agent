# R.A.G.E. — Windows Automation Agent v2.0

> **Rarely Appreciated Genius Entity** — a local, LLM-powered Windows automation agent with a dual-mode interface: a modern React/pywebview app and a CustomTkinter desktop GUI.

---

## ✨ What it does

Type (or speak) a natural language command — R.A.G.E. routes it through a multi-LLM fallback chain, parses the JSON action, and executes it directly on your Windows machine.

```
"open chrome at youtube.com"          → launches Chrome with YouTube
"set volume to 40"                    → sets system master volume
"take a screenshot and save to desktop" → captures + saves screenshot
"run powershell Get-Process"          → returns top running processes
"send WhatsApp to +91... with hello"  → opens WhatsApp and sends message
```

---

## 🗂️ Project Structure

```
windows_automation_agent/
├── backend/
│   ├── __init__.py          # makes backend a package
│   ├── windows_agent.py     # core engine: LLM routing, action dispatcher
│   ├── memory.py            # SQLite persistent memory, interaction history, macros [NEW]
│   ├── safety.py            # blocklist validator, sandbox, emergency stop hotkey [NEW]
│   ├── hooks.py             # startup registry, summon hotkey, system tray, observers [NEW]
│   └── agent_ui.py          # CustomTkinter GUI (Arc Reactor UI)
├── frontend/                # React + Vite + TypeScript UI
│   ├── src/
│   │   └── components/
│   │       ├── MainApp.tsx  # main application component
│   │       └── GlobeCanvas.tsx
│   ├── dist/                # production build (gitignored, run `npm run build`)
│   └── package.json
├── scripts/
│   └── run_webview.py       # pywebview launcher — serves frontend/dist/ with Python API bridge
├── tests/
│   └── test_safety_and_memory.py # safety, sandbox, and SQLite memory unit tests [NEW]
├── .env.example             # API key template
├── .gitignore
├── pyproject.toml
├── requirements.txt         # runtime deps
├── requirements-dev.txt     # dev/lint deps
└── README.md
```

---

## 🏛️ Architecture

```mermaid
graph TD
    User([User: Text / Voice]) --> WebUI[React App\nscripts/run_webview.py]
    User --> TkUI[CustomTkinter GUI\nbackend/agent_ui.py]

    WebUI  --> API[pywebview API bridge]
    TkUI   --> BE

    API --> BE[backend/windows_agent.py]

    subgraph BE [Backend Engine]
        ENV[dotenv .env] --> MEM[ConversationMemory\nlast 10 exchanges]
        MEM --> LLM

        subgraph LLM [LLM Fallback Matrix]
            L1[1. Ollama Local\ngemma4:e4b]
            L1 -- fail/timeout --> L2[2. Ollama Cloud\ngemma4:31b-cloud]
            L2 -- fail/timeout --> L3[3. GitHub Models\ngpt-4o-mini]
        end

        LLM --> Parser[JSON Parser]
        Parser --> Exec[execute: Wrapper Action Dispatcher]
        
        Exec --> SafetyCheck{backend/safety.py\nBlocklist / Sandbox?}
        SafetyCheck -- Pass --> RealExec[_execute_core]
        SafetyCheck -- Dangerous / Sandbox --> BlockOrDryRun[Log Action & Abort/Dryrun]
        
        RealExec --> SQLMem[backend/memory.py\nSQLite interaction history]
    end

    subgraph WinHooks [Deep Windows Hooks - backend/hooks.py]
        API --> BootStartup[Boot Startup Registry]
        API --> Summon[Summon / Toggle Hotkey]
        API --> Tray[Win32 System Tray Icon]
        
        Clipboard[Clipboard Observer] -- URL / Path --> WebUI
        Downloads[Downloads Watcher] -- Auto-Organize extension --> WebUI
        Toasts[Toast Notification Db Observer] -- XML parsed Toast --> WebUI
    end

    subgraph OS [OS Automation]
        RealExec --> PyAutoGUI[pyautogui\nMouse / Keyboard]
        RealExec --> Win32[win32gui / win32clipboard]
        RealExec --> Pycaw[pycaw / CoreAudio\nVolume]
        RealExec --> UIAuto[uiautomation\nUI Controls]
        RealExec --> PS[subprocess\nTracked Popen processes]
        RealExec --> FS[os / shutil / zipfile\nFile System]
    end
    
    Emergency[Emergency Stop: Ctrl+Shift+X] --> KillProc[Kill Tracked Processes & Abort]
```

---

## 🚀 Getting Started

### Prerequisites
- Windows 10/11
- Python 3.11+
- Node.js 18+ (for the React frontend)
- Git

### 1 — Clone & create venv

```powershell
git clone <repo-url>
cd windows_automation_agent

python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 2 — Install Python dependencies

```powershell
pip install -r requirements.txt

# Optional dev tools (linting, formatting, tests)
pip install -r requirements-dev.txt
```

### 3 — Configure environment

```powershell
copy .env.example .env
```

Open `.env` and fill in your keys (Ollama Local needs no key):

```env
GITHUB_TOKEN=ghp_your_github_token_here
OLLAMA_API_KEY=your_ollama_cloud_key_here
WEATHER_API_KEY=your_openweathermap_key_here
```

### 4 — Build the frontend

```powershell
cd frontend
npm install
npm run build
cd ..
```

### 5 — Run

#### Webview UI (React — recommended)
```powershell
.\venv\Scripts\python.exe scripts\run_webview.py
```

#### CustomTkinter UI (Arc Reactor)
```powershell
.\venv\Scripts\python.exe -m backend.agent_ui
```

#### CLI / batch mode
```powershell
.\venv\Scripts\python.exe -m backend.windows_agent
```

---

## ⌨️ Keyboard Shortcuts (Webview & System)

| Shortcut | Scope | Action |
|---|---|---|
| `Enter` | Webview | Send command |
| `↑ / ↓` | Webview | Cycle through command history |
| `Ctrl+K` | Webview | Focus the command input from anywhere |
| `Ctrl+Shift+Space` | Global System | **Summon / Minimize** R.A.G.E. window toggler |
| `Ctrl+Shift+X` | Global System | **Emergency Stop** (instantly aborts executions & kills active subprocesses) |

---

## 🎛️ LLM Provider Dropdown

The title bar contains a **LLM_PROVIDER** selector. Options:

| Selection | Behaviour |
|---|---|
| `Auto (Fallback)` | Tries Ollama Local → Ollama Cloud → GitHub in order |
| `Ollama (Local)` | Pins to local Ollama only (no fallback) |
| `Ollama (Cloud)` | Pins to Ollama Cloud proxy |
| `GitHub` | Pins to GitHub Models (gpt-4o-mini) |

---

## ⚡ Quick Actions (Chat Panel)

| Chip | Command sent |
|---|---|
| Screenshot | `take a screenshot and save it to my desktop` |
| Sys Info | `get system info cpu ram and disk` |
| Clipboard | `get clipboard contents` |
| Google | `open https://www.google.com` |
| Explorer | `open explorer` |
| Notepad | `open notepad` |
| Volume 70% | `set volume to 70` |
| Task Mgr | `open task manager` |

---

## 🧠 Memory, Safety & Windows Hooks (v2.1)

### 1. Memory Layer
* **interaction_history**: Automatically records user commands to SQLite database to track frequencies and optimize execution paths over time.
* **Macros (Skills)**: Bundle multi-step actions together! Save recent actions by saying `"save this as <macro_name>"` or `"save last 3 actions as <macro_name>"`. Trigger the macro at any time by saying `"run <macro_name>"`.

### 2. Safety & Permission Layer
* **Blocklist**: Blocks high-risk commands matching dangerous patterns (e.g. `format`, UAC modifications, recursive system deletions).
* **Confirmations**: Displays custom confirmation dialog modals for destructive actions (like file/folder deletions) before they are sent to the executor.
* **Sandbox Mode**: Toggle dry-runs via the Settings Modal. When Sandbox is active, commands parse normally but execute no side-effects, printing a `[SANDBOX DRY-RUN]` action description.
* **Action logs**: Formats and appends every command, action payload, and result to local logs at `~/.jarvis/logs/YYYY-MM-DD.log`.

### 3. System Integration Hooks
* **System Tray**: Living tray agent with options to summon, toggle Sandbox Mode, toggle boot startup, or shutdown the agent.
* **Startup on Boot**: Toggles automatic startup launch registry entry in `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
* **Clipboard Watcher**: Background hook suggesting actions when URLs or file paths are copied.
* **File Watcher**: Auto-organizes files downloaded to `~/Downloads` into folders (`Images`, `Documents`, `Archives`, `Installers`, `Code`) and alerts the UI.
* **Toast Listener**: Queries the Windows notification database (`wpndatabase.db`), decodes XML payloads, and pushes incoming OS notifications to the HUD panel.

---

## 🔧 Supported Actions

| Category | Actions |
|---|---|
| **Apps** | `open_app`, `close_app`, `open_url`, `switch_window`, `maximize_window`, `minimize_window`, `get_active_window` |
| **Keyboard / Mouse** | `type_text`, `press_keys`, `click_element`, `click_at`, `right_click`, `double_click`, `move_mouse`, `scroll`, `drag`, `paste_text` |
| **File System** | `create_file`, `read_file`, `delete_file`, `copy_file`, `move_file`, `rename_file`, `create_folder`, `delete_folder`, `list_files`, `zip_files`, `download_file` |
| **System** | `run_command`, `run_powershell`, `get_system_info`, `set_volume`, `get_clipboard`, `set_clipboard` |
| **Integrations** | `search_web`, `send_whatsapp`, `get_weather`, `set_reminder`, `say` |

---

## 📱 Recognised Applications

`notepad` · `calculator` · `explorer` · `mspaint` · `cmd` · `powershell` · `taskmgr` · `regedit` · `chrome` · `firefox` · `edge` · `brave` · `vscode` · `spotify` · `discord` · `zoom` · `teams` · `slack` · `telegram`

> Apps not in this list are opened automatically via Windows Search simulation.

---

## 📦 Dependencies

| File | Purpose |
|---|---|
| `requirements.txt` | Runtime — all libs needed to run the agent |
| `requirements-dev.txt` | Dev tools — `pytest`, `black`, `ruff`, `flake8` |

`pywebview` is required only for the Webview UI. `customtkinter` is required only for the Arc Reactor UI. Both are in `requirements.txt`.

---

## 💬 Example Commands

```
open chrome at youtube.com
take a screenshot and save it to my desktop
get system info
create a file at C:/test.txt with content Hello World
list files in C:/Users/Documents
download file from https://example.com/file.zip to C:/downloads/file.zip
run command ipconfig /all
run powershell Get-Process | Sort-Object CPU -Desc | Select -First 10
set volume to 50
get weather for Mumbai
set a reminder to drink water in 5 minutes
send WhatsApp to +91XXXXXXXXXX with message hello
search Google for latest Python news
zip C:/reports/a.pdf and C:/reports/b.pdf into C:/archive.zip
```

---

## 📄 License

MIT
