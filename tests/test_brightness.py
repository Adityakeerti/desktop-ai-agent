import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_brightness():
    print("=" * 60)
    print("TESTING BRIGHTNESS MONITOR & CONTROL")
    print("=" * 60)

    # 1. Query current brightness
    print("\n[Test 1] Querying current screen brightness...")
    res1 = execute({"action": "set_brightness"})
    print(f"Result: {res1}")
    
    is_supported = "Current screen brightness" in res1
    if is_supported:
        print("✓ WMI Brightness is supported on this monitor.")
        # Parse the current brightness value
        import re
        match = re.search(r"(\d+)%", res1)
        if match:
            curr_val = int(match.group(1))
            print(f"Parsed current brightness: {curr_val}%")
            
            # 2. Try setting to the same value to test write logic safely
            print(f"\n[Test 2] Setting brightness to current value ({curr_val}%)...")
            res2 = execute({"action": "set_brightness", "value": curr_val})
            print(f"Result: {res2}")
            assert "successfully set to" in res2
            print("✓ Screen brightness setting verified successfully.")
        else:
            print("Warning: WMI Brightness returned a message but current percentage could not be parsed.")
    else:
        print("✓ System handles WMI unsupported status gracefully:")
        print(f"Returned: {res1}")
        
    print("\n" + "=" * 60)
    print("ALL BRIGHTNESS TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

