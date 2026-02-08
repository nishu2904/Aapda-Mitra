
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from datetime import timedelta
import uuid
import os
import json
import math

print("✅ LOADED back.py (FINAL)")

app = FastAPI(title="Aapad Mitra Backend (FINAL)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEDIA_FOLDER = "media"
os.makedirs(MEDIA_FOLDER, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_FOLDER), name="media")

DB_FILE = "db.json"

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def load_db() -> Dict[str, Any]:
    if not os.path.exists(DB_FILE):
        return {"sos_requests": []}
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {"sos_requests": []}

def save_db(db: Dict[str, Any]):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

db = load_db()


RATE_LIMIT_SECONDS = 120
last_sos_by_device: Dict[str, str] = {}  # device_id -> iso timestamp

class SOSRequestIn(BaseModel):
    device_id: str
    name: Optional[str] = None
    latitude: float
    longitude: float
    emergency_type: str
    severity: str
    people: int = 1
    note: Optional[str] = None


class LiveLoc(BaseModel):
    user_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None

class IdPayload(BaseModel):
    user_id: str

def find_sos(user_id: str):
    for sos in db["sos_requests"]:
        if sos.get("user_id") == user_id:
            return sos
    return None

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    d1 = math.radians(lat2 - lat1)
    d2 = math.radians(lon2 - lon1)
    a = math.sin(d1/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(d2/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def find_nearby_cluster(lat, lng, radius_m=50):
    for sos in db["sos_requests"]:
        if sos.get("status") == "RESOLVED":
            continue
        clat = sos.get("cluster_lat", sos["latitude"])
        clng = sos.get("cluster_lng", sos["longitude"])
        if haversine_m(lat, lng, clat, clng) <= radius_m:
            return sos.get("cluster_id", sos["user_id"])
    return None

@app.get("/")
def root():
    return {"message": "Backend running ✅ (FINAL)"}

@app.post("/send_sos")
def send_sos(req: SOSRequestIn):
    now = datetime.now(timezone.utc)

    # ✅ RATE LIMIT CHECK (2 minutes per device)
    last_iso = last_sos_by_device.get(req.device_id)
    if last_iso:
        last_time = datetime.fromisoformat(last_iso)
        if now - last_time < timedelta(seconds=RATE_LIMIT_SECONDS):
            remaining = RATE_LIMIT_SECONDS - int((now - last_time).total_seconds())
            raise HTTPException(status_code=429, detail=f"Wait {remaining}s before sending SOS again")

    # ✅ update last SOS time
    last_sos_by_device[req.device_id] = now.isoformat()

    # ✅ create SOS normally
    user_id = str(uuid.uuid4())

    sos_obj = {
        "user_id": user_id,
        "device_id": req.device_id,
        "name": req.name or "Anonymous",
        "latitude": req.latitude,
        "longitude": req.longitude,
        "accuracy": None,
        "emergency_type": req.emergency_type,
        "severity": req.severity,
        "people": req.people,
        "note": req.note or "",
        "status": "NEW",
        "timestamp": now_iso(),
        "media": []
    }

    db["sos_requests"].append(sos_obj)
    save_db(db)

    return {"message": "SOS created", "user_id": user_id}


@app.get("/get_active_sos")
def get_active_sos():
    return {"active_sos": db["sos_requests"]}

@app.post("/update_location_live")
def update_location_live(body: LiveLoc):
    sos = find_sos(body.user_id)
    if not sos:
        raise HTTPException(status_code=404, detail="SOS not found")

    sos["latitude"] = body.latitude
    sos["longitude"] = body.longitude
    sos["accuracy"] = body.accuracy
    sos["timestamp"] = now_iso()
    save_db(db)
    return {"message": "Live location updated"}

@app.post("/upload_media")
async def upload_media(user_id: str, sender: str, media_type: str, file: UploadFile = File(...)):
    sos = find_sos(user_id)
    if not sos:
        raise HTTPException(status_code=404, detail="SOS not found")

    ts = now_iso().replace(":", "-")
    ext = file.filename.split(".")[-1] if "." in file.filename else "webm"
    filename = f"{user_id}_{media_type}_{ts}.{ext}"
    filepath = os.path.join(MEDIA_FOLDER, filename)

    data = await file.read()
    with open(filepath, "wb") as f:
        f.write(data)

    sos["media"].append({
        "type": media_type,
        "filename": filename,
        "url": f"/media/{filename}",
        "sender": sender,
        "timestamp": now_iso()
    })
    sos["timestamp"] = now_iso()
    save_db(db)
    return {"message": "Uploaded", "filename": filename, "url": f"/media/{filename}"}

@app.post("/accept_sos")
def accept_sos(payload: IdPayload):
    sos = find_sos(payload.user_id)
    if not sos:
        raise HTTPException(status_code=404, detail="SOS not found")
    sos["status"] = "ACCEPTED"
    sos["timestamp"] = now_iso()
    save_db(db)
    return {"message": "Accepted"}

@app.post("/resolve_sos")
def resolve_sos(payload: IdPayload):
    sos = find_sos(payload.user_id)
    if not sos:
        raise HTTPException(status_code=404, detail="SOS not found")

    # remove the SOS completely (so dashboard won’t show it)
    db["sos_requests"] = [x for x in db["sos_requests"] if x.get("user_id") != payload.user_id]
    save_db(db)

    return {"message": "Resolved + removed from active list"}
