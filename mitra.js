speechSynthesis.getVoices()

const home = document.querySelector(".container")
const sosBtn = document.getElementById("sosBtn")
const form = document.getElementById("formScreen")
const status = document.getElementById("status")
const langSelect = document.getElementById("languageSelect")

const submitBtn = document.getElementById("submitBtn")
const voiceBtn = document.getElementById("voiceBtn")

const mapBtn = document.getElementById("mapBtn")
const mapBtn2 = document.getElementById("mapBtn2")

let lastUserLoc = null

const translations = {
  en: {
    sos: "🚨 SEND SOS",
    note: "📡 Works even without internet",
    formTitle: "📝 SOS Details",
    severity: "Severity Level",
    people: "👥 Number of people",
    message: "💬 Optional message",
    submit: "📤 SUBMIT SOS",
    saved: "✅ SOS SAVED",
    savedMsg: "📶 Will be sent when network returns",
    voiceBtn: "🔊 Play Safety Instructions"
  },
  hi: {
    sos: "🚨 सहायता भेजें",
    note: "📡 बिना इंटरनेट के भी काम करता है",
    formTitle: "📝 आपातकालीन विवरण",
    severity: "खतरे का स्तर",
    people: "👥 लोगों की संख्या",
    message: "💬 अतिरिक्त संदेश",
    submit: "📤 भेजें",
    saved: "✅ सहायता सहेजी गई",
    savedMsg: "📶 नेटवर्क आने पर स्वतः भेजी जाएगी",
    voiceBtn: "🔊 सुरक्षा निर्देश सुनें"
  },
  ta: {
    sos: "🚨 உதவி கோரிக்கை அனுப்பு",
    note: "📡 இணையம் இல்லாமலும் செயல்படும்",
    formTitle: "📝 அவசர விவரங்கள்",
    severity: "அபாய நிலை",
    people: "👥 பாதிக்கப்பட்டவர்கள் எண்ணிக்கை",
    message: "💬 கூடுதல் தகவல்",
    submit: "📤 அனுப்பு",
    saved: "✅ கோரிக்கை சேமிக்கப்பட்டது",
    savedMsg: "📶 இணைப்பு வந்ததும் அனுப்பப்படும்",
    voiceBtn: "🔊 பாதுகாப்பு வழிகாட்டி"
  }
}

const voiceTexts = {
  en: { lang: "en-IN", text: "Emergency instructions activated. Stay calm." },
  hi: { lang: "hi-IN", text: "आपातकालीन निर्देश शुरू किए गए हैं। शांत रहें।" },
  ta: { lang: "ta-IN", text: "அவசர வழிமுறைகள் தொடங்கப்பட்டுள்ளன. அமைதியாக இருங்கள்." }
}

function updateSeverity(lang) {
  const s = document.getElementById("severity")
  s.innerHTML = ""
  if (lang === "en") s.innerHTML = `<option>Low</option><option>Medium</option><option>High</option>`
  if (lang === "hi") s.innerHTML = `<option>कम</option><option>मध्यम</option><option>उच्च</option>`
  if (lang === "ta") s.innerHTML = `<option>குறைந்த</option><option>நடுத்தர</option><option>உயர்</option>`
}

function setLanguage(lang) {
  sosBtn.innerText = translations[lang].sos
  document.getElementById("note").innerText = translations[lang].note
  document.getElementById("formTitle").innerText = translations[lang].formTitle
  document.getElementById("severityLabel").innerText = translations[lang].severity
  document.getElementById("people").placeholder = translations[lang].people
  document.getElementById("message").placeholder = translations[lang].message
  submitBtn.innerText = translations[lang].submit
  document.getElementById("statusTitle").innerText = translations[lang].saved
  document.getElementById("statusMsg").innerText = translations[lang].savedMsg
  voiceBtn.innerText = translations[lang].voiceBtn
  updateSeverity(lang)
}

function speak(text, langCode) {
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = langCode
  const voices = speechSynthesis.getVoices()
  let selectedVoice = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase()))
  if (!selectedVoice) selectedVoice = voices.find(v => v.lang.startsWith("en"))
  if (selectedVoice) utter.voice = selectedVoice
  speechSynthesis.cancel()
  speechSynthesis.speak(utter)
}

function getLocation(callback) {
  if (!navigator.geolocation) {
    alert("Geolocation not supported")
    return
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      lastUserLoc = loc
      callback(loc)
    },
    () => alert("Please allow location access (run on http://localhost or https)"),
    { enableHighAccuracy: true, timeout: 10000 }
  )
}

function saveOfflineSOS(data) {
  const stored = JSON.parse(localStorage.getItem("offlineSOS")) || []
  stored.push(data)
  localStorage.setItem("offlineSOS", JSON.stringify(stored))
}

window.addEventListener("online", () => {
  const stored = JSON.parse(localStorage.getItem("offlineSOS")) || []
  stored.forEach(sos => {
    fetch("https://example.com/sos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sos)
    })
  })
  if (stored.length) localStorage.removeItem("offlineSOS")
})

sosBtn.onclick = () => {
  home.classList.add("hidden")
  form.classList.remove("hidden")
}

submitBtn.onclick = () => {
  const severity = document.getElementById("severity").value
  const people = Number(document.getElementById("people").value)
  const message = document.getElementById("message").value
  const lang = langSelect.value

  if (people < 1) {
    alert("People count must be at least 1")
    return
  }

  getLocation(location => {
    const sosData = { severity, people, message, lang, location, time: new Date().toISOString() }
    if (!navigator.onLine) saveOfflineSOS(sosData)
    else {
      fetch("https://example.com/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sosData)
      })
    }

    form.classList.add("hidden")
    status.classList.remove("hidden")
  })
}

voiceBtn.onclick = () => {
  const lang = langSelect.value
  speak(voiceTexts[lang].text, voiceTexts[lang].lang)
}

function openMap() {
  const lang = langSelect.value
  window.location.href = `mmap.html?lang=${lang}`
}

mapBtn.onclick = openMap
if (mapBtn2) mapBtn2.onclick = openMap

langSelect.addEventListener("change", () => setLanguage(langSelect.value))
setLanguage("en")
fetch("http://127.0.0.1:8001/send_sos", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})
const payload = {
  name: "Anonymous",
  latitude: location.lat,
  longitude: location.lng,
  emergency_type: "critical",
  severity,
  messages: message ? [{
    sender: "victim",
    text: message,
    timestamp: new Date().toISOString()
  }] : []
}
