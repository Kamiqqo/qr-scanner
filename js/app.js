


const video       = document.getElementById('video');
const canvas      = document.getElementById('canvas');
const ctx         = canvas.getContext('2d', { willReadFrequently: true });
const statusEl    = document.getElementById('status');
const placeholder = document.getElementById('placeholder');
const scanLabel   = document.getElementById('scanLabel');
const scanFrame   = document.querySelector('.scan-frame');

const startBtn  = document.getElementById('startBtn');
const stopBtn   = document.getElementById('stopBtn');
const fileInput = document.getElementById('fileInput');

const autoOpenChk    = document.getElementById('autoOpen');
const showOverlayChk = document.getElementById('showOverlay');

const resultBox  = document.getElementById('result');
const resultText = document.getElementById('resultText');
const openBtn    = document.getElementById('openBtn');
const copyBtn    = document.getElementById('copyBtn');
const againBtn   = document.getElementById('againBtn');

const historyBlock = document.getElementById('historyBlock');
const historyList  = document.getElementById('historyList');
const clearHistory = document.getElementById('clearHistory');

let stream = null;
let scanning = false;
let currentCode = null;
let lastScanTime = 0;
const COOLDOWN = 2000;

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + type;
}

async function startCapture() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setStatus('Браузер не поддерживает захват экрана', 'error');
    return;
  }

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width:  { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 10, max: 15 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    placeholder.classList.add('hidden');
    scanning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    scanLabel.hidden = false;
    setStatus('Захват активен — ищу QR-код…');

    stream.getVideoTracks()[0].addEventListener('ended', stopCapture);

    requestAnimationFrame(tick);
  } catch (err) {
    console.error(err);
    if (err.name === 'NotAllowedError') {
      setStatus('Захват отменён пользователем', 'error');
    } else {
      setStatus('Ошибка захвата: ' + err.message, 'error');
    }
  }
}

function stopCapture() {
  scanning = false;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
  placeholder.classList.remove('hidden');
  scanLabel.hidden = true;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('Захват остановлен');
}

function tick() {
  if (!scanning) return;

  if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    const maxW = 1920;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width  = Math.round(video.videoWidth  * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth' // QR бывают инвертированные (белый на чёрном)
    });

    if (code && code.data) {
      const now = Date.now();
      if (now - lastScanTime > COOLDOWN && code.data !== currentCode) {
        lastScanTime = now;
        onCodeFound(code.data);
      }
    }
  }
  requestAnimationFrame(tick);
}

function onCodeFound(text) {
  currentCode = text;
  setStatus('QR-код распознан ✓', 'ok');
  scanLabel.hidden = true;

  if (navigator.vibrate) navigator.vibrate(100);

  showResult(text);
  addToHistory(text);

  if (autoOpenChk.checked) {
    openInNewTab(text);
  }

  setTimeout(() => {
    if (scanning) {
      scanLabel.hidden = false;
      setStatus('Ищу следующий QR-код…');
    }
  }, 2500);
}

function openInNewTab(text) {
  const url = normalizeUrl(text);
  if (!url) {
    setStatus('Распознан текст, но это не ссылка', 'error');
    return false;
  }
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) setStatus('Браузер заблокировал окно. Нажмите «Открыть ссылку».', 'error');
  return true;
}

function normalizeUrl(text) {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t;
  if (/^(mailto|tel|sms):/i.test(t)) return t;
  return null;
}

function showResult(text) {
  resultBox.hidden = false;
  resultText.textContent = text;
  const url = normalizeUrl(text);
  openBtn.disabled = !url;
  openBtn.style.opacity = url ? 1 : 0.4;
  openBtn.dataset.url = url || '';
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem('qrHistoryScreen') || '[]'); }
  catch { return []; }
}

function saveHistory(list) {
  localStorage.setItem('qrHistoryScreen', JSON.stringify(list.slice(0, 20)));
}

function addToHistory(text) {
  const list = getHistory();
  if (list[0] && list[0].text === text) return;
  list.unshift({ text, time: new Date().toLocaleString('ru-RU') });
  saveHistory(list);
  renderHistory();
}

function renderHistory() {
  const list = getHistory();
  if (!list.length) { historyBlock.hidden = true; return; }
  historyBlock.hidden = false;
  historyList.innerHTML = '';
  list.forEach(item => {
    const li = document.createElement('li');
    const url = normalizeUrl(item.text);
    const content = url
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.text)}</a>`
      : `<span>${escapeHtml(item.text)}</span>`;
    li.innerHTML = `<div>${content}</div><span class="time">${item.time}</span>`;
    historyList.appendChild(li);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data) {
      onCodeFound(code.data);
    } else {
      setStatus('На картинке QR не найден', 'error');
      alert('Не удалось распознать QR-код.');
    }
    URL.revokeObjectURL(img.src);
    fileInput.value = '';
  };
  img.onerror = () => { alert('Не удалось загрузить картинку.'); fileInput.value = ''; };
  img.src = URL.createObjectURL(file);
});

document.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) onCodeFound(code.data);
        else setStatus('В картинке из буфера QR не найден', 'error');
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
      return;
    }
  }
});

startBtn.addEventListener('click', startCapture);
stopBtn.addEventListener('click', stopCapture);

openBtn.addEventListener('click', () => {
  const url = openBtn.dataset.url;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resultText.textContent);
    copyBtn.textContent = '✅ Скопировано';
    setTimeout(() => (copyBtn.textContent = '📋 Копировать'), 1500);
  } catch { alert('Не удалось скопировать'); }
});

againBtn.addEventListener('click', () => {
  resultBox.hidden = true;
  currentCode = null;
  if (!scanning) startCapture();
  else {
    scanLabel.hidden = false;
    setStatus('Ищу QR-код…');
  }
});

clearHistory.addEventListener('click', () => {
  if (confirm('Очистить историю?')) {
    localStorage.removeItem('qrHistoryScreen');
    renderHistory();
  }
});

showOverlayChk.addEventListener('change', () => {
  scanFrame.classList.toggle('hidden', !showOverlayChk.checked);
});

window.addEventListener('load', () => {
  renderHistory();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setStatus('Браузер не поддерживает захват экрана', 'error');
    startBtn.disabled = true;
    return;
  }
});

window.addEventListener('beforeunload', () => {
  if (stream) stream.getTracks().forEach(t => t.stop());
});