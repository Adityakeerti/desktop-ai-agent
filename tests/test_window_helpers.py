import sys
import os

# Add project root to sys.path so we can import backend packages
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.utils.window_utils import get_visible_windows, get_monitor_layouts, app_state_detection

def test_window_helpers():
    print("=" * 60)
    print("TESTING WINDOW HELPERS")
    print("=" * 60)
    
    # 1. Test Monitor Layouts
    monitors = get_monitor_layouts()
    print(f"\nFound {len(monitors)} monitor(s):")
    for i, mon in enumerate(monitors):
        print(f"  Monitor {i+1}:")
        print(f"    Handle: {mon['handle']}")
        print(f"    Bounds: {mon['monitor_rect']}")
        print(f"    Work Area: {mon['work_rect']}")
        print(f"    Is Primary: {mon['is_primary']}")
        
    # 2. Test Visible Windows
    windows = get_visible_windows()
    print(f"\nFound {len(windows)} visible windows:")
    for w in windows[:15]: # print first 15 to avoid clutter
        print(f"  - [{w['process_name']}] '{w['title']}' (PID: {w['pid']}), Rect: {w['rect']}")
        
    if len(windows) > 15:
        print(f"  ... and {len(windows) - 15} more.")
        
    # 3. Test App State Detection (common apps)
    print("\nTesting App State Detection:")
    for app in ["cmd", "explorer", "chrome", "notepad"]:
        hwnd = app_state_detection(app)
        status = f"FOUND (hwnd: {hwnd})" if hwnd else "NOT RUNNING"
        print(f"  - {app}: {status}")
        
    print("=" * 60)

