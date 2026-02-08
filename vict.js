const API_BASE = "http://127.0.0.1:8000";

const sosBtn = document.getElementById("sosBtn");
const cancelBtn = document.getElementById("cancelBtn");

const home = document.getElementById("home");
const statusCard = document.getElementById("status");
const statusTitle = document.getElementById("statusTitle");
const statusMsg = document.getElementById("statusMsg");
const note = document.getElementById("note");

let abortSOS = false;
let userId = null;
let watchId = null;
let liveTimer = null;

const COOLDOWN_MS = 2 * 60 * 1000;
const LAST_SOS_KEY = "last_sos_time_ms";

const DEVICE_KEY = "device_id";
let deviceId = localStorage.getItem(DEVICE_KEY);
if (!deviceId) {
  deviceId = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, deviceId);
}

function showStatus(t, m){
  home.classList.add("hidden");
  statusCard.classList.remove("hidden");
  statusTitle.textContent = t;
  statusMsg.textContent = m;
}

async function postJSON(url, body){
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt);
  return txt ? JSON.parse(txt) : {};
}

async function uploadVideo(uid, blob){
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const fd = new FormData();
  fd.append("file", blob, `sos_15s.${ext}`);

  const url = `${API_BASE}/upload_media?user_id=${encodeURIComponent(uid)}&sender=victim&media_type=video`;
  const res = await fetch(url, { method:"POST", body: fd });

  const txt = await res.text();
  if (!res.ok) throw new Error(txt);
  return txt ? JSON.parse(txt) : {};
}

function startLiveLocation(uid){
  if (!navigator.geolocation) throw new Error("Geolocation not supported");

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      if (abortSOS) return;
      try {
        await postJSON(`${API_BASE}/update_location_live`, {
          user_id: uid,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      } catch(e) {}
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );

  liveTimer = setInterval(() => {
    if (abortSOS) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      if (abortSOS) return;
      try {
        await postJSON(`${API_BASE}/update_location_live`, {
          user_id: uid,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      } catch(e) {}
    });
  }, 5000);
}

async function record15SecondsVideo(){
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported");
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder not supported");

  const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });

  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  let options = {};
  for (const c of candidates){
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)){
      options = { mimeType: c };
      break;
    }
  }

  const chunks = [];
  const rec = new MediaRecorder(stream, options);

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise((resolve, reject) => {
    rec.onerror = () => reject(new Error("MediaRecorder error"));
    rec.onstop = () => resolve();
  });

  rec.start(1000);                 // ✅ timeslice
  await new Promise(r => setTimeout(r, 15000));
  rec.stop();
  await stopped;

  const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
  stream.getTracks().forEach(t => t.stop());

  console.log("Video size (bytes):", blob.size);

  if (!blob || blob.size < 200000) {
    throw new Error("Video too small → permissions/background/codec issue");
  }
  return blob;
}

function getFirstFix(){
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  });
}

cancelBtn.onclick = () => {
  abortSOS = true;
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  if (liveTimer != null) clearInterval(liveTimer);

  showStatus("Stopped", "SOS stopped.");
  setTimeout(() => location.reload(), 1200);
};

// ✅ ONLY inside click
sosBtn.onclick = async () => {

  const last = Number(localStorage.getItem(LAST_SOS_KEY) || "0");
  const now = Date.now();
  const remaining = COOLDOWN_MS - (now - last);

  if (remaining > 0) {
    const sec = Math.ceil(remaining / 1000);
    alert(`Please wait ${sec}s before sending SOS again.`);
    return;
  }

  localStorage.setItem(LAST_SOS_KEY, String(now));
  sosBtn.disabled = true;
  setTimeout(() => { sosBtn.disabled = false; }, COOLDOWN_MS);

  abortSOS = false;
  note.textContent = "";
  userId = null;

  try {
    showStatus("Sending SOS…", "Starting recording + GPS…");

    const videoPromise = record15SecondsVideo();

    const pos = await getFirstFix();
    if (abortSOS) return;

    const created = await postJSON(`${API_BASE}/send_sos`, {
      device_id: deviceId,
      name: "Anonymous",
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      emergency_type: "critical",
      severity: "CRITICAL",
      people: 1,
      note: "Auto SOS: live location + 15s video"
    });

    userId = created.user_id;
    note.textContent = `SOS ID: ${userId}`;
    statusMsg.textContent = "SOS created. Live location started. Waiting for video…";

    startLiveLocation(userId);

    const blob = await videoPromise;
    if (abortSOS) return;

    const up = await uploadVideo(userId, blob);
    statusMsg.textContent = `✅ Video uploaded: ${up.filename || "uploaded"}`;

    showStatus("✅ SOS Active", "Live location running + video uploaded.");

  } catch (e) {
    showStatus("❌ Failed", String(e.message || e));
  }
};
