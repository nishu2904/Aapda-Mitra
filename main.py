from fastapi import FastAPI, HTTPException, File, UploadFile
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime, timezone
import os
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Aapad Mitra Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # later you can restrict to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
def root():
    return {"message": "Aapad Mitra Backend is running ✅"}

# -------------------- SETUP --------------------

# Folder to store videos/voice clips
MEDIA_FOLDER = "media"
os.makedirs(MEDIA_FOLDER, exist_ok=True)

# -------------------- DATA MODELS --------------------

class Message(BaseModel):
    sender: str              # "victim" or "rescue"
    text: str
    timestamp: str

class Media(BaseModel):
    filename: str
    sender: str              # "victim" or "rescue"
    timestamp: str
    type: str                # "video" or "voice"

class SOSRequest(BaseModel):
    user_id: Optional[str] = None
    name: Optional[str] = None
    latitude: float
    longitude: float
    emergency_type: str      # critical / medium / low
    severity: Optional[str] = None
    priority_color: Optional[str] = None
    messages: List[Message] = []
    media: List[Media] = []
    assigned_shelter: Optional[dict] = None
    timestamp: Optional[str] = None

# -------------------- STORAGE --------------------

sos_requests: List[dict] = []

# Mock shelters (acceptable for floods)
shelters = [
    {"id": "S1", "name": "Govt School Shelter", "lat": 12.9716, "lng": 77.5946, "capacity": 100, "occupied": 0},
    {"id": "S2", "name": "Community Hall Shelter", "lat": 12.9750, "lng": 77.6000, "capacity": 80, "occupied": 0}
]

# Mock blocked roads
blocked_roads = [
    {"lat": 12.9725, "lng": 77.5960, "reason": "Flooded road"},
    {"lat": 12.9740, "lng": 77.5980, "reason": "Collapsed bridge"}
]

# -------------------- HELPERS --------------------

def get_priority_color(emergency_type: str):
    if emergency_type.lower() == "critical":
        return "red"
    elif emergency_type.lower() == "medium":
        return "yellow"
    return "green"

def assign_shelter():
    for shelter in shelters:
        if shelter["occupied"] < shelter["capacity"]:
            shelter["occupied"] += 1
            return shelter
    return None

# -------------------- ENDPOINTS --------------------

@app.post("/send_sos")
def send_sos(request: SOSRequest):
    if not request.user_id:
        request.user_id = str(uuid.uuid4())

    if not request.name:
        request.name = "Anonymous"

    request.priority_color = get_priority_color(request.emergency_type)
    request.timestamp = datetime.now(timezone.utc).isoformat()

    shelter = assign_shelter()
    request.assigned_shelter = shelter

    sos_requests.append(request.model_dump())

    return {
        "message": "SOS received successfully",
        "user_id": request.user_id,
        "assigned_shelter": shelter,
        "priority": request.priority_color
    }

# --------------------

@app.get("/get_active_sos")
def get_active_sos():
    return {"active_sos": sos_requests}

# --------------------

@app.post("/update_location")
def update_location(user_id: str, latitude: float, longitude: float):
    for sos in sos_requests:
        if sos["user_id"] == user_id:
            sos["latitude"] = latitude
            sos["longitude"] = longitude
            sos["timestamp"] = datetime.now(timezone.utc).isoformat()
            return {"message": "Location updated"}
    raise HTTPException(status_code=404, detail="SOS not found")

# --------------------

@app.post("/send_message")
def send_message(user_id: str, sender: str, text: str):
    for sos in sos_requests:
        if sos["user_id"] == user_id:
            sos["messages"].append({
                "sender": sender,
                "text": text,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            return {"message": "Message sent"}
    raise HTTPException(status_code=404, detail="SOS not found")

# --------------------

@app.post("/upload_media")
async def upload_media(
    user_id: str,
    sender: str,
    media_type: str,
    file: UploadFile = File(...)
):
    timestamp = datetime.now(timezone.utc).isoformat()
    extension = file.filename.split(".")[-1]
    filename = f"{user_id}_{media_type}_{timestamp}.{extension}"
    filepath = os.path.join(MEDIA_FOLDER, filename)

    with open(filepath, "wb") as f:
        f.write(await file.read())

    for sos in sos_requests:
        if sos["user_id"] == user_id:
            sos["media"].append({
                "filename": filename,
                "sender": sender,
                "timestamp": timestamp,
                "type": media_type
            })
            return {"message": f"{media_type} uploaded"}

    raise HTTPException(status_code=404, detail="SOS not found")

# --------------------

@app.post("/update_severity")
def update_severity(user_id: str, severity: str):
    for sos in sos_requests:
        if sos["user_id"] == user_id:
            sos["severity"] = severity
            sos["priority_color"] = get_priority_color(severity)
            return {"message": "Severity updated"}
    raise HTTPException(status_code=404, detail="SOS not found")

# --------------------

@app.post("/resolve_sos")
def resolve_sos(user_id: str):
    for sos in sos_requests:
        if sos["user_id"] == user_id:
            if sos["assigned_shelter"]:
                for s in shelters:
                    if s["id"] == sos["assigned_shelter"]["id"]:
                        s["occupied"] -= 1
            sos_requests.remove(sos)
            return {"message": "SOS resolved"}
    raise HTTPException(status_code=404, detail="SOS not found")

# --------------------

@app.get("/get_nearby_resources")
def get_nearby_resources(lat: float, lng: float):
    """
    Frontend uses Google Maps & Places API with this data
    """
    return {
        "blocked_roads": blocked_roads,
        "shelters": shelters,
        "note": "Frontend uses Google Maps API for real hospitals, stores & routing"
    }
@app.get("/")
def root():
    return {"message": "Jal Rakshak Backend is running ✅"}
