import os
import sqlite3
import glob

local_appdata = os.environ.get("LOCALAPPDATA", "")
db_pattern = os.path.join(local_appdata, "Microsoft", "Windows", "Notifications", "wpndatabase.db")
db_paths = glob.glob(db_pattern)

if not db_paths:
    # Try searching recursively in that folder
    db_pattern_rec = os.path.join(local_appdata, "Microsoft", "Windows", "Notifications", "*", "wpndatabase.db")
    db_paths = glob.glob(db_pattern_rec)

if db_paths:
    db_path = db_paths[0]
    print(f"Found notification database: {db_path}")
    try:
        # Since the database is usually locked/in-use by Windows, we copy it to a temp file first to read it safely
        import shutil
        temp_db = "temp_wpndatabase.db"
        shutil.copy2(db_path, temp_db)
        
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        
        # List tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"Tables: {tables}")
        
        # Try to query notifications/notification data
        # Let's inspect 'Notification' table if it exists
        if "Notification" in tables:
            cursor.execute("PRAGMA table_info(Notification);")
            columns = [c[1] for c in cursor.fetchall()]
            print(f"Notification columns: {columns}")
            
            cursor.execute("SELECT * FROM Notification ORDER BY ExpiryTime DESC LIMIT 5;")
            rows = cursor.fetchall()
            print(f"Sample notifications: {len(rows)}")
            for row in rows:
                print(row)
        
        conn.close()
        os.remove(temp_db)
    except Exception as e:
        print(f"Error reading database: {e}")
else:
    print("Notification database not found.")
