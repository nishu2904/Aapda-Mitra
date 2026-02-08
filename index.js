const API_BASE = "http://127.0.0.1:8000";

const sosBtn = document.getElementById("sosBtn");
const cancelBtn = document.getElementById("cancelBtn");

const home = document.getElementById("home");
const statusCard = document.getElementById("status");
const statusTitle = document.getElementById("statusTitle");
const statusMsg = document.getElementById("statusMsg");
const note = document.getElementById("note");

let abortSOS = false;
let watchId = null;
let liveTimer = null;
let userId = null;

function showStatus(t, m){
  home.classList.add("hidden");
  statusCard.classList.remove("hidden");
  statusTitle.textContent = t;
  statusMsg.textContent = m;
}

cancelBtn.onclick = async () => {
  abortSOS = true;

  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (liveTimer != null) {
    clearInterval(liveTimer);
    liveTimer = null;
  }

  showStatus("Cancelled", "SOS stopped on this device.");
  setTimeout(() => {
    statusCard.classList.add("hidden");
    home.classList.remove("hidden");
  }, 1200);
};

async function postJSON(url, body){
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : {};
}


async function uploadVideo(userId, blob){
  const fd = new FormData();
  fd.append("file", blob, "sos_15s.webm");
  const url = `${API_BASE}/upload_media?user_id=${encodeURIComponent(userId)}&sender=victim&media_type=video`;
  const res = await fetch(url, { method:"POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

function startLiveLocation(userId){
  if (!navigator.geolocation) throw new Error("Geolocation not supported");

  // Watch location continuously (best for "live")
  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      if (abortSOS) return;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Send live location to backend
      try {
        await postJSON(`${API_BASE}/update_location_live`, {
          user_id: userId,
          latitude: lat,
          longitude: lng,
          accuracy: pos.coords.accuracy
        });
      } catch(e){}
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );

  // Also send every 5s (backup if watchPosition updates are slow)
  liveTimer = setInterval(async () => {
    if (abortSOS) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      try {
        await postJSON(`${API_BASE}/update_location_live`, {
          user_id: userId,
          latitude: lat,
          longitude: lng,
          accuracy: pos.coords.accuracy
        });
      } catch(e){}
    });
  }, 5000);
}

async function record15SecondsVideo(){
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: true
  });

  let options = {};
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
    options.mimeType = "video/webm;codecs=vp8,opus";
  } else if (MediaRecorder.isTypeSupported("video/webm")) {
    options.mimeType = "video/webm";
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

  // timeslice forces data every 1s (prevents 1–2 sec files)
  rec.start(1000);

  await new Promise(r => setTimeout(r, 15000));
  rec.stop();

  await stopped;

  // IMPORTANT: ask recorder for any last chunk (some browsers need it)
  try { rec.requestData(); } catch(e) {}

  // Build blob first, THEN stop tracks
  const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });

  stream.getTracks().forEach(t => t.stop());

  // sanity check
  if (blob.size < 50 * 1024) {
    throw new Error("Recorded video too small. Permissions/codec/background tab issue.");
  }

  return blob;
}


async function getFirstFix(){
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

sosBtn.onclick = async () => {
  abortSOS = false;
  note.textContent = "";

  try {
    showStatus("Sending SOS…", "Starting live location + recording 15s video…");

    // Start recording immediately (same click)
    const videoPromise = record15SecondsVideo();

    // Get first GPS fix for creating SOS
    const first = await getFirstFix();
    if (abortSOS) return;

    // Create SOS (backend returns user_id)
    const created = await postJSON(`${API_BASE}/send_sos`, {
      name: "Anonymous",
      latitude: first.lat,
      longitude: first.lng,
      emergency_type: "critical",
      severity: "CRITICAL",
      people: 1,
      note: "Auto SOS: live location + 15s video"
    });

    userId = created.user_id;
    note.textContent = `SOS ID: ${userId}`;

    if (abortSOS) return;

    // Start live location updates (continuous)
    startLiveLocation(userId);

    // Upload video when recording completes
    let blob = null;
    try { blob = await videoPromise; } catch(e) { blob = null; }

    if (abortSOS) return;

    if (blob) {
      await uploadVideo(userId, blob);
      showStatus("✅ SOS Sent", "Live location is running + 15s video uploaded to rescue team.");
    } else {
      showStatus("✅ SOS Sent (No Video)", "Live location is running. Video failed (permission denied/unsupported).");
    }

  } catch (e) {
    showStatus("❌ SOS Failed", String(e.message || e));
  }
};
