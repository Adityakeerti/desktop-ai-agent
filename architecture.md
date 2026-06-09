# Windows Automation Agent Architecture

This document outlines the architecture, toolset, and operational logic of the Windows Automation Agent (v2.0).

## 1. Core Architecture

The system follows a **Multi-LLM Fallback Chain** architecture. It transforms natural language commands into structured JSON actions which are then executed by a local Python-based executor.

### 1.1 Components

*   **GUI / CLI Interface**: 
    *   `agent_ui.py`: A modern, J.A.R.V.I.S.-styled interface built with `customtkinter`.
    *   `windows_agent.py`: Provides a legacy CLI interface and batch testing mode.
*   **Conversation Memory**: Managed by `ConversationMemory` class. It maintains a rolling history of User commands and Agent actions to provide context for subsequent requests.
*   **LLM Matrix**: A sequence of providers tried in order:
    1.  **Groq** (Llama-3.3-70b-versatile) - Primary, high speed.
    2.  **Gemini** (Gemini-2.0-Flash) - First fallback.
    3.  **HuggingFace** (Mistral-7B-Instruct-v0.3) - Second fallback.
    4.  **OpenRouter** (Mistral-7B-Instruct:free) - Final fallback.
*   **Action Executor**: The `execute()` function in `windows_agent.py` maps JSON actions to system-level operations using libraries like `pyautogui`, `uiautomation`, `subprocess`, and `pygetwindow`.

## 2. Agent Tools & Working Methods

The agent supports a wide range of actions. Below is a detailed breakdown, highlighting potential fragility.

### 2.1 App & Window Management
| Action | Method | Fragility / Hardcoding |
| :--- | :--- | :--- |
| `open_app` | Uses `APP_PATHS` lookup or Windows Search fallback. | **High.** `APP_PATHS` is a static dictionary. Windows Search fallback uses timed keyboard macros (`win` -> write -> `enter`). |
| `close_app` | Uses `taskkill /f /im`. | **Medium.** Depends on `APP_PATHS` to resolve executable name. |
| `switch_window` / `focus_window` | Uses `pygetwindow` for title matching. | **Low.** Reliable for visible windows. |
| `maximize_window` / `minimize_window` | Uses `pygetwindow`. | **Low.** |
| `open_url` | Uses `start ""` shell command. | **Low.** |

### 2.2 Keyboard & Mouse
| Action | Method | Fragility / Hardcoding |
| :--- | :--- | :--- |
| `type_text` | `pyautogui.write` or clipboard paste for long text. | **Medium.** Requires the correct window to be focused. |
| `press_keys` | `pyautogui.hotkey`. | **Medium.** Requires focus. |
| `click_element` | `uiautomation` (Exact match -> Loose child match). | **High.** UI tree depth is limited to 5. Loose matching can be ambiguous. |
| `click_at` / `right_click` / `double_click` | `pyautogui` at coords. | **Medium.** Coordinates are resolution-dependent. |
| `scroll` | `pyautogui.scroll`. | **Low.** |

### 2.3 Files & Folders
| Action | Method | Fragility / Hardcoding |
| :--- | :--- | :--- |
| `create_file` / `read_file` | Standard Python `open()`. | **Low.** |
| `copy_file` / `move_file` | `shutil`. | **Low.** |
| `list_files` | `os.listdir` (capped at 50). | **Low.** |
| `zip_files` | `zipfile`. | **Low.** |
| `download_file` | `requests` (streamed). | **Low.** |

### 2.4 System & Media
| Action | Method | Fragility / Hardcoding |
| :--- | :--- | :--- |
| `run_command` / `run_powershell` | `subprocess.run`. | **Low** (Technically robust, but security-sensitive). |
| `get_system_info` | `psutil` or `systeminfo` fallback. | **Low.** |
| `set_volume` | `pycaw` (Windows CoreAudio API). | **Low.** Very robust. |
| `get_clipboard` / `set_clipboard` | `win32clipboard` or PowerShell fallback. | **Low.** |
| `screenshot` | `pyautogui.screenshot`. | **Low.** |

### 2.5 Specialized Actions
| Action | Method | Fragility / Hardcoding |
| :--- | :--- | :--- |
| `search_web` | Chrome direct path or `start ""` fallback. | **Medium.** Depends on Chrome path in `APP_PATHS`. |
| `send_whatsapp` | **Direct Number**: URL scheme + `enter`. **Contact**: UI Macro. | **CRITICAL.** Both methods are fragile. Direct number relies on a 3s wait and an `enter` keypress. Contact sending is a hardcoded sequence of `ctrl+f` -> wait -> type -> wait -> `down` -> `enter`. |
| `get_weather` | OpenWeatherMap API or `wttr.in` scrape. | **Low.** |
| `set_reminder` | Python `threading.Thread` + `time.sleep`. | **Medium.** Reminders are lost if the app closes. |

## 3. Fragile & Non-Dynamic Logic (Maintenance Targets)

1.  **`APP_PATHS` Dictionary**:
    *   *Problem*: Contains hardcoded paths for Chrome, VS Code, Discord, etc.
    *   *Failure*: If a user installs VS Code in a custom directory, `open_app "vscode"` may fail unless Windows Search picks it up.
2.  **WhatsApp UI Macro**:
    *   *Problem*: Uses `time.sleep(3)` and fixed key sequences.
    *   *Failure*: Any network lag or WhatsApp update that changes the search behavior will break this tool.
3.  **Windows Search Fallback**:
    *   *Problem*: Relies on `pyautogui.press("win")` and fixed sleep times.
    *   *Failure*: If the Start menu is slow to open or focus is lost, the command text might be typed into the wrong window.
4.  **`click_element` Depth**:
    *   *Problem*: `depth=5` is hardcoded.
    *   *Failure*: Complex applications with deep UI nesting (like modern Web-based desktop apps) might have elements hidden beyond this depth.
5.  **Coordinate-based Actions**:
    *   *Problem*: Coords are clamped to 3840x2160.
    *   *Failure*: Multi-monitor setups or high-res displays might behave unexpectedly if the LLM isn't aware of the actual screen resolution (which isn't currently passed in the prompt).

## 4. Communication Protocol

The agent uses a strict JSON protocol. The LLM is instructed to return **only** a JSON object.

**Example Request:** "Open notepad and type 'Hello World'"
**Example Action (Internal):**
```json
{"action": "open_app", "value": "notepad"}
```
*(Followed by subsequent turn)*
```json
{"action": "type_text", "value": "Hello World"}
```

**Note**: The prompt explicitly warns the LLM to focus or open an app before typing, though this is a "soft" rule enforced by the LLM's logic, not a hard constraint in the executor.
