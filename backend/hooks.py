import os
import sys
import time
import json
import shutil
import glob
import threading
import ctypes
from ctypes import wintypes
import xml.etree.ElementTree as ET
import sqlite3

# Import Win32 modules safely
import win32gui
import win32con
import win32api

import backend.safety as safety
import backend.memory as memory

_webview_window = None
_tray_icon_instance = None

def register_webview_window(win):
    global _webview_window
    _webview_window = win

def trigger_ui_refresh():
    if _webview_window:
        try:
            # Let React UI query settings again
            _webview_window.evaluate_js("if (window.onSettingsChanged) window.onSettingsChanged();")
        except Exception:
            pass

# ── 1. Startup on Boot Registry Hook ───────────────────────────────────────
def is_startup_enabled() -> bool:
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_READ
        )
        val, _ = winreg.QueryValueEx(key, "RAGE_Agent")
        winreg.CloseKey(key)
        return True
    except Exception:
        return False

def set_startup_enabled(enabled: bool):
    import winreg
    
    python_exe = sys.executable
    script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scripts", "run_webview.py"))
    cmd = f'"{python_exe}" "{script_path}"'
    
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        if enabled:
            winreg.SetValueEx(key, "RAGE_Agent", 0, winreg.REG_SZ, cmd)
        else:
            try:
                winreg.DeleteValue(key, "RAGE_Agent")
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[Startup] Error updating registry: {e}")

# ── 2. Summon Global Hotkey (Ctrl+Shift+Space) ──────────────────────────────
def summon_panel():
    hwnd = win32gui.FindWindow(None, "R.A.G.E. - Windows Automation Agent")
    if hwnd:
        fg = win32gui.GetForegroundWindow()
        if fg == hwnd and not win32gui.IsIconic(hwnd):
            # Already active: toggle hide/minimize
            win32gui.ShowWindow(hwnd, 6)  # SW_MINIMIZE
        else:
            # Not active/minimized: restore and focus
            win32gui.ShowWindow(hwnd, 9)  # SW_RESTORE
            win32gui.SetForegroundWindow(hwnd)

def start_summon_hotkey_listener():
    def listener():
        user32 = ctypes.windll.user32
        HOTKEY_ID_SUMMON = 103
        MOD_CONTROL = 0x0002
        MOD_SHIFT = 0x0004
        VK_SPACE = 0x20  # Space key
        
        # Register Ctrl+Shift+Space
        if not user32.RegisterHotKey(None, HOTKEY_ID_SUMMON, MOD_CONTROL | MOD_SHIFT, VK_SPACE):
            print("[Summon] Failed to register global hotkey Ctrl+Shift+Space")
            return
            
        try:
            msg = wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
                if msg.message == 0x0312:  # WM_HOTKEY
                    if msg.wParam == HOTKEY_ID_SUMMON:
                        summon_panel()
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
        finally:
            user32.UnregisterHotKey(None, HOTKEY_ID_SUMMON)
            
    t = threading.Thread(target=listener, daemon=True)
    t.start()

# ── 3. System Tray Icon ───────────────────────────────────────────────────
class RAGETrayIcon:
    def __init__(self, summon_cb, exit_cb):
        self.summon_cb = summon_cb
        self.exit_cb = exit_cb
        self.hwnd = None
        self.notify_id = None
        
        # Setup window class for tray events
        wnd_class = win32gui.WNDCLASS()
        wnd_class.lpfnWndProc = self.wnd_proc
        wnd_class.lpszClassName = "RAGE_TrayClass"
        wnd_class.hInstance = win32gui.GetModuleHandle(None)
        
        try:
            self.class_atom = win32gui.RegisterClass(wnd_class)
        except Exception:
            pass
            
        self.hwnd = win32gui.CreateWindow(
            "RAGE_TrayClass", "RAGE_TrayWindow",
            0, 0, 0, 0, 0,
            0, 0, wnd_class.hInstance, None
        )
        win32gui.UpdateWindow(self.hwnd)
        
        self.notify_id = (
            self.hwnd,
            0,
            win32gui.NIF_ICON | win32gui.NIF_MESSAGE | win32gui.NIF_TIP,
            win32con.WM_USER + 20,
            win32gui.LoadIcon(0, win32con.IDI_APPLICATION),
            "R.A.G.E. - Windows Automation Agent"
        )
        win32gui.Shell_NotifyIcon(win32gui.NIM_ADD, self.notify_id)
        
    def wnd_proc(self, hwnd, msg, wparam, lparam):
        if msg == win32con.WM_DESTROY:
            win32gui.Shell_NotifyIcon(win32gui.NIM_DELETE, self.notify_id)
        elif msg == win32con.WM_USER + 20:
            if lparam == win32con.WM_RBUTTONUP:
                self.show_menu()
            elif lparam == win32con.WM_LBUTTONDBLCLK or lparam == win32con.WM_LBUTTONUP:
                self.summon_cb()
        return win32gui.DefWindowProc(hwnd, msg, wparam, lparam)
        
    def show_menu(self):
        menu = win32gui.CreatePopupMenu()
        
        # Check current options
        sandbox_state = win32con.MF_CHECKED if safety.is_sandbox_active() else win32con.MF_UNCHECKED
        startup_state = win32con.MF_CHECKED if is_startup_enabled() else win32con.MF_UNCHECKED
        
        win32gui.AppendMenu(menu, win32con.MF_STRING, 1, "Summon RAGE Panel")
        win32gui.AppendMenu(menu, win32con.MF_STRING | sandbox_state, 2, "Sandbox (Dry-Run) Mode")
        win32gui.AppendMenu(menu, win32con.MF_STRING | startup_state, 3, "Start RAGE on Boot")
        win32gui.AppendMenu(menu, win32con.MF_SEPARATOR, 0, "")
        win32gui.AppendMenu(menu, win32con.MF_STRING, 4, "Shutdown Agent")
        
        pos = win32gui.GetCursorPos()
        win32gui.SetForegroundWindow(self.hwnd)
        cmd = win32gui.TrackPopupMenu(
            menu, win32con.TPM_LEFTALIGN | win32con.TPM_RIGHTBUTTON | win32con.TPM_RETURNCMD,
            pos[0], pos[1], 0, self.hwnd, None
        )
        
        if cmd == 1:
            self.summon_cb()
        elif cmd == 2:
            safety.set_sandbox_mode(not safety.is_sandbox_active())
            trigger_ui_refresh()
        elif cmd == 3:
            set_startup_enabled(not is_startup_enabled())
            trigger_ui_refresh()
        elif cmd == 4:
            self.exit_cb()

def start_tray_icon(summon_cb, exit_cb):
    global _tray_icon_instance
    def tray_thread():
        global _tray_icon_instance
        _tray_icon_instance = RAGETrayIcon(summon_cb, exit_cb)
        
        # Run tray message loop
        win32gui.PumpMessages()
            
    t = threading.Thread(target=tray_thread, daemon=True)
    t.start()

# ── 4. Clipboard Watcher Hook ──────────────────────────────────────────────
def start_clipboard_watcher():
    def watcher():
        import pyperclip
        last_clip = ""
        try:
            last_clip = pyperclip.paste()
        except Exception:
            pass
            
        while True:
            time.sleep(1.5)
            if not _webview_window:
                continue
                
            try:
                current_clip = pyperclip.paste()
                if current_clip and current_clip != last_clip:
                    last_clip = current_clip
                    trimmed = current_clip.strip()
                    is_url = trimmed.startswith("http://") or trimmed.startswith("https://") or trimmed.startswith("www.")
                    is_path = os.path.exists(trimmed)
                    
                    if is_url or is_path:
                        payload = {
                            "text": trimmed,
                            "type": "url" if is_url else "path"
                        }
                        js_code = f"if (window.onClipboardNotification) window.onClipboardNotification({json.dumps(payload)});"
                        _webview_window.evaluate_js(js_code)
            except Exception:
                pass
                
    t = threading.Thread(target=watcher, daemon=True)
    t.start()

# ── 5. Downloads File Watcher Hook ─────────────────────────────────────────
def start_file_watcher():
    def watcher():
        downloads_dir = os.path.expanduser("~/Downloads")
        if not os.path.exists(downloads_dir):
            return
            
        try:
            last_files = set(os.listdir(downloads_dir))
        except Exception:
            last_files = set()
            
        ORG_MAPPING = {
            ".png": "Images", ".jpg": "Images", ".jpeg": "Images", ".gif": "Images", ".bmp": "Images", ".svg": "Images",
            ".pdf": "Documents", ".docx": "Documents", ".doc": "Documents", ".xlsx": "Documents", ".pptx": "Documents", ".txt": "Documents", ".csv": "Documents",
            ".zip": "Archives", ".rar": "Archives", ".7z": "Archives", ".tar": "Archives", ".gz": "Archives",
            ".exe": "Installers", ".msi": "Installers",
            ".py": "Code", ".js": "Code", ".ts": "Code", ".html": "Code", ".css": "Code", ".json": "Code"
        }
        
        while True:
            time.sleep(5.0)
            if not _webview_window or not os.path.exists(downloads_dir):
                continue
                
            try:
                current_files = set(os.listdir(downloads_dir))
                new_files = current_files - last_files
                last_files = current_files
                
                for f in new_files:
                    full_path = os.path.join(downloads_dir, f)
                    if os.path.isdir(full_path):
                        continue
                        
                    ext = os.path.splitext(f)[1].lower()
                    if ext in ORG_MAPPING:
                        folder_name = ORG_MAPPING[ext]
                        target_dir = os.path.join(downloads_dir, folder_name)
                        os.makedirs(target_dir, exist_ok=True)
                        target_path = os.path.join(target_dir, f)
                        
                        # Move file safely
                        shutil.move(full_path, target_path)
                        last_files.discard(f)
                        last_files.add(os.path.join(folder_name, f))
                        
                        payload = {
                            "filename": f,
                            "category": folder_name,
                            "destination": target_dir.replace("\\", "/")
                        }
                        js_code = f"if (window.onFileOrganized) window.onFileOrganized({json.dumps(payload)});"
                        _webview_window.evaluate_js(js_code)
            except Exception:
                pass
                
    t = threading.Thread(target=watcher, daemon=True)
    t.start()

# ── 6. Toast Notification Listener Hook ───────────────────────────────────
def start_notifications_watcher():
    def watcher():
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        db_pattern = os.path.join(local_appdata, "Microsoft", "Windows", "Notifications", "wpndatabase.db")
        
        def get_db_path():
            paths = glob.glob(db_pattern)
            if not paths:
                db_pattern_rec = os.path.join(local_appdata, "Microsoft", "Windows", "Notifications", "*", "wpndatabase.db")
                paths = glob.glob(db_pattern_rec)
            return paths[0] if paths else None
            
        db_path = get_db_path()
        if not db_path:
            return
            
        last_max_order = 0
        try:
            temp_db = os.path.join(os.path.dirname(db_path), "temp_wpn_init.db")
            shutil.copy2(db_path, temp_db)
            conn = sqlite3.connect(temp_db)
            c = conn.cursor()
            c.execute("SELECT MAX([Order]) FROM Notification")
            row = c.fetchone()
            last_max_order = row[0] if row and row[0] is not None else 0
            conn.close()
            os.remove(temp_db)
        except Exception:
            pass
            
        while True:
            time.sleep(3.0)
            if not _webview_window:
                continue
                
            db_path = get_db_path()
            if not db_path:
                continue
                
            temp_db = os.path.join(os.path.dirname(db_path), "temp_wpn.db")
            try:
                shutil.copy2(db_path, temp_db)
                conn = sqlite3.connect(temp_db)
                c = conn.cursor()
                
                query = """
                SELECT N.[Order], H.PrimaryId, N.Payload
                FROM Notification N
                JOIN NotificationHandler H ON N.HandlerId = H.RecordId
                WHERE N.Type = 'toast' AND N.[Order] > ?
                ORDER BY N.[Order] ASC;
                """
                c.execute(query, (last_max_order,))
                rows = c.fetchall()
                
                for order, app_id, payload in rows:
                    last_max_order = max(last_max_order, order)
                    texts = []
                    if isinstance(payload, bytes):
                        try:
                            xml_data = payload.decode('utf-8', errors='replace')
                            start = xml_data.find('<toast')
                            if start != -1:
                                xml_data = xml_data[start:]
                            root = ET.fromstring(xml_data)
                            texts = [t.text for t in root.findall('.//text') if t.text]
                        except Exception:
                            pass
                            
                    clean_app = app_id.split("!")[-1].split("_")[0] if "!" in app_id else app_id
                    
                    if texts:
                        title = texts[0]
                        body = texts[1] if len(texts) > 1 else ""
                        
                        payload_data = {
                            "app": clean_app,
                            "title": title,
                            "body": body
                        }
                        js_code = f"if (window.onWindowsNotification) window.onWindowsNotification({json.dumps(payload_data)});"
                        _webview_window.evaluate_js(js_code)
                        
                conn.close()
                os.remove(temp_db)
            except Exception:
                if os.path.exists(temp_db):
                    try:
                        os.remove(temp_db)
                    except Exception:
                        pass
                        
    t = threading.Thread(target=watcher, daemon=True)
    t.start()
