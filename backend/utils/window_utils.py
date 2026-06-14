import win32gui
import win32process
import win32con
import win32api
import psutil
import logging

log = logging.getLogger("jarvis.window_utils")

def get_visible_windows() -> list[dict]:
    """
    Enumerate all visible windows with titles, rects, and process names.
    """
    windows = []
    
    def enum_windows_callback(hwnd, extra):
        # Only check visible, non-child windows
        if win32gui.IsWindowVisible(hwnd) and win32gui.GetParent(hwnd) == 0:
            title = win32gui.GetWindowText(hwnd)
            # Filter out empty titles or common background window titles
            if title and title != "Program Manager":
                try:
                    rect = win32gui.GetWindowRect(hwnd)
                    _, pid = win32process.GetWindowThreadProcessId(hwnd)
                    try:
                        proc = psutil.Process(pid)
                        proc_name = proc.name()
                    except Exception:
                        proc_name = ""
                    
                    windows.append({
                        "hwnd": hwnd,
                        "title": title,
                        "process_name": proc_name,
                        "rect": rect, # (left, top, right, bottom)
                        "pid": pid
                    })
                except Exception as e:
                    # Occasional permission errors on system/protected windows
                    log.debug("Failed to get window thread process ID for %s: %s", hwnd, e)
        return True
        
    try:
        win32gui.EnumWindows(enum_windows_callback, None)
    except Exception as e:
        log.error("EnumWindows failed: %s", e)
        
    return windows

def app_state_detection(app_name: str) -> int | None:
    """
    Check if a specific process name (e.g. 'chrome.exe') or window title matches.
    Returns the hwnd of the window if found, otherwise None.
    """
    app_name_lower = app_name.lower().strip()
    exe_name = app_name_lower if app_name_lower.endswith(".exe") else f"{app_name_lower}.exe"
    
    windows = get_visible_windows()
    for w in windows:
        p_name = w["process_name"].lower()
        w_title = w["title"].lower()
        if p_name == app_name_lower or p_name == exe_name or app_name_lower in w_title:
            return w["hwnd"]
            
    return None

def get_monitor_layouts() -> list[dict]:
    """
    Query system monitor layouts and bounds.
    """
    monitors = []
    try:
        monitor_infos = win32api.EnumDisplayMonitors()
        for hMonitor, hdcMonitor, pyRect in monitor_infos:
            monitor_info = win32api.GetMonitorInfo(hMonitor)
            monitors.append({
                "handle": int(hMonitor),
                "monitor_rect": monitor_info["Monitor"], # (left, top, right, bottom)
                "work_rect": monitor_info["Work"],       # working area excluding taskbar
                "is_primary": bool(monitor_info["Flags"] & win32con.MONITORINFOF_PRIMARY)
            })
    except Exception as e:
        log.error("Failed to query monitor layouts: %s", e)
        
    return monitors

def focus_window_hwnd(hwnd: int) -> bool:
    """
    Bring a window to the foreground robustly.
    """
    try:
        import win32gui
        import win32con
        
        # If iconic (minimized), restore it
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        else:
            win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
            
        # Try direct focus
        win32gui.SetForegroundWindow(hwnd)
        return True
    except Exception:
        # Alt-key focus workaround
        try:
            import win32com.client
            shell = win32com.client.Dispatch("WScript.Shell")
            shell.SendKeys('%')
            win32gui.SetForegroundWindow(hwnd)
            return True
        except Exception as e:
            log.debug("Alt key focus workaround failed: %s", e)
            
    # Attachment workaround
    try:
        import win32thread
        import win32process
        fg_hwnd = win32gui.GetForegroundWindow()
        fg_tid, _ = win32process.GetWindowThreadProcessId(fg_hwnd)
        cur_tid = win32thread.GetCurrentThreadId()
        if fg_tid != cur_tid:
            win32thread.AttachThreadInput(cur_tid, fg_tid, True)
            try:
                win32gui.SetForegroundWindow(hwnd)
                return True
            finally:
                win32thread.AttachThreadInput(cur_tid, fg_tid, False)
    except Exception as e:
        log.debug("Thread attachment focus failed: %s", e)
        
    return False

def tile_windows_layout(layout: str, app_names: list[str]) -> str:
    """
    Tile specified application windows on the primary monitor.
    Supported layouts: 'left_right', 'top_bottom', 'grid'
    """
    import win32gui
    import win32con
    
    # 1. Resolve hwnds for active apps
    hwnds = []
    missing = []
    for app in app_names:
        hwnd = app_state_detection(app)
        if hwnd:
            hwnds.append((app, hwnd))
        else:
            missing.append(app)
            
    if not hwnds:
        return f"Error: None of the specified apps are running ({', '.join(app_names)})"
        
    # 2. Get primary monitor bounds
    monitors = get_monitor_layouts()
    primary = next((m for m in monitors if m["is_primary"]), monitors[0] if monitors else None)
    if not primary:
        return "Error: Could not retrieve monitor information"
        
    rect = primary["work_rect"] # (left, top, right, bottom)
    w_left, w_top, w_right, w_bottom = rect
    w_width = w_right - w_left
    w_height = w_bottom - w_top
    
    num_windows = len(hwnds)
    layout = layout.lower().replace("_", "").replace("-", "")
    
    try:
        if layout == "leftright" or (num_windows == 2 and layout != "topbottom"):
            # Split horizontally (columns)
            col_width = w_width // num_windows
            for idx, (app, hwnd) in enumerate(hwnds):
                # Restore if minimized or maximized
                placement = win32gui.GetWindowPlacement(hwnd)
                if win32gui.IsIconic(hwnd) or placement[1] == win32con.SW_SHOWMAXIMIZED:
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                x = w_left + idx * col_width
                win32gui.MoveWindow(hwnd, x, w_top, col_width, w_height, True)
                focus_window_hwnd(hwnd)
            res = f"Tiled {num_windows} windows horizontally."
            
        elif layout == "topbottom":
            # Split vertically (rows)
            row_height = w_height // num_windows
            for idx, (app, hwnd) in enumerate(hwnds):
                placement = win32gui.GetWindowPlacement(hwnd)
                if win32gui.IsIconic(hwnd) or placement[1] == win32con.SW_SHOWMAXIMIZED:
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                y = w_top + idx * row_height
                win32gui.MoveWindow(hwnd, w_left, y, w_width, row_height, True)
                focus_window_hwnd(hwnd)
            res = f"Tiled {num_windows} windows vertically."
            
        elif layout == "grid":
            # Grid layout (splits 2x2 for 3-4 windows)
            cols = 2
            rows = (num_windows + 1) // 2
            cell_w = w_width // cols
            cell_h = w_height // rows
            for idx, (app, hwnd) in enumerate(hwnds):
                placement = win32gui.GetWindowPlacement(hwnd)
                if win32gui.IsIconic(hwnd) or placement[1] == win32con.SW_SHOWMAXIMIZED:
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                c = idx % cols
                r = idx // cols
                x = w_left + c * cell_w
                y = w_top + r * cell_h
                win32gui.MoveWindow(hwnd, x, y, cell_w, cell_h, True)
                focus_window_hwnd(hwnd)
            res = f"Tiled {num_windows} windows in a grid."
        else:
            return f"Error: Unsupported layout '{layout}'"
            
        if missing:
            res += f" Note: Apps not running: {', '.join(missing)}"
        return res
    except Exception as e:
        return f"Error tiling windows: {e}"

def position_window_on_monitor(app_name: str, monitor_idx: int, x: int = None, y: int = None, w: int = None, h: int = None) -> str:
    """
    Position a window on a specific monitor index.
    """
    import win32gui
    import win32con
    
    hwnd = app_state_detection(app_name)
    if not hwnd:
        return f"Error: App '{app_name}' is not running."
        
    monitors = get_monitor_layouts()
    if monitor_idx < 0 or monitor_idx >= len(monitors):
        return f"Error: Monitor index {monitor_idx} is out of range (total monitors: {len(monitors)})."
        
    mon = monitors[monitor_idx]
    m_left, m_top, m_right, m_bottom = mon["work_rect"]
    m_w = m_right - m_left
    m_h = m_bottom - m_top
    
    # Default bounds if not specified
    win_w = w if w is not None else m_w // 2
    win_h = h if h is not None else m_h // 2
    
    # Coordinates relative to the selected monitor's origin
    win_x = m_left + (x if x is not None else (m_w - win_w) // 2)
    win_y = m_top + (y if y is not None else (m_h - win_h) // 2)
    
    try:
        placement = win32gui.GetWindowPlacement(hwnd)
        if win32gui.IsIconic(hwnd) or placement[1] == win32con.SW_SHOWMAXIMIZED:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.MoveWindow(hwnd, win_x, win_y, win_w, win_h, True)
        focus_window_hwnd(hwnd)
        return f"Moved '{app_name}' to Monitor {monitor_idx+1} at coordinates ({win_x}, {win_y})."
    except Exception as e:
        return f"Error positioning window: {e}"

def manage_app_tabs(app_name: str, tab_action: str) -> str:
    """
    Manage tabs for a running application.
    Supported tab_actions: 'new_tab', 'close_tab', 'next_tab', 'prev_tab'
    """
    import win32gui
    import win32con
    import win32api
    import pyautogui
    import time
    
    hwnd = app_state_detection(app_name)
    if not hwnd:
        return f"Error: App '{app_name}' is not running."
        
    action_map = {
        "new_tab": ("t", ["ctrl", "t"]),
        "close_tab": ("w", ["ctrl", "w"]),
        "next_tab": ("\t", ["ctrl", "tab"]),
        "prev_tab": ("\t", ["ctrl", "shift", "tab"])
    }
    
    tab_action_lower = tab_action.lower().strip()
    if tab_action_lower not in action_map:
        return f"Error: Unsupported tab action '{tab_action}'"
        
    char_key, hotkeys = action_map[tab_action_lower]
    
    try:
        # Method 1: PostMessage directly to targeted window handle
        vk_char = ord(char_key.upper()) if isinstance(char_key, str) and len(char_key) == 1 else win32con.VK_TAB
        
        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_CONTROL, 0)
        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, vk_char, 0)
        time.sleep(0.02)
        win32gui.PostMessage(hwnd, win32con.WM_KEYUP, vk_char, 0)
        win32gui.PostMessage(hwnd, win32con.WM_KEYUP, win32con.VK_CONTROL, 0)
        
        # Fallback to active window method for apps that don't support direct message queue background keystrokes
        time.sleep(0.05)
        prev_hwnd = win32gui.GetForegroundWindow()
        if focus_window_hwnd(hwnd):
            time.sleep(0.1)
            pyautogui.hotkey(*hotkeys)
            time.sleep(0.1)
            if prev_hwnd and prev_hwnd != hwnd:
                try:
                    focus_window_hwnd(prev_hwnd)
                except Exception:
                    pass
        return f"Executed tab action '{tab_action}' on '{app_name}'."
    except Exception as e:
        return f"Error managing tabs for '{app_name}': {e}"
