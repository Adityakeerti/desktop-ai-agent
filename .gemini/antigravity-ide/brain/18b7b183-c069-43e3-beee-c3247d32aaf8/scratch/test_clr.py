import sys
try:
    import clr
    print("pythonnet clr imported successfully!")
except Exception as e:
    print(f"Failed to import clr: {e}")
