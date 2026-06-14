import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_system_utilities():
    print("=" * 60)
    print("TESTING SYSTEM UTILITIES: BATTERY & RESOURCE MONITOR")
    print("=" * 60)
    
    # 1. Test battery status
    print("\n[Test 1] Executing action: get_battery_status")
    result_battery = execute({"action": "get_battery_status"})
    print("Result:")
    print(result_battery)
    assert "Battery Level" in result_battery or "No battery detected" in result_battery
    print("✓ get_battery_status verified successfully.")

    # 2. Test resource hogs
    print("\n[Test 2] Executing action: get_resource_hogs")
    result_hogs = execute({"action": "get_resource_hogs"})
    print("Result:")
    print(result_hogs)
    assert "Top 5 CPU Hogs:" in result_hogs
    assert "Top 5 RAM Hogs:" in result_hogs
    print("✓ get_resource_hogs verified successfully.")
    
    print("\n" + "=" * 60)
    print("ALL SYSTEM UTILITIES TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

