import uiautomation as auto
import pyautogui
import time

pyautogui.hotkey('win', 'a')
time.sleep(1.5)

qs = auto.WindowControl(ClassName="ControlCenterWindow")
if not qs.Exists(1):
    print("No ControlCenterWindow. Trying other classes...")
    qs = auto.WindowControl(Name="Quick settings")
    if not qs.Exists(1):
        print("Could not find Quick settings window.")
        exit(1)

print("Found Quick Settings. Searching for Wi-Fi button...")

def walk(control, depth=0):
    if depth > 4: return
    for c in control.GetChildren():
        name = c.Name.lower()
        if "wi-fi" in name or "wlan" in name:
            print(f"[{depth}] Found candidate: Name='{c.Name}', Class='{c.ClassName}', ControlType='{c.ControlType}'")
            # Click the toggle (which is usually a Button)
            if c.ControlType == auto.ControlType.ButtonControl:
                c.Click(simulateMove=False)
                print("Clicked it!")
                return
        walk(c, depth + 1)

walk(qs)
pyautogui.press('esc')
