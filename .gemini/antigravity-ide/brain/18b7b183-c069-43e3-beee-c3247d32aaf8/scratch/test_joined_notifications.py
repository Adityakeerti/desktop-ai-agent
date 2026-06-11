import os
import sqlite3
import shutil
import glob
import xml.etree.ElementTree as ET

local_appdata = os.environ.get("LOCALAPPDATA", "")
db_pattern = os.path.join(local_appdata, "Microsoft", "Windows", "Notifications", "wpndatabase.db")
db_paths = glob.glob(db_pattern)
if not db_paths:
    db_pattern_rec = os.path.join(local_appdata, "Microsoft", "Windows", "Notifications", "*", "wpndatabase.db")
    db_paths = glob.glob(db_pattern_rec)

if db_paths:
    db_path = db_paths[0]
    temp_db = "temp_wpndatabase.db"
    shutil.copy2(db_path, temp_db)
    
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    
    query = """
    SELECT N.[Order], N.ArrivalTime, H.PrimaryId, N.Payload
    FROM Notification N
    JOIN NotificationHandler H ON N.HandlerId = H.RecordId
    WHERE N.Type = 'toast'
    ORDER BY N.[Order] DESC LIMIT 5;
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    print(f"Latest {len(rows)} notifications:")
    for order, arrival_time, app_id, payload in rows:
        payload_str = ""
        if isinstance(payload, bytes):
            try:
                xml_data = payload.decode('utf-8', errors='replace')
                start = xml_data.find('<toast')
                if start != -1:
                    xml_data = xml_data[start:]
                root = ET.fromstring(xml_data)
                texts = [t.text for t in root.findall('.//text') if t.text]
                payload_str = " | ".join(texts)
            except Exception as parse_err:
                payload_str = f"(Parse error: {parse_err}) {payload[:200]}"
        else:
            payload_str = str(payload)
            
        print(f"Order: {order} | Time: {arrival_time} | App: {app_id} | Payload: {payload_str}")
        
    conn.close()
    os.remove(temp_db)
else:
    print("Notification database not found.")
