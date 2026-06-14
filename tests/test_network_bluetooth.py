import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_network_bluetooth():
    print("=" * 60)
    print("TESTING ADVANCED WIFI PROFILE & BLUETOOTH MANAGER")
    print("=" * 60)

    # 1. Test connect_wifi listing
    print("\n[Test 1] Executing connect_wifi without name (listing profiles)...")
    res1 = execute({"action": "connect_wifi"})
    print("Result:")
    print(res1)
    assert "User profiles" in res1 or "Available WiFi profiles" in res1
    print("✓ connect_wifi (listing) verified successfully.")

    # 2. Test manage_bluetooth listing
    print("\n[Test 2] Executing manage_bluetooth command 'list'...")
    res2 = execute({"action": "manage_bluetooth", "command": "list"})
    print("Result:")
    print(res2)
    assert "Bluetooth Devices" in res2 or "No active Bluetooth" in res2
    print("✓ manage_bluetooth (list) verified successfully.")

    print("\n" + "=" * 60)
    print("ALL WIFI & BLUETOOTH MANAGEMENT TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

