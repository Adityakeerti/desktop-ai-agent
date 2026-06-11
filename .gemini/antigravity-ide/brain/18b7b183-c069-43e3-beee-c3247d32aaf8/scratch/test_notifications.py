import sys
import os
try:
    import clr
    winmd_dir = r"C:\Windows\System32\WinMetadata"
    clr.AddReference(os.path.join(winmd_dir, "Windows.Foundation.winmd"))
    clr.AddReference(os.path.join(winmd_dir, "Windows.UI.winmd"))
    
    from Windows.UI.Notifications import UserNotificationListener
    print("Successfully imported UserNotificationListener!")
    
    listener = UserNotificationListener.Current
    print(f"Listener status: {listener.GetAccessStatus()}")
except Exception as e:
    print(f"Failed: {e}")
