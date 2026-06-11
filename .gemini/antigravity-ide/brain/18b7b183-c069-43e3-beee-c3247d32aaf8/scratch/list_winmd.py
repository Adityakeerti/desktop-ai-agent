import os
winmetadata_dir = r"C:\Windows\System32\WinMetadata"
if os.path.exists(winmetadata_dir):
    print("Files in WinMetadata:")
    for f in os.listdir(winmetadata_dir):
        print(f"  {f}")
else:
    print("WinMetadata directory does not exist")
