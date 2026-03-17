/**
 * DeepScan AI — 4 Models + 4 Analyses + History
 */
// Auto-detect: Render backend in production, localhost in dev
const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : 'https://deepscan-ai-backend.onrender.com';
let selectedFile = null;

// DOM refs
const $ = id => document.getElementById(id);
const uploadZone = $('upload-zone'), fileInput = $('file-input'),
      previewState = $('preview-state'), previewImage = $('preview-image'),
      loadingState = $('loading-state'), resultsSection = $('results-section'),
      errorSection = $('error-section'), errorMessage = $('error-message'),
      samplesSection = $('samples-section');

// ── Upload ───────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); });
uploadZone.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
    const ok = ['image/png','image/jpeg','image/jpg','image/webp','image/bmp'];
    if (!ok.includes(file.type)) return showError('Invalid file type.');
    if (file.size > 16*1024*1024) return showError('File too large (max 16MB).');
    selectedFile = file;
    const r = new FileReader();
    r.onload = e => { previewImage.src = e.target.result; showPreview(file); };
    r.readAsDataURL(file);
}

function showPreview(file) {
    hide(uploadZone); show(previewState); hide(loadingState); hide(resultsSection); hide(errorSection);
    $('file-name').textContent = file.name;
    $('file-size').textContent = fmtSize(file.size);
    samplesSection.style.display = 'none';
}

function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(1) + ' MB';
}

// ── Reset ────────────────────────────────────────────────────────────
$('remove-btn').addEventListener('click', resetUpload);
function resetUpload() {
    selectedFile = null; fileInput.value = ''; previewImage.src = '';
    show(uploadZone); hide(previewState); hide(loadingState); hide(resultsSection); hide(errorSection);
    samplesSection.style.display = '';
}

// ── Analyze ──────────────────────────────────────────────────────────
$('analyze-btn').addEventListener('click', runAnalysis);

async function runAnalysis() {
    if (!selectedFile) return;
    hide(previewState); show(loadingState); hide(resultsSection); hide(errorSection);
    resetProgress();
    const anim = animateProgress();
    const form = new FormData();
    form.append('image', selectedFile);

    const MAX_RETRIES = 3;
    let lastErr = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Show retry message
            const h3 = document.querySelector('.loading-state h3');
            if (attempt === 1) h3.textContent = 'Running 8-Layer Analysis...';
            else h3.textContent = `Server waking up... Retry ${attempt}/${MAX_RETRIES}`;

            // 120s timeout for Render cold start
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000);

            const res = await fetch(`${API}/api/detect`, {
                method: 'POST', body: form, signal: controller.signal
            });
            clearTimeout(timeout);
            const data = await res.json();
            clearInterval(anim); completeProgress();
            if (!res.ok) throw new Error(data.error || 'Analysis failed');
            if (data.verdict === 'ERROR') throw new Error(data.error || 'All failed');
            setTimeout(() => { showResults(data); loadHistory(); }, 600);
            return; // Success — exit
        } catch (err) {
            lastErr = err.name === 'AbortError' ? 'Request timed out (server may be starting)' : (err.message || 'Server connection failed');
            if (attempt < MAX_RETRIES) {
                // Wait 2s before retry
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
        }
    }
    // All retries failed
    clearInterval(anim); hide(loadingState);
    showError(lastErr + ' — Render free server takes 30-60s to wake up. Click Try Again.');
}

// ── Progress ─────────────────────────────────────────────────────────
const STEPS = ['step-rd','step-m1','step-m2','step-m3','step-ela','step-face','step-freq','step-exif'];
function resetProgress() { STEPS.forEach(id => { const el = $(id); el.classList.remove('done','active'); el.querySelector('.mp-icon').textContent = '⏳'; }); }
function animateProgress() {
    let i = 0; $(STEPS[0]).classList.add('active');
    return setInterval(() => {
        if (i < STEPS.length) { const el = $(STEPS[i]); el.classList.remove('active'); el.classList.add('done'); el.querySelector('.mp-icon').textContent = '✓'; i++; if (i < STEPS.length) $(STEPS[i]).classList.add('active'); }
    }, 700);
}
function completeProgress() { STEPS.forEach(id => { const el = $(id); el.classList.remove('active'); el.classList.add('done'); el.querySelector('.mp-icon').textContent = '✓'; }); }

// ── Results ──────────────────────────────────────────────────────────
function showResults(d) {
    hide(loadingState); hide(uploadZone); hide(previewState);
    show(resultsSection); hide(errorSection);
    const level = d.risk_level;
    const conf = d.final_confidence;
    const colors = { HIGH:'var(--red)', MEDIUM:'var(--amber)', LOW:'var(--amber)', SAFE:'var(--green)' };
    const icons = { HIGH:'✗', MEDIUM:'⚠', LOW:'⚠', SAFE:'✓' };
    const color = colors[level] || 'var(--text-m)';

    // Verdict
    const vi = $('verdict-icon'); vi.className = 'verdict-icon ' + level.toLowerCase(); vi.textContent = icons[level] || '?';
    $('verdict-text').textContent = d.verdict; $('verdict-text').style.color = color;
    const rb = $('risk-badge'); rb.textContent = level + ' RISK'; rb.className = 'risk-badge ' + level.toLowerCase();
    $('verdict-score').textContent = `${conf}% combined • AI: ${d.ai_score}% • Forensic: ${d.feature_score}% • ${d.models_responded}/${d.total_models} models`;
    $('time-badge').textContent = d.processing_time_ms + 'ms';
    const mb = $('mode-badge');
    if (d.mode === 'full_ensemble') { mb.textContent = '4-Model'; mb.className = 'mode-badge full'; }
    else if (d.mode === 'hf_fallback') { mb.textContent = 'Fallback'; mb.className = 'mode-badge fallback'; }
    else { mb.textContent = ''; mb.className = 'mode-badge'; }
    const cn = $('confidence-note'); cn.textContent = d.confidence_note || ''; cn.style.display = d.confidence_note ? '' : 'none';

    // Score breakdown
    $('ai-score-val').textContent = d.ai_score + '%'; $('ai-score-bar').style.width = d.ai_score + '%';
    $('feature-score-val').textContent = d.feature_score + '%'; $('feature-score-bar').style.width = d.feature_score + '%';

    // Gauge
    const gf = $('gauge-fill'), gv = $('gauge-val'), arc = 251.33;
    setTimeout(() => { gf.style.strokeDashoffset = arc - (arc * conf / 100); gf.style.stroke = color; gv.textContent = conf + '%'; gv.style.color = color; }, 100);

    // Image
    $('result-image').src = previewImage.src;
    const badge = $('result-badge'); badge.textContent = d.verdict; badge.className = 'result-badge ' + level.toLowerCase();
    $('result-img-wrap').style.borderColor = color;

    // Tab content
    renderModels(d.model_breakdown, d.models_responded, d.total_models);
    renderELA(d.analysis?.ela);
    renderFace(d.analysis?.face);
    renderFrequency(d.analysis?.frequency);
    renderEXIF(d.analysis?.exif);
    renderFlags(d.flags, level);

    // Reset tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="tab-models"]').classList.add('active');
    $('tab-models').classList.add('active');

    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Tab Switching ────────────────────────────────────────────────────
document.addEventListener('click', e => {
    if (e.target.classList.contains('tab-btn')) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        $(e.target.dataset.tab).classList.add('active');
    }
});

// ── Render: AI Models ────────────────────────────────────────────────
function renderModels(breakdown, used, total) {
    const container = $('model-cards');
    $('models-responded').textContent = `${used}/${total}`;
    container.innerHTML = '';
    const meta = {
        reality_defender: { icon:'👑', grad:'linear-gradient(135deg, #fbbf2433, #f59e0b33)', ent: true },
        model1_ViT: { icon:'🔬', grad:'linear-gradient(135deg, #a78bfa33, #6366f133)', ent: false },
        model2_SigLIP: { icon:'🛡️', grad:'linear-gradient(135deg, #60a5fa33, #3b82f633)', ent: false },
        model3_general: { icon:'🔬', grad:'linear-gradient(135deg, #34d39933, #10b98133)', ent: false }
    };
    for (const key of ['reality_defender','model1_ViT','model2_SigLIP','model3_general']) {
        const m = breakdown[key]; if (!m) continue;
        const mt = meta[key] || { icon:'📊', grad:'', ent: false };
        const score = m.score !== null && m.score !== undefined ? m.score : '—';
        const barColor = score === '—' ? 'var(--text-m)' : score > 70 ? 'var(--red)' : score > 40 ? 'var(--amber)' : 'var(--green)';
        const isErr = m.status !== 'success';
        let indicatorsTags = '';
        if (m.indicators && m.indicators.length > 0) indicatorsTags = `<div class="mc-indicators">${m.indicators.map(i => `<span class="indicator-tag">${i}</span>`).join('')}</div>`;
        const card = document.createElement('div');
        card.className = 'model-card' + (isErr ? ' error' : '') + (mt.ent ? ' enterprise' : '');
        card.style.background = mt.grad;
        card.innerHTML = `<div class="mc-top"><span class="mc-icon">${mt.icon}</span><div class="mc-info"><span class="mc-name">${m.name}${mt.ent ? ' <span class="enterprise-badge">Enterprise</span>' : ''}</span><span class="mc-meta">${m.accuracy} • ${m.weight}</span></div><div class="mc-score-wrap"><span class="mc-score" style="color:${isErr ? 'var(--text-m)' : barColor}">${score}${score !== '—' ? '%' : ''}</span>${m.verdict && !isErr ? `<span class="mc-verdict ${m.verdict.toLowerCase()}">${m.verdict}</span>` : ''}</div></div>${!isErr && score !== '—' ? `<div class="mc-bar-bg"><div class="mc-bar" style="background:${barColor}" data-w="${score}%"></div></div>` : ''}${indicatorsTags}${isErr ? `<div class="mc-error">${m.error}</div>` : ''}<div class="mc-time">${m.elapsed_ms}ms</div>`;
        container.appendChild(card);
    }
    setTimeout(() => { document.querySelectorAll('.mc-bar').forEach(b => b.style.width = b.dataset.w); }, 200);
}

// ── Render: ELA ──────────────────────────────────────────────────────
function renderELA(ela) {
    if (!ela) return;
    setAnalysisBadge('ela', ela);
    $('ela-desc').textContent = ela.description || '';
    if (ela.ela_image) { $('ela-image').src = ela.ela_image; $('ela-img-wrap').style.display = ''; }
    else { $('ela-img-wrap').style.display = 'none'; }
}

// ── Render: Face ─────────────────────────────────────────────────────
function renderFace(face) {
    if (!face) return;
    setAnalysisBadge('face', face);
    $('face-count-badge').textContent = face.face_count !== undefined ? `${face.face_count} face${face.face_count !== 1 ? 's' : ''}` : '';
    $('face-flags').innerHTML = renderFlagItems(face.flags || [], face.verdict === 'SUSPICIOUS' ? 'var(--amber)' : 'var(--green)');
}

// ── Render: Frequency ────────────────────────────────────────────────
function renderFrequency(freq) {
    if (!freq) return;
    setAnalysisBadge('freq', freq);
    $('freq-flags').innerHTML = renderFlagItems(freq.flags || [], freq.verdict === 'SUSPICIOUS' ? 'var(--amber)' : 'var(--green)');
    if (freq.frequency_image) { $('freq-image').src = freq.frequency_image; $('freq-img-wrap').style.display = ''; }
    else { $('freq-img-wrap').style.display = 'none'; }
}

// ── Render: EXIF ─────────────────────────────────────────────────────
function renderEXIF(exif) {
    if (!exif) return;
    setAnalysisBadge('exif', exif);
    // Metadata table
    const meta = exif.metadata || {};
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0) {
        $('exif-meta-table').innerHTML = `<table class="exif-table">${metaKeys.map(k => `<tr><td class="et-key">${k}</td><td class="et-val">${meta[k]}</td></tr>`).join('')}</table>`;
    } else {
        $('exif-meta-table').innerHTML = '<p class="muted">No metadata found</p>';
    }
    $('exif-flags').innerHTML = renderFlagItems(exif.flags || [], exif.verdict === 'SUSPICIOUS' ? 'var(--amber)' : 'var(--green)');
}

// ── Helpers ──────────────────────────────────────────────────────────
function setAnalysisBadge(prefix, data) {
    const scoreEl = $(`${prefix}-score`), verdEl = $(`${prefix}-verdict`);
    scoreEl.textContent = data.score + '%';
    scoreEl.style.color = data.score > 40 ? 'var(--red)' : 'var(--green)';
    verdEl.textContent = data.verdict;
    verdEl.className = 'a-verdict ' + (data.verdict === 'SUSPICIOUS' ? 'sus' : data.verdict === 'CLEAN' ? 'clean' : 'neutral');
}

function renderFlagItems(flags, color) {
    return flags.map(f => `<div class="flag-item" style="border-left-color:${color}"><span class="flag-dot" style="background:${color}"></span><span>${f}</span></div>`).join('');
}

function renderFlags(flags, level) {
    const c = { HIGH:'var(--red)', MEDIUM:'var(--amber)', LOW:'var(--amber)', SAFE:'var(--green)' }[level] || 'var(--text-m)';
    $('flags-list').innerHTML = renderFlagItems(flags, c);
}

// ── Error ────────────────────────────────────────────────────────────
function showError(msg) { hide(loadingState); hide(previewState); hide(uploadZone); show(errorSection); hide(resultsSection); errorMessage.textContent = msg; }
$('retry-btn').addEventListener('click', () => { selectedFile ? showPreview(selectedFile) : resetUpload(); });
$('new-scan-btn').addEventListener('click', () => { $('gauge-fill').style.strokeDashoffset = 251.33; resetUpload(); });

// ── History ──────────────────────────────────────────────────────────
async function loadHistory() {
    try {
        const r = await fetch(`${API}/api/history`);
        const d = await r.json();
        renderHistory(d.history || []);
    } catch { renderHistory([]); }
}

function renderHistory(history) {
    $('history-count').textContent = history.length;
    const list = $('history-list');
    if (!history.length) { list.innerHTML = '<div class="history-empty">No scans yet</div>'; return; }
    list.innerHTML = history.slice(0, 10).map(h => {
        const c = { HIGH:'var(--red)', MEDIUM:'var(--amber)', LOW:'var(--amber)', SAFE:'var(--green)' }[h.risk_level] || 'var(--text-m)';
        return `<div class="history-item"><div class="hi-top"><span class="hi-name">${h.image_name.substring(0,20)}</span><span class="hi-badge" style="color:${c};border-color:${c}">${h.risk_level}</span></div><div class="hi-bottom"><span class="hi-conf">${h.confidence}%</span><span class="hi-time">${h.timestamp}</span></div></div>`;
    }).join('');
}

// ── Samples ──────────────────────────────────────────────────────────
document.querySelectorAll('.sample-card').forEach(btn => {
    btn.addEventListener('click', async () => {
        const type = btn.dataset.sample;
        let url;
        if (type === 'real') url = 'https://picsum.photos/id/1027/400/400';
        else if (type === 'fake') url = 'https://thispersondoesnotexist.com';
        else url = 'https://picsum.photos/id/1005/400/400';
        btn.classList.add('loading');
        try { const res = await fetch(url); const blob = await res.blob(); handleFile(new File([blob], `sample_${type}.jpg`, {type:'image/jpeg'})); }
        catch { showError('Failed to load sample.'); }
        btn.classList.remove('loading');
    });
});

// ── Utils ────────────────────────────────────────────────────────────
function show(el) { if (el) el.style.display = 'block'; }
function hide(el) { if (el) el.style.display = 'none'; }

// Load history on page load
loadHistory();
