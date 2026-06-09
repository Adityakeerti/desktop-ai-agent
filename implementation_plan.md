# Plan
## agent_ui.py: Full Window
- Geometry: 900x700, resizable, with normal title bar + custom header bar inside
- Left sidebar: Arc reactor + status + quick-action buttons (Screenshot, Clear, Settings)  
- Main center: big conversation log area (chat bubble style, user vs agent)
- Bottom: wide input bar + mic + send button + model indicator
- System tray-like taskbar, minimize/maximize/close native

## windows_agent.py: New Features
### Existing
- open_app, close_app, type_text, press_keys, click_element, scroll, search_web
- switch_window, screenshot, maximize_window, minimize_window, move_mouse, drag
- send_whatsapp, say, reply, delete_file, right_click, double_click

### New Features to Add
- create_file: create a new file with content
- read_file: read and display file contents
- copy_file / move_file: file operations
- run_command: execute a shell/powershell command
- open_url: open a URL in default browser
- set_volume: set system volume level
- get_clipboard / set_clipboard: clipboard operations
- find_text_on_screen (OCR): find text in screen using pytesseract
- get_system_info: CPU, RAM, disk usage
- send_email: send email via SMTP
- create_folder: create directories
- list_files: list files in a directory
- zip_files: compress files
- download_file: download from URL
- weather: get weather info from API
- reminder/timer: set a timed reminder
- paste_text: paste from clipboard
- focus_window: bring window to front
- get_active_window: return current window title
