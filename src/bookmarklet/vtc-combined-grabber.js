// == VTC Integrated Bookmarklet (Calendar + Attendance + Dashboard Overlay) ==
// This script runs on any VTC portal page.
// It fetches calendar events, scrapes Class Attendance via hidden iframe,
// then renders a dark dashboard overlay directly on the page.
//
// To deploy:
//   1. Upload this file to a web host (GitHub Pages, Netlify, Vercel, etc.)
//   2. Update the URL in the bookmarklet loader.
//   3. Share the bookmarklet with users.

(function () {
  const RANGE_START = new Date(2025, 8, 1);  // 2025-09-01
  const RANGE_END   = new Date(2026, 8, 1);  // 2026-09-01
  let currentThreshold = 70;
  try {
    const savedThreshold = localStorage.getItem('vtc_threshold');
    if (savedThreshold === '80') currentThreshold = 80;
  } catch (e) {}

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = s => String(s || "").replace(/\s+/g, " ").trim();
  const parseHtml = html => new DOMParser().parseFromString(html, "text/html");
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

  // ── Built-in translations (shared by grabber + dashboard) ─────────────
  // Prefer window.vtcTranslations (loaded from translations.js on prior runs)
  // so edits in translations.js take effect without touching the bookmarklet.
  const builtinTranslations = {
    en: {
      languageName: 'English',
      crossSem: 'cross sem',
      crossSemTooltip: 'Module runs across semesters',
      title: 'VTC Attendance Checker',
      legend: 'blue = current rate, green = best possible rate, red line = {threshold}%',
      noteEdit: 'note: you can edit the module total hr if you got a actual attendance table so you can check how many hr you can skip :-) ',
      download: 'download',
      exportIcs: 'export ICS',
      exportIcsTitle: 'download an .ics file you can import into Google Calendar, Apple Calendar, or Outlook',
      filterModules: 'filter modules',
      overall: 'Overall',
      editMode: 'edit mode',
      doneEditing: 'done editing',
      close: 'close',
      moduleHeader: 'module',
      currentHeader: 'current',
      bestHeader: 'best possible',
      hoursHeader: 'hours',
      futureHeader: 'future',
      statusHeader: 'status',
      absentRateLabel: 'absent rate',
      lateLabel: 'late',
      skipWarning: 'IF YOU SKIP, YOU HAVE HIGH CHANCE YOUR ABSENT RATE WENT HIGH!',
      failed: 'failed',
      passed: 'passed',
      almostPass: 'almost pass',
      noRecord: 'no record',
      absentWarnInstantFail: '≥30% = instant fail',
      warningTitle: 'for reference only',
      warningSub: 'not 100% confirmed. always double-check with your official attendance.',
      roundUpFmt: '(round up as {n}%)',
      skipAroundFmt: 'you can skip around {time} ({approx})',
      mustAttendAll: 'you must attend all',
      approxLessonFmt: '≈ {n} lesson{plural} @ {avg}h',
      approxHalf: '≈ half a lesson @ {avg}h',
      approxQuarter: '≈ quarter of a lesson @ {avg}h',
      summaryJson: 'summary JSON',
      detailsJson: 'details JSON',
      summaryCsv: 'summary CSV',
      detailsCsv: 'details CSV',
      selectModulesToExport: 'select modules to export',
      all: 'all',
      off: 'off',
      other: 'other',
      hideFilter: 'hide filter',
      semesterFmt: 'Sem {n}',
      exporting: 'exporting...',
      moduleTip: 'module code and name',
      currentTip: 'your current attendance rate based on recorded hours',
      bestTip: 'max possible rate if you attend every future lesson',
      hoursTip: 'attended hours / total scheduled hours from calendar',
      futureTip: 'hours for lessons that have not happened yet',
      statusTip: 'passed = above {threshold}%, almost pass = below {threshold}% but can reach, failed = cooked, no record = not started/no attendance data',
      bestBarTipFmt: 'best possible rate: {value}',
      currentBarTipFmt: 'current rate: {value}',
      na: 'N/A',
      curShort: 'cur',
      bestShort: 'best',
      futShort: 'fut',
      ratingExcellent: 'excellent',
      ratingBad: 'bad',
      ratingNormal: 'normal',
      ratingUnknown: 'unknown',
      // ── Status-card strings (grabber progress) ──
      statusStart: 'Starting integrated grabber...',
      statusFindingCalendarApi: 'Finding calendar API...',
      statusFindingAttendancePage: 'Finding Class Attendance page...',
      statusFetchingEvents: 'Fetching calendar events...',
      statusFoundEvents: 'Found {n} calendar events',
      statusFetchingCalendarRange: 'Fetching calendar {start} -> {end}',
      statusGrabbingModules: 'Grabbing {n} module(s)...',
      statusGrabbingModuleProgress: '{current}/{total}: {name}',
      statusDetectingSemesters: 'Detecting semesters...',
      statusError: 'Error: {message}',
      statusUnknownError: 'unknown error',
      statusGrabbingTitle: 'Grabbing...',
      statusDoneTitle: 'Done! Grabbed {n} module(s)',
      statusErrorTitle: 'Something went wrong',
      statusDone: 'Done!',
      statusErrorShort: 'Error',
      // ── Language-detection alert (when portal is in Chinese) ──
      languageDetected: 'Detected non-English page language.',
      languageIssueTitle: 'Language issue',
      languageDetectedDetail: 'This site appears to be in {lang}.',
      languageSwitchToEnglish: 'Please switch the portal language to English and retry.',
      languageAlert: 'VTC Attendance Grabber: Please change the site language to English and run the grabber again.'
    },
    zh: {
      languageName: '繁體中文（香港）',
      crossSem: '跨Sem',
      crossSemTooltip: '跨Sem',
      title: 'VTC 出席率Checker',
      legend: '藍色 = 目前出席率，綠色 = 最佳可能出席率，紅線 = {threshold}%',
      noteEdit: '話比你知：如果見到個單元時間比你手上有嘅出席率list嘅時間有啲唔同嘅話，可以開編輯模式改時間就可以睇到大約可走堂時間 :-) ',
      download: '下載',
      exportIcs: '匯出 ICS',
      exportIcsTitle: '可匯入 Google 日曆 / Apple 日曆 / Outlook',
      filterModules: '篩選',
      overall: '整體',
      editMode: '編輯模式',
      doneEditing: '完成編輯',
      close: '關閉',
      moduleHeader: '單元',
      currentHeader: '目前',
      bestHeader: '最佳可能',
      hoursHeader: '時數',
      futureHeader: '未來',
      statusHeader: '狀態',
      absentRateLabel: '缺席率',
      lateLabel: '遲到',
      skipWarning: '呢個單元如果你走嘅話，個缺席率很可能即刻爆！',
      failed: '炒左',
      passed: 'Pass',
      almostPass: '差唔多Pass',
      noRecord: '沒有紀錄',
      absentWarnInstantFail: '≥30% = 即炒',
      warningTitle: '只供參考',
      warningSub: '未必 100% 準確。請以官方出席紀錄為準。',
      roundUpFmt: '（四捨五入為 {n}%）',
      skipAroundFmt: '你可以走大約 {time}（{approx}）',
      mustAttendAll: '你一定要出席',
      approxLessonFmt: '≈ {n} 堂 @ {avg}小時',
      approxHalf: '≈ 半堂 @ {avg}小時',
      approxQuarter: '≈ 四分之一堂 @ {avg}小時',
      summaryJson: '摘要 JSON',
      detailsJson: '詳細 JSON',
      summaryCsv: '摘要 CSV',
      detailsCsv: '詳細 CSV',
      selectModulesToExport: '選擇要匯出嘅單元',
      all: '全部',
      off: '取消',
      other: '其他',
      hideFilter: '隱藏篩選',
      semesterFmt: '第{n}學期',
      exporting: '匯出中...',
      moduleTip: '單元代碼與名稱',
      currentTip: '根據已記錄時數計算的目前出席率',
      bestTip: '如果所有課堂都上嘅出席率',
      hoursTip: '出席時數 / 行事曆排定總時數',
      futureTip: '尚未開始課堂的時數',
      statusTip: 'Pass只要過{threshold}%就得，差唔多Pass就上多啲堂，紅色你知咩料啦。 灰色=未開始/無記錄 ',
      bestBarTipFmt: '最高可能出席率：{value}',
      currentBarTipFmt: '目前出席率：{value}',
      na: '無',
      curShort: '目前',
      bestShort: '最佳',
      futShort: '未來',
      ratingExcellent: '勁',
      ratingBad: 'Restudy大師',
      ratingNormal: '一般',
      ratingUnknown: '未知',
      // ── Status-card strings (grabber progress) ──
      statusStart: '正在啟動整合抓取器...',
      statusFindingCalendarApi: '正在尋找日曆 API...',
      statusFindingAttendancePage: '正在尋找課堂出席頁面...',
      statusFetchingEvents: '正在獲取日曆活動...',
      statusFoundEvents: '找到 {n} 個日曆活動',
      statusFetchingCalendarRange: '正在獲取日曆 {start} -> {end}',
      statusGrabbingModules: '正在抓取 {n} 個單元...',
      statusGrabbingModuleProgress: '{current}/{total}: {name}',
      statusDetectingSemesters: '正在偵測學期...',
      statusError: '錯誤: {message}',
      statusUnknownError: '未知錯誤',
      statusGrabbingTitle: '拎緊data...',
      statusDoneTitle: '完成！已抓取 {n} 個模組',
      statusErrorTitle: '發生錯誤',
      statusDone: '完成！',
      statusErrorShort: '錯誤',
      // ── Language-detection alert (when portal is in Chinese) ──
      languageDetected: '偵測到非英文頁面。',
      languageIssueTitle: '語言問題',
      languageDetectedDetail: '此網站目前使用 {lang}。',
      languageSwitchToEnglish: '請將網站語言切換為英文後重試。',
      languageAlert: 'VTC 出席率Checker：請將網站語言改為英文，然後再次執行。'
    }
  };
  const tStatus = (key) => {
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('vtc_lang')) || 'en';
    const src = (typeof window !== 'undefined' && window.vtcTranslations) || builtinTranslations;
    return (src[lang] && src[lang][key]) || (src.en && src.en[key]) || (builtinTranslations.en && builtinTranslations.en[key]) || key;
  };

  // ── Prevent double-run ───────────────────────────────────────────────
  if (window.vtcIntegratedScraper) {
    alert('the integrated grabber is already running.\nplease refresh the page to restart.');
    return;
  }
  window.vtcIntegratedScraper = true;

  console.log('[VTC Attendance] Integrated grabber loaded.');

  // ── VISUAL STATUS UI ─────────────────────────────────────────────────
  let vtcStatusCard = null;
  let statusStepsContainer = null;
  let statusHeaderIcon = null;
  let statusHeaderTitle = null;
  let statusSteps = [];
  const escHtml = s => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  const statusStyles = document.createElement('style');
  statusStyles.textContent = `
    @keyframes vtc-pop-in {
      0% { opacity: 0; transform: translateX(40px) scale(0.95); }
      100% { opacity: 1; transform: translateX(0) scale(1); }
    }
    @keyframes vtc-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }
    @keyframes vtc-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes vtc-step-in {
      0% { opacity: 0; transform: translateX(-8px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    #vtc-integrated-status {
      animation: vtc-pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    #vtc-integrated-status .vtc-status-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    #vtc-integrated-status .vtc-status-title {
      font-size: 15px;
      font-weight: 700;
      color: #fcd34d;
      letter-spacing: 0.3px;
    }
    #vtc-integrated-status .vtc-status-sub {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    #vtc-integrated-status .vtc-spinner {
      width: 18px;
      height: 18px;
      border: 2.5px solid rgba(252,211,77,0.2);
      border-top-color: #fcd34d;
      border-radius: 50%;
      animation: vtc-spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    /* portal (light) variant for the small status spinner */
    #vtc-integrated-status.vtc-theme-portal .vtc-spinner {
      border: 2.5px solid rgba(11,61,145,0.12);
      border-top-color: #0b3d91;
      background: transparent;
    }
    #vtc-integrated-status .vtc-check {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #34d399;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0a0a0a;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }
    #vtc-integrated-status .vtc-steps {
      padding-top: 4px;
    }
    #vtc-integrated-status .vtc-step {
      animation: vtc-step-in 0.25s ease forwards;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
      font-size: 13px;
      color: #a8a29e;
    }
    #vtc-integrated-status .vtc-step.active {
      color: #fef3c7;
    }
    #vtc-integrated-status .vtc-step.done {
      color: #34d399;
    }
    #vtc-integrated-status .vtc-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #a8a29e;
      flex-shrink: 0;
    }
    #vtc-integrated-status .vtc-step.active .vtc-dot {
      background: #fcd34d;
      animation: vtc-pulse 1.2s ease-in-out infinite;
    }
    #vtc-integrated-status .vtc-step.done .vtc-dot {
      background: #34d399;
    }
    #vtc-integrated-status .vtc-status-footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.06);
      font-size: 11px;
      color: #78716c;
      text-align: center;
      letter-spacing: 0.02em;
    }
    /* portal (light) variants for status steps and text */
    #vtc-integrated-status.vtc-theme-portal .vtc-step {
      color: #4b5563; /* muted dark for normal steps */
    }
    #vtc-integrated-status.vtc-theme-portal .vtc-step.active {
      color: #0b63d6; /* blue for active */
    }
    #vtc-integrated-status.vtc-theme-portal .vtc-step.done {
      color: #16a34a; /* green for done */
    }
    #vtc-integrated-status.vtc-theme-portal .vtc-status-footer {
      color: #6b7280;
    }
  `;
  document.head.appendChild(statusStyles);

  function ensureStatusCard() {
    if (vtcStatusCard) return;
    vtcStatusCard = document.createElement('div');
    vtcStatusCard.id = 'vtc-integrated-status';
    const st = vtcStatusCard.style;
    st.position = 'fixed';
    st.top = '16px';
    st.right = '16px';
    st.zIndex = '999999';
    st.width = '320px';
    st.padding = '16px 20px';
    st.borderRadius = '14px';
    st.fontFamily = 'Arial, Helvetica, sans-serif';
    st.fontSize = '14px';
    st.lineHeight = '1.5';

    // detect saved theme preference; default to portal (light) when missing
    let isPortalTheme = true;
    try {
      const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('vtc_theme') : null;
      if (saved && saved !== 'portal') isPortalTheme = false;
    } catch (e) {
      isPortalTheme = true;
    }

    if (isPortalTheme) {
      st.color = '#0b3d91';
      st.background = 'rgba(255,255,255,0.98)';
      st.border = '1px solid rgba(11,61,145,0.08)';
      st.boxShadow = '0 10px 24px rgba(14,30,37,0.06)';
    } else {
      st.color = '#fef3c7';
      st.background = 'rgba(10, 10, 10, 0.97)';
      st.border = '1px solid rgba(252, 211, 77, 0.2)';
      st.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
    }
    if (st.backdropFilter !== undefined) st.backdropFilter = 'blur(10px)';
    // add a class so CSS (statusStyles) can target portal variant
    vtcStatusCard.classList.toggle('vtc-theme-portal', isPortalTheme);

    // Build static structure once
    vtcStatusCard.innerHTML =
      '<div class="vtc-status-header">' +
        '<span style="font-size:16px;">&#127859;</span>' +
        '<span class="vtc-status-title">VTC Attendance Grabber</span>' +
      '</div>' +
      '<div class="vtc-status-sub">' +
        '<div id="vtc-status-icon" class="vtc-spinner"></div>' +
        '<strong id="vtc-status-subtitle" style="color:#fbbf24;font-size:14px;letter-spacing:0.3px;">Grabbing...</strong>' +
      '</div>' +
      '<div id="vtc-status-steps" class="vtc-steps"></div>' +
      '<div class="vtc-status-footer">made with &#10084; by CKHO and yoke</div>';

    document.body.appendChild(vtcStatusCard);
    statusStepsContainer = vtcStatusCard.querySelector('#vtc-status-steps');
    statusHeaderIcon = vtcStatusCard.querySelector('#vtc-status-icon');
    statusHeaderTitle = vtcStatusCard.querySelector('#vtc-status-subtitle');

    // adjust some inner element colors for portal (light) theme
    try {
      if (isPortalTheme) {
        const titleEl = vtcStatusCard.querySelector('.vtc-status-title');
        if (titleEl) titleEl.style.color = '#0b3d91';
        if (statusHeaderTitle) statusHeaderTitle.style.color = '#0b63d6';
        if (statusHeaderIcon) {
          statusHeaderIcon.style.border = '2.5px solid rgba(11,61,145,0.12)';
          statusHeaderIcon.style.borderTopColor = '#0b3d91';
          statusHeaderIcon.style.background = 'transparent';
        }
      } else {
        const titleEl = vtcStatusCard.querySelector('.vtc-status-title');
        if (titleEl) titleEl.style.color = '#fcd34d';
        if (statusHeaderTitle) statusHeaderTitle.style.color = '#fbbf24';
        if (statusHeaderIcon) {
          statusHeaderIcon.style.border = '2.5px solid rgba(252,211,77,0.2)';
          statusHeaderIcon.style.borderTopColor = '#fcd34d';
        }
      }
    } catch (e) { /* ignore */ }
  }

  function setStatusIconAndTitle(type) {
    if (!statusHeaderIcon || !statusHeaderTitle) return;
    if (type === 'success') {
      statusHeaderIcon.className = 'vtc-check';
      statusHeaderIcon.innerHTML = '&#10003;';
      statusHeaderTitle.style.color = '#34d399';
      statusHeaderTitle.textContent = tStatus('statusDone');
    } else if (type === 'error') {
      statusHeaderIcon.className = 'vtc-check';
      statusHeaderIcon.style.background = '#f87171';
      statusHeaderIcon.style.color = '#fff';
      statusHeaderIcon.innerHTML = '&#10007;';
      statusHeaderTitle.style.color = '#f87171';
      statusHeaderTitle.textContent = tStatus('statusErrorShort');
    } else {
      statusHeaderIcon.className = 'vtc-spinner';
      statusHeaderIcon.innerHTML = '';
      statusHeaderIcon.style.background = '';
      statusHeaderIcon.style.color = '';
      statusHeaderTitle.style.color = '#fbbf24';
      statusHeaderTitle.textContent = tStatus('statusGrabbingTitle');
    }
  }

  function renderSteps(type) {
    if (!statusStepsContainer) return;
    statusStepsContainer.innerHTML = statusSteps.map((step, i) => {
      const isDone = i < statusSteps.length - 1 || type === 'success';
      const isActive = i === statusSteps.length - 1 && type !== 'success' && type !== 'error';
      const cls = isDone ? 'done' : (isActive ? 'active' : '');
      const icon = isDone
        ? '<div class="vtc-check">&#10003;</div>'
        : (isActive ? '<div class="vtc-spinner"></div>' : '<div class="vtc-dot"></div>');
      return `<div class="vtc-step ${cls}">${icon}<span>${escHtml(step)}</span></div>`;
    }).join('');
  }

  function showStatus(title, type) {
    ensureStatusCard();
    setStatusIconAndTitle(type);
    renderSteps(type);
  }

  function pushStep(text) {
    statusSteps.push(text);
    showStatus(tStatus('statusGrabbingTitle'), 'info');
  }

  function updateStatus(html) {
    if (statusSteps.length === 0) return;
    statusSteps[statusSteps.length - 1] = html;
    showStatus(tStatus('statusGrabbingTitle'), 'info');
  }

  function removeStatus(delay) {
    if (!vtcStatusCard) return;
    setTimeout(() => {
      if (vtcStatusCard) {
        vtcStatusCard.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        vtcStatusCard.style.opacity = '0';
        vtcStatusCard.style.transform = 'translateX(40px) scale(0.95)';
        setTimeout(() => {
          if (vtcStatusCard && vtcStatusCard.parentNode) {
            vtcStatusCard.parentNode.removeChild(vtcStatusCard);
          }
          vtcStatusCard = null;
          statusStepsContainer = null;
          statusHeaderIcon = null;
          statusHeaderTitle = null;
          statusSteps = [];
        }, 400);
      }
    }, delay || 0);
  }

  pushStep(tStatus('statusStart'));

  // ── HELPERS ──────────────────────────────────────────────────────────
  const download = (name, content, type) => {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toCsv = rows => {
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const esc = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return [
      keys.map(esc).join(","),
      ...rows.map(row => keys.map(key => esc(row[key])).join(","))
    ].join("\n");
  };

  const escapeIcs = s => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n").replace(/\r/g, "");

  const toIcsCompactDate = raw => {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    // already compact
    if (/^\d{8}T\d{6}(Z)?$/.test(s)) return s;
    // ISO 2025-09-05T11:30:00 or 2025-09-05T11:30:00+08:00
    const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (m) return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}`;
    // fallback: try Date parsing
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const pad = n => String(n).padStart(2, "0");
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }
    return s;
  };

  const foldIcsLine = line => {
    // RFC 5545 lines must be <= 75 octets; fold with CRLF + space
    const result = [];
    let bytes = 0;
    let current = "";
    for (const char of line) {
      const charBytes = new Blob([char]).size;
      if (bytes + charBytes > 75) {
        result.push(current);
        current = " " + char;
        bytes = 1 + charBytes;
      } else {
        current += char;
        bytes += charBytes;
      }
    }
    if (current) result.push(current);
    return result.join("\r\n");
  };

  const toIcs = events => {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//VTC MyPortal Export//Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:VTC Timetable",
      "X-WR-TIMEZONE:Asia/Hong_Kong"
    ];

    const now = new Date();
    const nowStamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

    for (const ev of events) {
      const startRaw = ev.startDateTime || ev.start || ev.startTime || ev.begin || "";
      const endRaw   = ev.endDateTime   || ev.end   || ev.endTime   || ev.finish || "";
      if (!startRaw || !endRaw) continue;

      const dtStart = toIcsCompactDate(startRaw);
      const dtEnd   = toIcsCompactDate(endRaw);
      if (!dtStart || !dtEnd) continue;

      const summary = escapeIcs(ev.summary || ev.title || ev.name || ev.subject || "Lesson");
      const description = escapeIcs(ev.details || ev.description || "");
      const location = escapeIcs(ev.location || "");

      // build a stable UID similar to the portal export
      const uidStr = `${summary}-${dtStart}-${dtEnd}-IV`;
      const uid = typeof btoa === "function"
        ? btoa(unescape(encodeURIComponent(uidStr))).replace(/=+$/, "") + "@vtc-myportal"
        : `vtc-${summary.replace(/\s+/g, "_")}-${dtStart}@vtc-myportal`;

      lines.push("BEGIN:VEVENT");
      lines.push(foldIcsLine(`UID:${uid}`));
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`DTSTART;TZID=Asia/Hong_Kong:${dtStart}`);
      lines.push(`DTEND;TZID=Asia/Hong_Kong:${dtEnd}`);
      lines.push(foldIcsLine(`SUMMARY:${summary}`));
      if (description) lines.push(foldIcsLine(`DESCRIPTION:${description}`));
      if (location) lines.push(foldIcsLine(`LOCATION:${location}`));
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  };

  const renderDashboardOverlay = (semesterSummaries, details, calendarEvents) => {
    const old = document.getElementById("vtc-attendance-dashboard-overlay");
    if (old) old.remove();

    const semesterNames = Object.keys(semesterSummaries);
    const activeSemester = semesterNames[0];
    let currentSemester = activeSemester;
    let editMode = false;
    const manualOverrides = {};

    const applyOverrides = (summaries, semName) => {
      if (!summaries) return summaries;
      return summaries.map(s => {
        const key = `${semName}::${s.moduleCode}`;
        const override = manualOverrides[key];
        if (!override) return s;

        // support editing either per-sem calendar hours or the total calendar hours
        let newCalHours = s.calendarScheduledHours;
        let newTotalHours = s.totalCalendarScheduledHours ?? s.calendarScheduledHours;

        if (override.calendarScheduledHours != null) {
          newCalHours = +override.calendarScheduledHours;
        } else if (override.totalCalendarScheduledHours != null) {
          newTotalHours = +override.totalCalendarScheduledHours;
          // if we have an original total, preserve the same ratio for this semester
          if (s.totalCalendarScheduledHours && s.totalCalendarScheduledHours > 0) {
            const ratio = s.calendarScheduledHours / s.totalCalendarScheduledHours;
            newCalHours = +(ratio * newTotalHours).toFixed(2);
          } else {
            // fallback: if no original total, apply total as this semester's hours
            newCalHours = newTotalHours;
          }
        } else {
          return s;
        }
        const attHours = s.attendedHours;
        const recHours = s.attendanceRecordHours;
        const deductedHours = s.deductedHours;
        const recordMinutes = recHours * 60;
        const calendarMinutes = newCalHours * 60;
        const futureMinutes = Math.max(0, calendarMinutes - recordMinutes);
        const futureHours = +(futureMinutes / 60).toFixed(2);

        const attendedMinutes = attHours * 60;
        const currentHourRate = recordMinutes ? +((attendedMinutes / recordMinutes) * 100).toFixed(2) : s.currentHourRate;
        const bestPossibleFullTermRate = calendarMinutes ? +(((attendedMinutes + futureMinutes) / calendarMinutes) * 100).toFixed(2) : null;

        const neededHours = Math.max(0, (currentThreshold / 100) * newCalHours - attHours);
        const skipHours = futureHours > 0 ? Math.max(0, +(futureHours - neededHours).toFixed(2)) : 0;

        const effectiveAbsentRate = newCalHours > 0 ? +((deductedHours / newCalHours) * 100).toFixed(1) : 0;

        const status70 = currentHourRate == null ? "NO_RECORD" : currentHourRate < currentThreshold ? "BELOW_70_NOW" : "OK_NOW";
        const bestStatus70 = bestPossibleFullTermRate == null ? "NO_CALENDAR_MATCH" : bestPossibleFullTermRate < currentThreshold ? "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT" : "CAN_REACH_OR_KEEP_70_IF_FUTURE_PRESENT";

        return {
          ...s,
          calendarScheduledHours: newCalHours,
          totalCalendarScheduledHours: newTotalHours,
          futureCalendarHours: futureHours,
          currentHourRate,
          bestPossibleFullTermRate,
          skipAllowanceHours: skipHours,
          effectiveAbsentRate,
          overallEffectiveAbsentRate: effectiveAbsentRate,
          status70,
          bestStatus70,
          _manualOverride: true
        };
      });
    };

    const esc = value => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

    const getStatusLabel = s => {
      if (s.bestStatus70 === "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT") return "failed";
      if (s.status70 === "BELOW_70_NOW") return "almostPass";
      if (s.status70 === "NO_RECORD") return "noRecord";
      return "passed";
    };

    const getStatusColor = s => {
      if (s.bestStatus70 === "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT") return "#f87171";
      if (s.status70 === "BELOW_70_NOW") return "#fbbf24";
      if (s.status70 === "NO_RECORD") return "#a8a29e";
      return "#34d399";
    };

    // --- Translations / language support (uses top-level builtinTranslations) --------

    // Merge any externally-provided translations (e.g. src/bookmarklet/translations.js)
    const loadExternalTranslationsIfMissing = async () => {
      if (typeof window === 'undefined') return;
      if (window.vtcTranslations) return;

      try {
        // Try to find the script element that loaded this file
        const currentScript = document.currentScript || [...document.scripts].reverse().find(s => s.src && s.src.includes('vtc-combined-grabber'));
        if (!currentScript || !currentScript.src) return;

        const base = currentScript.src.replace(/\/[^/]*$/, '/');
        const translationsUrl = new URL('translations.js', base).href + '?v=' + Date.now();

        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = translationsUrl;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Failed to load translations.js'));
          document.head.appendChild(s);
        });
      } catch (e) {
        // ignore; we'll proceed without external translations
        console.warn('Could not auto-load translations.js', e);
      }
    };

    const translations = (() => {
      const ext = (typeof window !== 'undefined' && window.vtcTranslations) ? window.vtcTranslations : {};
      const langs = new Set([...Object.keys(builtinTranslations), ...Object.keys(ext)]);
      const out = {};
      for (const lang of langs) {
        out[lang] = Object.assign({}, builtinTranslations[lang] || {}, ext[lang] || {});
      }
      return out;
    })();

    let currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('vtc_lang')) || 'en';
    // Persist English as the default on first use so the default is explicit
    try {
      if (typeof localStorage !== 'undefined' && !localStorage.getItem('vtc_lang')) {
        localStorage.setItem('vtc_lang', 'en');
      }
    } catch (e) {}
    const t = (key) => (translations[currentLang] && translations[currentLang][key]) || (translations.en && translations.en[key]) || key;
    const tSemName = (name) => {
      if (name === 'Overall') return t('overall');
      const m = name.match(/^Sem\s+(\d+)$/i);
      if (m) return (t('semesterFmt') || 'Sem {n}').replace('{n}', m[1]);
      return name;
    };

    // If external translations were not present at parse time, try to load them
    // asynchronously so edits to translations.js can take effect. We do this
    // without `await` to avoid using `await` inside a non-async function.
    (async function tryLoadTranslations(){
      if (typeof window === 'undefined') return;
      if (window.vtcTranslations) return;
      await loadExternalTranslationsIfMissing();

      // If translations were loaded dynamically, merge them into translations
      if (window.vtcTranslations) {
        for (const [lang, map] of Object.entries(window.vtcTranslations)) {
          translations[lang] = Object.assign({}, builtinTranslations[lang] || {}, map || {});
        }
        currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('vtc_lang')) || currentLang;
      }
      // Helper to merge translations object into `translations`
    }());

    // If portal theme is active, adjust any inline-styled panels that used dark backgrounds
    try {
      if (overlay && overlay.classList.contains('vtc-theme-portal')) {
        const panel = overlay.querySelector('#vtc-ics-filter-panel');
        if (panel) {
          panel.style.background = '#ffffff';
          panel.style.border = '1px solid rgba(11,61,145,0.08)';
          panel.style.color = '#0b3d91';
          panel.style.boxShadow = '0 8px 24px rgba(14,30,37,0.06)';
        }

        // also fix the dynamically-created bar/tooltips inside the overlay
        const barTips = overlay.querySelectorAll('.vtc-bar-tip');
        barTips.forEach(b => {
          // ensure data-tip popups use portal styling via CSS class on overlay
        });
      }
    } catch (e) { /* ignore */ }

    // If the portal page is set to Chinese (Simplified/Traditional) the
    // English link text used by the scraper (eg. "Calendar", "Profile")
    // won't be present. Detect likely Chinese page language and notify
    // the user to switch the site back to English before continuing.
    const looksLikeChinesePage = () => {
      try {
        // Only trust the page itself, not the browser/OS language.
        const docLang = (document.documentElement && (document.documentElement.lang || document.documentElement.getAttribute('lang')) || '').toLowerCase();
        if (docLang && docLang.startsWith('zh')) return true;

        // Heuristic: proportion of Chinese characters in visible text
        const text = (document.body && document.body.innerText) ? document.body.innerText.slice(0, 2000) : '';
        if (text) {
          const chineseMatches = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g) || [];
          const ratio = chineseMatches.length / Math.max(1, text.length);
          if (ratio > 0.08) return true; // >8% Chinese characters in first 2k chars -> likely Chinese page
        }
      } catch (e) {
        console.warn('Language detection failed', e);
      }
      return false;
    };

    if (looksLikeChinesePage()) {
      console.warn('[VTC] Chinese portal page detected; scraper will attempt Chinese link text lookup.');
    }

    const fmtSkip = (h, avgLessonHours = 2) => {
      if (h == null || Number.isNaN(h) || h <= 0) return t('mustAttendAll');

      const m = Math.round(h * 60);
      const hr = Math.floor(h);
      const min = Math.round((h - hr) * 60);

      let timeStr;
      if (h >= 24) {
        const d = Math.floor(h / 24);
        const rem = Math.floor(h % 24);
        timeStr = rem > 0 ? `${d}d ${rem}h` : `${d}d`;
      } else if (hr >= 1) {
        timeStr = min > 0 ? `${hr}h ${min}m` : `${hr}h`;
      } else {
        timeStr = `${m}m`;
      }

      // relatable approximation using actual avg lesson duration
      let approx = "";
      const lessons = avgLessonHours > 0 ? h / avgLessonHours : 0;
      const avgH = Math.round(avgLessonHours * 10) / 10;

      // Helper to format integer/half lessons using translation when possible
      const fmtLessons = (value) => {
        // value may be integer or .5
        if (value === 0.5) return t('approxHalf').replace('{avg}', avgH);
        if (value === 0.25) return t('approxQuarter').replace('{avg}', avgH);
        if (Number.isInteger(value)) {
          const n = value;
          const plural = n > 1 ? 's' : '';
          return t('approxLessonFmt').replace('{n}', n).replace('{plural}', plural).replace('{avg}', avgH);
        }
        // fallback: show decimal with one fraction if .5 else two-digit
        const rounded = Math.round(value * 2) / 2; // to nearest 0.5
        if (rounded === 0.5) return t('approxHalf').replace('{avg}', avgH);
        if (rounded >= 1) {
          const whole = Math.floor(rounded);
          const rem = rounded - whole;
          if (rem === 0.5) return t('approxLessonFmt').replace('{n}', `${whole + 0.5}`).replace('{plural}', (whole + 0.5) > 1 ? 's' : '').replace('{avg}', avgH);
          return t('approxLessonFmt').replace('{n}', whole).replace('{plural}', whole > 1 ? 's' : '').replace('{avg}', avgH);
        }
        return `${Math.round(value * 100) / 100} ${t('futShort') || 'lesson'}`;
      };

      if (lessons >= 1) {
        const rounded = Math.round(lessons * 2) / 2; // nearest 0.5
        approx = fmtLessons(rounded);
      } else if (lessons >= 0.75) {
        approx = fmtLessons(1);
      } else if (lessons >= 0.5) {
        approx = t('approxHalf').replace('{avg}', avgH);
      } else if (lessons >= 0.25) {
        approx = t('approxQuarter').replace('{avg}', avgH);
      }

      if (approx) return t('skipAroundFmt').replace('{time}', timeStr).replace('{approx}', approx);
      return t('skipAroundFmt').replace('{time}', timeStr).replace(' ({approx})', '');
    };

    const buildRows = summaries => {
      const sorted = [...summaries].sort((a, b) => {
        const ar = a.bestPossibleFullTermRate ?? a.currentHourRate ?? -1;
        const br = b.bestPossibleFullTermRate ?? b.currentHourRate ?? -1;
        return ar - br;
      });

      return sorted.map(s => {
        const current = s.currentHourRate;
        const best = s.bestPossibleFullTermRate;
        const color = getStatusColor(s);
        const label = getStatusLabel(s);
        const isFailed = s.bestStatus70 === "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT";
        const isCrossSem = /M$/i.test(s.moduleCode);
        const isOverallView = currentSemester === "Overall";
        const skipText = (!isFailed && s.futureCalendarHours > 0 && s.skipAllowanceHours != null) ? fmtSkip(s.skipAllowanceHours, s.avgLessonHours || 2) : "";
        const skipColor = (s.skipAllowanceHours || 0) > 0 ? "#34d399" : "#f87171";

        // Removed the earlier cheeky message; keep empty when failed
        const failText = "";

        const totalHours = s.totalCalendarScheduledHours ?? s.calendarScheduledHours;
        const editIndicator = s._manualOverride ? `<span title="manually adjusted" style="color:#fbbf24;margin-left:4px;">&#9998;</span>` : "";
        const baseHoursDisplay = (isCrossSem && !isOverallView && totalHours !== s.calendarScheduledHours)
          ? `${esc(s.attendedHours)} / ${esc(s.calendarScheduledHours)} h${editIndicator} <span class="vtc-total-hours" style="color:#a8a29e;font-size:0.7rem;">(total: ${esc(totalHours)} h)</span>`
          : `${esc(s.attendedHours)} / ${esc(s.calendarScheduledHours)} h${editIndicator}`;
        // In edit mode we allow editing the TOTAL hours only. Keep the per-sem display and show an input for total.
        const hoursDisplay = editMode
          ? `${baseHoursDisplay} <span class="vtc-edit-label">total: <input type="number" class="vtc-hours-input" data-module="${esc(s.moduleCode)}" data-field="total" value="${esc(totalHours)}" step="0.01"> h</span>`
          : baseHoursDisplay;

        const lowHourWarn = ((isCrossSem ? totalHours : s.calendarScheduledHours) <= 32)
          ? `<div class="vtc-skip" style="color:#f87171;font-weight:700;">${esc(t('skipWarning'))}</div>`
          : "";

        const lanWarn = "";

        const effVal = (isCrossSem && !isOverallView) ? (s.overallEffectiveAbsentRate ?? s.effectiveAbsentRate) : s.effectiveAbsentRate;
        const effLabel = (isCrossSem && !isOverallView) ? `${t('overall')} ${t('absentRateLabel')}` : t('absentRateLabel');
        const absentWarn = effVal >= 30 ? ` <span class="vtc-absent-warn">${esc(t('absentWarnInstantFail'))}</span>` : "";
        const absentColor = effVal >= 30 ? "#f87171" : "#fb923c";
        // show effective absent rate when there are absences OR lates (late still impacts attendance)
        const effDisplay = effVal != null ? Math.round(effVal) : null;
        const roundPart = effDisplay != null ? esc(t('roundUpFmt')).replace('{n}', effDisplay) : '';
        const absentText = ((s.absent > 0 || s.late > 0) && effVal != null) ? `<div class="vtc-absent" style="color:${absentColor};">${effLabel}: ${effVal}% ${roundPart}${absentWarn}</div>` : "";
        const lateLessons = s.avgLessonHours > 0 ? Math.round(s.lateHours / s.avgLessonHours) : 0;
        const lateApprox = lateLessons > 0 ? ` (≈ ${lateLessons} lesson${lateLessons > 1 ? 's' : ''})` : '';
        const lateText = (s.lateHours > 0) ? `<div class="vtc-absent" style="color:#fbbf24;">${esc(t('lateLabel'))}: ${esc(s.lateHours)} h${lateApprox}</div>` : "";
        const crossSemTag = isCrossSem ? `<span class="vtc-cross-sem vtc-th-tip" data-tip="${esc(t('crossSemTooltip'))}" aria-label="${esc(t('crossSem'))}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M21 7H3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                    <polyline points="17 3 21 7 17 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
                    <path d="M3 17H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                    <polyline points="7 21 3 17 7 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
                  </svg>
                </span>` : "";

        return `
          <tr>
            <td>
              <strong style="color:#fcd34d;font-size:1.05rem;">${esc(s.moduleCode)}</strong>
              ${crossSemTag}
              <div class="vtc-muted">${esc(s.moduleText)}</div>
              ${absentText}
              ${lateText}
              ${skipText ? `<div class="vtc-skip" style="color:${skipColor};">${esc(skipText)}</div>` : ""}
              ${lowHourWarn ? `<div class="vtc-skip" style="color:#f87171;font-weight:700;">${esc(t('skipWarning'))}</div>` : lowHourWarn}
              ${lanWarn}
              ${failText}
            </td>
            <td>${current == null ? "-" : current + "%"}</td>
            <td>${best == null ? "-" : best + "%"}</td>
            <td>${hoursDisplay}</td>
            <td>${esc(s.futureCalendarHours)} h</td>
            <td><span class="vtc-badge" style="background:${color}22;color:${color};border:1px solid ${color}44;">${esc(t(label))}</span></td>
          </tr>
          <tr>
            <td colspan="6">
              <div class="vtc-bar-wrap">
                <div class="vtc-bar vtc-best vtc-bar-tip" data-tip="${esc(best != null ? t('bestBarTipFmt').replace('{value}', best + '%') : t('na'))}" style="width:${Math.max(0, Math.min(100, best || 0))}%"></div>
                <div class="vtc-bar vtc-current vtc-bar-tip" data-tip="${esc(current != null ? t('currentBarTipFmt').replace('{value}', current + '%') : t('na'))}" style="width:${Math.max(0, Math.min(100, current || 0))}%"></div>
                <div class="vtc-threshold"></div>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    };

    const buildRating = summaries => {
      const total = summaries.length;
      if (total === 0) return { labelKey: "ratingUnknown", color: "#78716c", emoji: "&#128528;" };
      const green = summaries.filter(s => s.status70 === "OK_NOW").length;
      const red = summaries.filter(s => s.bestStatus70 === "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT").length;
      if (green / total >= 0.6) return { labelKey: "ratingExcellent", color: "#34d399", emoji: "&#128513;" };
      if (red / total >= 0.4) return { labelKey: "ratingBad", color: "#f87171", emoji: "&#128555;" };
      return { labelKey: "ratingNormal", color: "#fbbf24", emoji: "&#128528;" };
    };

    const buildPieChart = (summaries, rating) => {
      const green = summaries.filter(s => s.status70 === "OK_NOW").length;
      const yellow = summaries.filter(s => s.status70 === "BELOW_70_NOW" && s.bestStatus70 !== "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT").length;
      const red = summaries.filter(s => s.bestStatus70 === "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT").length;
      const grey = summaries.filter(s => s.status70 === "NO_RECORD").length;
      const total = summaries.length;
      if (total === 0) return '';

      const pct = v => total ? (v / total * 100) : 0;
      const pGreen = pct(green);
      const pYellow = pct(yellow);
      const pRed = pct(red);
      const pGrey = pct(grey);

      const stops = [];
      let cursor = 0;
      if (pGreen > 0) { stops.push(`#34d399 0% ${cursor + pGreen}%`); cursor += pGreen; }
      if (pYellow > 0) { stops.push(`#fbbf24 ${cursor}% ${cursor + pYellow}%`); cursor += pYellow; }
      if (pRed > 0) { stops.push(`#f87171 ${cursor}% ${cursor + pRed}%`); cursor += pRed; }
      if (pGrey > 0) { stops.push(`#78716c ${cursor}% ${cursor + pGrey}%`); }

      return `
        <div class="vtc-pie-wrap">
          <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;">
            <div class="vtc-pie" style="background: conic-gradient(${stops.join(', ')});"></div>
            <div class="vtc-pie-legend">
                      ${green > 0 ? `<span><span class="vtc-pie-dot" style="background:#34d399;"></span> ${esc(t('passed'))}: ${green}</span>` : ''}
                      ${yellow > 0 ? `<span><span class="vtc-pie-dot" style="background:#fbbf24;"></span> ${esc(t('almostPass'))}: ${yellow}</span>` : ''}
                      ${red > 0 ? `<span><span class="vtc-pie-dot" style="background:#f87171;"></span> ${esc(t('failed'))}: ${red}</span>` : ''}
                      ${grey > 0 ? `<span><span class="vtc-pie-dot" style="background:#78716c;"></span> ${esc(t('noRecord'))}: ${grey}</span>` : ''}
            </div>
          </div>
          ${rating ? `<span class="vtc-rating" style="color:${rating.color};">${rating.emoji} ${esc(t(rating.labelKey))}</span>` : ''}
        </div>
      `;
    };

    const initialSummaries = semesterSummaries[activeSemester] ? applyOverrides(semesterSummaries[activeSemester], activeSemester) : [];
    semesterSummaries[activeSemester] = initialSummaries;
    const initialRating = buildRating(initialSummaries);

    // Extract unique module codes from calendar events for ICS filter
    const getCalendarModuleCodes = () => {
      const codes = new Set();
      for (const ev of calendarEvents) {
        const code = moduleCodeFromText(getEventText(ev));
        if (code) codes.add(code);
      }
      return [...codes].sort();
    };
    const icsModules = getCalendarModuleCodes();

    const overlay = document.createElement("div");
    overlay.id = "vtc-attendance-dashboard-overlay";
    overlay.style.setProperty('--vtc-threshold', currentThreshold + '%');
    overlay.innerHTML = `
      <style>
        #vtc-attendance-dashboard-overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: #0a0a0a;
          color: #fef3c7;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 16px;
          overflow-x: hidden;
          overflow-y: auto;
          touch-action: pan-y;
        }
        #vtc-attendance-dashboard-overlay .vtc-dashboard {
          padding: 40px 48px;
          max-width: 1200px;
          margin: 0 auto;
        }
        #vtc-attendance-dashboard-overlay .vtc-sticky-header {
          position: sticky;
          top: 0;
          z-index: 10;
          background: #0a0a0a;
          padding: 16px 0 20px;
          border-bottom: 1px solid rgba(252,211,77,0.08);
          margin-bottom: 8px;
        }
        #vtc-attendance-dashboard-overlay .vtc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        #vtc-attendance-dashboard-overlay h1 {
          margin: 0;
          font-size: 2rem;
          color: #fcd34d;
        }
        #vtc-attendance-dashboard-overlay .vtc-close {
          background: rgba(252,211,77,0.15);
          color: #fcd34d;
          border: 1px solid rgba(252,211,77,0.3);
          border-radius: 8px;
          padding: 10px 20px;
          cursor: pointer;
          font-weight: 700;
          font-family: inherit;
          font-size: 1rem;
        }
        /* separate class for the edit button to avoid collisions with other site handlers
           keep identical styling so appearance is unchanged */
        #vtc-attendance-dashboard-overlay .vtc-edit {
          background: rgba(251,191,36,0.15);
          color: #fbbf24;
          border: 1px solid rgba(252,211,77,0.3);
          border-radius: 8px;
          padding: 10px 20px;
          cursor: pointer;
          font-weight: 700;
          font-family: inherit;
          font-size: 1rem;
        }
        #vtc-attendance-dashboard-overlay .vtc-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        #vtc-attendance-dashboard-overlay .vtc-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          gap: 6px;
        }
        /* theme toggle button */
        #vtc-attendance-dashboard-overlay .vtc-theme-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: rgba(255,255,255,0.02);
          color: #fcd34d;
          border: 1px solid rgba(252,211,77,0.06);
          cursor: pointer;
          font-size: 1.05rem;
        }
        #vtc-attendance-dashboard-overlay .vtc-actions-left {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-left: 0;
        }
        #vtc-attendance-dashboard-overlay .vtc-actions-right {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-left: auto;
        }
        #vtc-attendance-dashboard-overlay .vtc-downloads-section,
        #vtc-attendance-dashboard-overlay .vtc-downloads-top {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        #vtc-attendance-dashboard-overlay .vtc-downloads-section select,
        #vtc-attendance-dashboard-overlay .vtc-downloads-top select {
          padding: 8px 12px;
          border-radius: 6px;
          background: #141414;
          border: 1px solid rgba(252,211,77,0.25);
          color: #fcd34d;
          font-size: 0.9rem;
          font-family: inherit;
          cursor: pointer;
        }
        #vtc-attendance-dashboard-overlay .vtc-downloads-section button,
        #vtc-attendance-dashboard-overlay .vtc-downloads-top button {
          padding: 8px 16px;
          border-radius: 6px;
          background: rgba(120,53,15,0.5);
          border: 1px solid rgba(252,211,77,0.25);
          color: #fbbf24;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
          font-weight: 600;
        }
        #vtc-attendance-dashboard-overlay #vtc-dashboard-ics-btn {
          padding: 8px 16px;
          border-radius: 6px;
          background: rgba(6,78,59,0.4);
          border: 1px solid rgba(52,211,153,0.35);
          color: #34d399;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
          font-weight: 600;
        }
        #vtc-attendance-dashboard-overlay #vtc-dashboard-ics-btn:hover {
          background: rgba(6,78,59,0.6);
          border-color: rgba(52,211,153,0.55);
        }
        #vtc-attendance-dashboard-overlay #vtc-ics-filter-toggle {
          padding: 8px 16px;
          border-radius: 6px;
          background: rgba(120,53,15,0.5);
          border: 1px solid rgba(252,211,77,0.25);
          color: #fbbf24;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
          font-weight: 600;
        }
        #vtc-attendance-dashboard-overlay .vtc-muted {
          color: #78716c;
          font-size: 0.95rem;
          margin-top: 4px;
        }
        #vtc-attendance-dashboard-overlay .vtc-skip {
          font-size: 0.95rem;
          margin-top: 6px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        #vtc-attendance-dashboard-overlay .vtc-absent {
          font-size: 0.95rem;
          margin-top: 6px;
          font-weight: 700;
          color: #fb923c;
          letter-spacing: 0.02em;
        }
        #vtc-attendance-dashboard-overlay .vtc-lesson-impact {
          font-size: 0.68rem;
          margin-top: 4px;
          color: #fbbf24;
          font-weight: 700;
          opacity: 0.95;
        }
        @media (max-width: 768px) {
          #vtc-attendance-dashboard-overlay .vtc-lesson-impact {
            display: none;
          }
          #vtc-attendance-dashboard-overlay .vtc-actions-right {
            margin-left: auto;
            gap: 6px;
          }
          #vtc-attendance-dashboard-overlay .vtc-edit,
          #vtc-attendance-dashboard-overlay .vtc-close {
            padding: 5px 8px;
            font-size: 0.72rem;
          }
        }
        /* Desktop layout: use the original centered dashboard column
           (restores previous web version appearance). */
        #vtc-attendance-dashboard-overlay.vtc-mode-desktop .vtc-dashboard {
          padding: 40px 48px;
          max-width: 1200px;
          margin: 0 auto;
          width: auto;
        }
        /* Ensure dashboard uses border-box so padding doesn't reduce inner width */
        #vtc-attendance-dashboard-overlay.vtc-mode-desktop .vtc-dashboard {
          box-sizing: border-box;
        }
        #vtc-attendance-dashboard-overlay .vtc-absent-warn {
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.95rem;
          letter-spacing: 0.04em;
          color: #f87171;
          text-shadow: 0 0 6px rgba(248,113,113,0.9), 0 0 12px rgba(248,113,113,0.6);
          animation: vtc-absent-glow 1.8s ease-in-out infinite;
        }
        /* Portal theme (MyPortal-like: white background, blue text) */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal {
          background: #ffffff;
          color: #0b3d91; /* primary blue text */
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-dashboard {
          /* keep identical layout to dark theme so toggling theme doesn't resize bars */
          padding: 40px 48px;
          max-width: 1200px;
          margin: 0 auto;
          background: #ffffff;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-sticky-header {
          background: #ffffff;
          border-bottom: 1px solid rgba(11,61,145,0.06);
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal h1 { color: #0b3d91; }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-note { color: #0b63d6; }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-muted { color: #4b5563; }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-close {
          background: transparent;
          color: #0b3d91;
          border: 1px solid rgba(11,61,145,0.08);
          /* keep identical size to base theme so toggling theme doesn't resize */
          padding: 10px 20px;
          font-weight: 700;
          font-size: 1rem;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-edit {
          background: rgba(11,61,145,0.06);
          color: #0b3d91;
          border: 1px solid rgba(11,61,145,0.12);
          /* keep identical size to base theme so toggling theme doesn't resize */
          padding: 10px 20px;
          font-weight: 700;
          font-size: 1rem;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-edit-label {
          color: #4b5563;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-hours-input {
          background: #ffffff;
          border: 1px solid rgba(11,61,145,0.2);
          color: #0b3d91;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-theme-btn {
          background: rgba(11,61,145,0.06);
          color: #0b3d91;
          border-color: rgba(11,61,145,0.12);
        }

        /* More portal-theme fixes for legend, pie, rating and tooltips */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-pie::after {
          background: #ffffff;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-pie-legend {
          background: transparent;
          border: none;
          box-shadow: none;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-pie-legend span {
          color: #0b3d91;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-rating {
          background: rgba(11,61,145,0.04);
          color: #0b3d91;
          border: 1px solid rgba(11,61,145,0.12);
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-th-tip::after {
          background: #ffffff;
          border: 1px solid rgba(11,61,145,0.08);
          color: #0b3d91;
          box-shadow: 0 6px 18px rgba(14,30,37,0.06);
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-semester-select,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-lang-select,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-threshold-select {
          background: #ffffff;
          border: 1px solid rgba(11,61,145,0.06);
          color: #0b3d91;
        }
        /* Strong overrides to catch inline-styled dark panels/buttons created in the markup */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-panel,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-panel[style],
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-ics-section [style*="background: rgba(10,10,10"],
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-ics-section [style*="background:rgba(10,10,10"],
        #vtc-attendance-dashboard-overlay.vtc-theme-portal [style*="background: #141414"],
        #vtc-attendance-dashboard-overlay.vtc-theme-portal [style*="background: rgba(41,37,36"],
        #vtc-attendance-dashboard-overlay.vtc-theme-portal [style*="background: rgba(120,53,15"],
        #vtc-attendance-dashboard-overlay.vtc-theme-portal [style*="background: rgba(6,78,59"],
        #vtc-attendance-dashboard-overlay.vtc-theme-portal [style*="background: rgba(252,211,77" ] {
          background: #ffffff !important;
          border-color: rgba(11,61,145,0.08) !important;
          color: #0b3d91 !important;
          box-shadow: 0 8px 24px rgba(14,30,37,0.06) !important;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-panel .vtc-ics-section .vtc-ics-filter-toggle,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-panel .vtc-ics-filter-btn {
          background: transparent !important;
          color: #0b3d91 !important;
        }
        /* portal filter panel text colors so inline dark-theme colors don't stay on white bg */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-panel label,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-panel .vtc-ics-all {
          color: #0b3d91 !important;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-panel .vtc-ics-off,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-panel p {
          color: #6b7280 !important;
        }
        /* make inline gold module names / labels readable on white background */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal td strong[style*="color:#fcd34d"],
        #vtc-attendance-dashboard-overlay.vtc-theme-portal [style*="color:#fbbf24"] {
          color: #0b3d91 !important;
        }
        /* portal override for the ICS export button (was green on dark) */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-dashboard-ics-btn {
          background: rgba(11,61,145,0.06);
          border: 1px solid rgba(11,61,145,0.12);
          color: #0b3d91;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-dashboard-ics-btn:hover {
          background: rgba(11,61,145,0.12);
          border-color: rgba(11,61,145,0.18);
        }

        /* Portal overrides for elements that used dark inline styles */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-downloads-section select,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-downloads-top select {
          background: #ffffff;
          border: 1px solid rgba(11,61,145,0.06);
          color: #0b3d91;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-downloads-section button,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-downloads-top button,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-export-btn,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-export-filter-btn {
          background: rgba(11,61,145,0.06);
          border: 1px solid rgba(11,61,145,0.12);
          color: #0b3d91;
        }
        /* high-specificity portal override to beat base #vtc-ics-filter-toggle rule */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal #vtc-ics-filter-toggle {
          background: rgba(11,61,145,0.06);
          border: 1px solid rgba(11,61,145,0.12);
          color: #0b3d91;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal select,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal input,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal textarea {
          background: #ffffff;
          color: #0b3d91;
          border: 1px solid rgba(14,30,37,0.06);
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal td,
        #vtc-attendance-dashboard-overlay.vtc-theme-portal th {
          color: #0b3d91;
        }

        @keyframes vtc-absent-glow {
          0% { text-shadow: 0 0 4px rgba(248,113,113,0.8); }
          50% { text-shadow: 0 0 14px rgba(248,113,113,0.98); }
          100% { text-shadow: 0 0 4px rgba(248,113,113,0.8); }
        }
          letter-spacing: 0.05em;
        }
        #vtc-attendance-dashboard-overlay td {
          color: #d6d3d1;
        }
        #vtc-attendance-dashboard-overlay .vtc-badge {
          display: inline-block;
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 13px;
          font-weight: 700;
          text-transform: lowercase;
          letter-spacing: 0.02em;
        }
        #vtc-attendance-dashboard-overlay .vtc-edit-label {
          margin-left: 8px;
          color: #a8a29e;
          font-size: 0.9rem;
        }
        #vtc-attendance-dashboard-overlay .vtc-hours-input {
          width: 90px;
          background: #141414;
          border: 1px solid rgba(252,211,77,0.3);
          color: #fcd34d;
          border-radius: 4px;
          padding: 4px 6px;
          font-family: inherit;
          font-size: 0.9rem;
        }
        #vtc-attendance-dashboard-overlay .vtc-bar-wrap {
          position: relative;
          height: 10px;
          background: rgba(255,255,255,0.06);
          border-radius: 999px;
        }
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-bar-wrap {
          background: rgba(11,61,145,0.06);
        }
        #vtc-attendance-dashboard-overlay .vtc-bar {
          position: absolute;
          left: 0;
          top: 0;
          height: 10px;
          border-radius: 999px;
        }
        #vtc-attendance-dashboard-overlay .vtc-current {
          background: #60a5fa;
          opacity: .85;
          cursor: help;
        }
        #vtc-attendance-dashboard-overlay .vtc-current:hover {
          opacity: 1;
          box-shadow: 0 0 8px rgba(96,165,250,0.5);
        }
        #vtc-attendance-dashboard-overlay .vtc-best {
          background: #22c55e;
          opacity: .35;
          cursor: help;
        }
        #vtc-attendance-dashboard-overlay .vtc-best:hover {
          opacity: .6;
          box-shadow: 0 0 8px rgba(34,197,94,0.4);
        }
        #vtc-attendance-dashboard-overlay .vtc-threshold {
          position: absolute;
          left: var(--vtc-threshold, 70%);
          top: 0;
          height: 10px;
          width: 2px;
          background: #f87171;
        }
        #vtc-attendance-dashboard-overlay .vtc-bar-tip {
          cursor: help;
        }
        #vtc-attendance-dashboard-overlay .vtc-bar-tip::after {
          content: attr(data-tip);
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 12px;
          border-radius: 6px;
          background: rgba(41,37,36,0.98);
          border: 1px solid rgba(252,211,77,0.2);
          color: #fbbf24;
          font-size: 0.95rem;
          font-weight: 600;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s;
          z-index: 2147483647;
        }
        #vtc-attendance-dashboard-overlay .vtc-bar-tip:hover::after,
        #vtc-attendance-dashboard-overlay .vtc-bar-tip.show-tip::after {
          opacity: 1;
        }
        #vtc-attendance-dashboard-overlay .vtc-pie-wrap {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin: 24px 0;
          flex-wrap: wrap;
          justify-content: space-between;
        }
        #vtc-attendance-dashboard-overlay .vtc-ics-section {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          margin-left: auto;
        }
        #vtc-attendance-dashboard-overlay .vtc-export-btn {
          padding: 8px 16px;
          border-radius: 6px;
          background: rgba(6,78,59,0.4);
          border: 1px solid rgba(52,211,153,0.35);
          color: #34d399;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
          font-weight: 600;
        }
        #vtc-attendance-dashboard-overlay .vtc-export-btn:hover {
          background: rgba(6,78,59,0.6);
          border-color: rgba(52,211,153,0.55);
        }
        #vtc-attendance-dashboard-overlay .vtc-export-filter-btn {
          padding: 8px 16px;
          border-radius: 6px;
          background: rgba(120,53,15,0.5);
          border: 1px solid rgba(252,211,77,0.25);
          color: #fbbf24;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
          font-weight: 600;
        }
        #vtc-attendance-dashboard-overlay .vtc-pie {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          position: relative;
          flex-shrink: 0;
        }
        #vtc-attendance-dashboard-overlay .vtc-pie::after {
          content: '';
          position: absolute;
          inset: 28px;
          border-radius: 50%;
          background: #0a0a0a;
        }
        #vtc-attendance-dashboard-overlay .vtc-pie-legend {
          background: transparent;
          border: none;
          box-shadow: none;
          color: #fbbf24;
        }
        #vtc-attendance-dashboard-overlay .vtc-pie-legend span {
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #d6d3d1;
        }
        /* portal variant for bar tooltip */
        #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-bar-tip::after {
          background: #ffffff;
          border: 1px solid rgba(11,61,145,0.08);
          color: #0b3d91;
          box-shadow: 0 6px 18px rgba(14,30,37,0.06);
        }
        #vtc-attendance-dashboard-overlay .vtc-pie-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }
        #vtc-attendance-dashboard-overlay .vtc-rating {
          display: inline-block;
          padding: 6px 18px;
          border-radius: 999px;
          font-size: 0.95rem;
          font-weight: 700;
          text-transform: lowercase;
          letter-spacing: 0.05em;
          background: rgba(0,0,0,0.3);
          border: 1px solid currentColor;
        }
        #vtc-attendance-dashboard-overlay .vtc-semester-select {
          padding: 6px 12px;
          border-radius: 6px;
          background: #141414;
          border: 1px solid rgba(252,211,77,0.25);
          color: #fcd34d;
          font-size: 0.85rem;
          font-family: inherit;
          cursor: pointer;
        }
        #vtc-attendance-dashboard-overlay .vtc-lang-select {
          padding: 6px 10px;
          border-radius: 6px;
          background: #141414;
          border: 1px solid rgba(252,211,77,0.25);
          color: #fcd34d;
          font-size: 0.85rem;
          font-family: inherit;
          cursor: pointer;
          margin-right: 8px;
        }
        #vtc-attendance-dashboard-overlay .vtc-threshold-select {
          padding: 6px 8px;
          border-radius: 6px;
          background: #141414;
          border: 1px solid rgba(252,211,77,0.25);
          color: #fcd34d;
          font-size: 0.85rem;
          font-family: inherit;
          cursor: pointer;
        }
        /* header/info tooltip (i) */
        #vtc-attendance-dashboard-overlay .vtc-th-tip {
          position: relative;
          cursor: help;
          white-space: nowrap;
          display: inline-block;
        }
        #vtc-attendance-dashboard-overlay .vtc-th-tip::after {
          content: attr(data-tip);
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          transform: none;
          padding: 10px 14px;
          border-radius: 8px;
          background: rgba(41,37,36,0.98);
          border: 1px solid rgba(252,211,77,0.2);
          color: #fbbf24;
          font-size: 1rem;
          font-weight: 500;
          text-transform: none;
          letter-spacing: normal;
          white-space: normal;
          min-width: 160px;
          max-width: 360px;
          text-align: left;
          line-height: 1.4;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s ease;
          z-index: 2147483647;
        }
        #vtc-attendance-dashboard-overlay .vtc-th-tip:hover::after,
        #vtc-attendance-dashboard-overlay .vtc-th-tip.show-tip::after {
          opacity: 1;
        }
        #vtc-attendance-dashboard-overlay th,
        #vtc-attendance-dashboard-overlay td {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(252,211,77,0.08);
          text-align: left;
          vertical-align: middle; /* align header and cells vertically */
          font-size: 1rem;
          overflow: visible;
        }
        #vtc-attendance-dashboard-overlay .vtc-th-short {
          display: none;
        }
        @media (max-width: 768px) {
          #vtc-attendance-dashboard-overlay.vtc-mode-desktop .vtc-dashboard,
          #vtc-attendance-dashboard-overlay .vtc-dashboard {
            padding: 8px 4px !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            box-sizing: border-box;
            overflow-x: hidden;
          }
          #vtc-attendance-dashboard-overlay h1 {
            font-size: 1.15rem;
            padding-right: 60px;
          }
          #vtc-attendance-dashboard-overlay .vtc-sticky-header {
            padding: 12px 0 14px;
          }
          #vtc-attendance-dashboard-overlay .vtc-header {
            flex-wrap: wrap;
            gap: 8px;
          }
          #vtc-attendance-dashboard-overlay .vtc-header-actions {
            width: 100%;
            justify-content: flex-start;
            gap: 6px;
          }
          #vtc-attendance-dashboard-overlay .vtc-header-row {
            width: 100%;
            gap: 6px;
          }
          #vtc-attendance-dashboard-overlay .vtc-actions-left {
            margin-left: 0;
          }
          #vtc-attendance-dashboard-overlay .vtc-actions-right {
            margin-left: 0;
            gap: 6px;
          }
          #vtc-attendance-dashboard-overlay .vtc-muted {
            display: none;
          }
          #vtc-attendance-dashboard-overlay .vtc-downloads-section,
          #vtc-attendance-dashboard-overlay .vtc-downloads-top {
            margin-top: 0;
            flex: 1;
            min-width: 0;
            gap: 6px;
          }
          #vtc-attendance-dashboard-overlay .vtc-downloads-section select,
          #vtc-attendance-dashboard-overlay .vtc-downloads-top select {
            font-size: 0.85rem;
            padding: 6px 10px;
            flex: 1;
            min-width: 0;
          }
          #vtc-attendance-dashboard-overlay .vtc-downloads-section button,
          #vtc-attendance-dashboard-overlay .vtc-downloads-top button {
            font-size: 0.82rem;
            padding: 6px 12px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay #vtc-dashboard-ics-btn {
            font-size: 0.82rem;
            padding: 6px 12px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay #vtc-ics-filter-toggle {
            font-size: 0.82rem;
            padding: 6px 12px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay .vtc-ics-section {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
            margin-left: auto;
          }
          #vtc-attendance-dashboard-overlay .vtc-export-btn,
          #vtc-attendance-dashboard-overlay .vtc-export-filter-btn {
            font-size: 0.82rem;
            padding: 6px 12px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay #vtc-ics-filter-panel {
            right: 0;
            left: auto;
            width: 260px;
            max-width: calc(100vw - 20px);
          }
          #vtc-attendance-dashboard-overlay .vtc-header {
            position: relative;
          }
          #vtc-attendance-dashboard-overlay .vtc-close {
            font-size: 0.82rem;
            padding: 6px 12px;
            white-space: nowrap;
            margin-left: auto;
          }
          #vtc-attendance-dashboard-overlay .vtc-edit {
            font-size: 0.82rem;
            padding: 6px 12px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-close,
          #vtc-attendance-dashboard-overlay.vtc-theme-portal .vtc-edit {
            padding: 6px 12px;
            font-size: 0.82rem;
          }
          #vtc-attendance-dashboard-overlay .vtc-bar-wrap,
          #vtc-attendance-dashboard-overlay .vtc-bar {
            height: 3px;
          }
          #vtc-attendance-dashboard-overlay .vtc-threshold {
            height: 3px;
          }
          #vtc-attendance-dashboard-overlay .vtc-bar-tip::after {
            font-size: 0.85rem;
            padding: 6px 10px;
            bottom: calc(100% + 4px);
          }
          #vtc-attendance-dashboard-overlay .vtc-cards {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
          #vtc-attendance-dashboard-overlay .vtc-card {
            padding: 10px;
          }
          #vtc-attendance-dashboard-overlay .vtc-card .num {
            font-size: 1.3rem;
          }
          #vtc-attendance-dashboard-overlay .vtc-pie-wrap {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
          }
          #vtc-attendance-dashboard-overlay .vtc-rating {
            margin: 0;
          }
          #vtc-attendance-dashboard-overlay th,
          #vtc-attendance-dashboard-overlay td {
            padding: 6px 5px;
            font-size: 0.78rem;
          }
          #vtc-attendance-dashboard-overlay table {
            display: table;
            table-layout: auto;
            width: 100%;
            min-width: 0;
            white-space: normal;
            border-radius: 8px;
          }
          #vtc-attendance-dashboard-overlay .vtc-table-scroll {
            -webkit-overflow-scrolling: touch;
            margin: 0;
            padding: 0;
          }

          /* Desktop-mode tweaks: stretch table and give cells more padding */
          #vtc-attendance-dashboard-overlay.vtc-mode-desktop .vtc-table-scroll {
            margin: 0;
            padding: 0;
            width: 100%;
            display: block;
            overflow-x: auto;
          }
          /* force the table to fill the dashboard column; use a targeted
             selector that should win over most host rules */
          #vtc-attendance-dashboard-overlay.vtc-mode-desktop .vtc-table-scroll > table,
          #vtc-attendance-dashboard-overlay.vtc-mode-desktop table {
            width: 100% !important;
            table-layout: fixed !important;
            min-width: 900px;
          }
          #vtc-attendance-dashboard-overlay.vtc-mode-desktop th,
          #vtc-attendance-dashboard-overlay.vtc-mode-desktop td {
            padding: 12px 16px;
            font-size: 0.95rem;
            vertical-align: middle;
            white-space: normal;
          }
          /* Dark theme scrollbar (same width/behavior as portal) */
          #vtc-attendance-dashboard-overlay::-webkit-scrollbar {
            width: 6px;
          }
          #vtc-attendance-dashboard-overlay::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
            border-radius: 4px;
          }
          #vtc-attendance-dashboard-overlay::-webkit-scrollbar-thumb {
            background: rgba(252,211,77,0.3);
            border-radius: 4px;
          }
          /* Portal theme scrollbar */
          #vtc-attendance-dashboard-overlay.vtc-theme-portal::-webkit-scrollbar {
            width: 6px;
          }
          #vtc-attendance-dashboard-overlay.vtc-theme-portal::-webkit-scrollbar-track {
            background: rgba(11,61,145,0.06);
            border-radius: 4px;
          }
          #vtc-attendance-dashboard-overlay.vtc-theme-portal::-webkit-scrollbar-thumb {
            background: rgba(11,61,145,0.2);
            border-radius: 4px;
          }
          /* Prevent data columns from wrapping on mobile so they stay compact */
          #vtc-attendance-dashboard-overlay td:nth-child(2),
          #vtc-attendance-dashboard-overlay td:nth-child(3),
          #vtc-attendance-dashboard-overlay td:nth-child(4),
          #vtc-attendance-dashboard-overlay td:nth-child(5),
          #vtc-attendance-dashboard-overlay td:nth-child(6) {
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay .vtc-badge {
            padding: 2px 6px;
            font-size: 0.65rem;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay .vtc-skip,
          #vtc-attendance-dashboard-overlay .vtc-absent {
            font-size: 0.72rem;
          }
          #vtc-attendance-dashboard-overlay .vtc-cross-sem {
            display: inline-block;
            font-size: 0.75rem;
            padding: 2px 6px;
            font-weight: 700;
            margin-left: 4px;
            vertical-align: middle;
            color: #34d399;
            background: rgba(52,211,153,0.06);
            border: 1px solid rgba(52,211,153,0.14);
            border-radius: 999px;
            line-height: 1;
          }
          #vtc-attendance-dashboard-overlay .vtc-th-long {
            display: none;
          }
          /* Mobile: left-align tooltips for left-side columns */
          #vtc-attendance-dashboard-overlay th:nth-child(1) .vtc-th-tip::after,
          #vtc-attendance-dashboard-overlay th:nth-child(2) .vtc-th-tip::after,
          #vtc-attendance-dashboard-overlay th:nth-child(3) .vtc-th-tip::after {
            left: 0;
            right: auto;
            transform: none;
          }
          /* Mobile: right-align tooltips for right-side columns */
          #vtc-attendance-dashboard-overlay th:nth-child(4) .vtc-th-tip::after,
          #vtc-attendance-dashboard-overlay th:nth-child(5) .vtc-th-tip::after,
          #vtc-attendance-dashboard-overlay th:nth-child(6) .vtc-th-tip::after {
            left: auto;
            right: 0;
            transform: none;
          }
          #vtc-attendance-dashboard-overlay .vtc-th-tip::after {
            min-width: 120px;
            max-width: min(80vw, 260px);
            font-size: 0.85rem;
            padding: 8px 10px;
          }
          #vtc-attendance-dashboard-overlay .vtc-th-short {
            display: inline;
          }
          #vtc-attendance-dashboard-overlay td .vtc-muted {
            display: none;
          }
          #vtc-attendance-dashboard-overlay td:first-child strong {
            font-size: 1.1rem;
          }
          #vtc-attendance-dashboard-overlay .vtc-total-hours {
            display: block;
            margin-top: 2px;
          }
          #vtc-attendance-dashboard-overlay .vtc-edit-label {
            display: block;
            margin-left: 0;
            margin-top: 4px;
          }
          #vtc-attendance-dashboard-overlay .vtc-pie {
            width: 110px;
            height: 110px;
          }
          #vtc-attendance-dashboard-overlay .vtc-pie::after {
            inset: 20px;
          }
        }
        /* Explicit desktop rules to ensure desktop layout applies for widths >= 769px */
        @media (min-width: 769px) {
          #vtc-attendance-dashboard-overlay .vtc-dashboard {
            padding: 40px 48px;
          }
          #vtc-attendance-dashboard-overlay .vtc-header {
            flex-wrap: nowrap;
            gap: 16px;
          }
          #vtc-attendance-dashboard-overlay .vtc-header-row {
            width: auto;
            flex-shrink: 0;
            justify-content: flex-start;
          }
          #vtc-attendance-dashboard-overlay .vtc-header-row:nth-child(2) {
            margin-left: auto;
          }
          #vtc-attendance-dashboard-overlay .vtc-actions-right {
            margin-left: 0;
            gap: 8px;
          }
          #vtc-attendance-dashboard-overlay .vtc-edit,
          #vtc-attendance-dashboard-overlay .vtc-close {
            padding: 10px 20px;
            font-size: 1rem;
          }
          #vtc-attendance-dashboard-overlay .vtc-bar-wrap,
          #vtc-attendance-dashboard-overlay .vtc-bar {
            height: 10px !important;
          }
          #vtc-attendance-dashboard-overlay table {
            table-layout: fixed;
            width: 100%;
          }
          #vtc-attendance-dashboard-overlay th:nth-child(1),
          #vtc-attendance-dashboard-overlay td:nth-child(1) { width: 30%; }
          #vtc-attendance-dashboard-overlay th:nth-child(2),
          #vtc-attendance-dashboard-overlay td:nth-child(2) { width: 10%; }
          #vtc-attendance-dashboard-overlay th:nth-child(3),
          #vtc-attendance-dashboard-overlay td:nth-child(3) { width: 12%; }
          #vtc-attendance-dashboard-overlay th:nth-child(4),
          #vtc-attendance-dashboard-overlay td:nth-child(4) { width: 14%; }
          #vtc-attendance-dashboard-overlay th:nth-child(5),
          #vtc-attendance-dashboard-overlay td:nth-child(5) { width: 10%; }
          #vtc-attendance-dashboard-overlay th:nth-child(6),
          #vtc-attendance-dashboard-overlay td:nth-child(6) { width: 14%; }
        }
        /* Also force desktop-specific label visibility when overlay is in desktop mode
           (this avoids relying solely on media queries which can be affected by host page viewports) */
        #vtc-attendance-dashboard-overlay.vtc-mode-desktop .vtc-th-long {
          display: inline !important;
        }
        #vtc-attendance-dashboard-overlay.vtc-mode-desktop .vtc-th-short {
          display: none !important;
        }
        #vtc-attendance-dashboard-overlay.vtc-mode-desktop table {
          width: 100% !important;
          min-width: 900px !important;
        }
      </style>

      <div class="vtc-dashboard">
        <div style="background: rgba(220,38,38,0.12); border: 1px solid rgba(248,113,113,0.3); border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; text-align: center;">
          <p class="vtc-warning-title" style="margin: 0; color: #f87171; font-size: 1.1rem; font-weight: 700;">&#9888; ${esc(t('warningTitle'))}</p>
          <p class="vtc-warning-sub" style="margin: 6px 0 0; color: #fca5a5; font-size: 0.85rem;">${esc(t('warningSub'))}</p>
        </div>

        <div class="vtc-sticky-header">
          <div class="vtc-header">
            <div>
              <h1>${esc(t('title'))}</h1>
              <div class="vtc-muted vtc-legend">${esc(t('legend').replace('{threshold}', currentThreshold))}</div>
            </div>
            <div class="vtc-header-actions">
              <div class="vtc-header-row">
                <select id="vtc-semester-select" class="vtc-semester-select">
                  ${semesterNames.map(name => `<option value="${esc(name)}" ${name === activeSemester ? 'selected' : ''}>${esc(tSemName(name))}</option>`).join('')}
                </select>
                <select id="vtc-lang-select" class="vtc-lang-select">
                  ${Object.keys(translations).map(code => `<option value="${code}" ${code === currentLang ? 'selected' : ''}>${translations[code].languageName || code}</option>`).join('')}
                </select>
                <select id="vtc-threshold-select" class="vtc-threshold-select">
                  <option value="70" ${currentThreshold === 70 ? 'selected' : ''}>70%</option>
                  <option value="80" ${currentThreshold === 80 ? 'selected' : ''}>80%</option>
                </select>
              </div>
              <div class="vtc-header-row">
                <div class="vtc-actions-left">
                  <button id="vtc-theme-toggle" class="vtc-theme-btn" type="button" title="Toggle theme">🎨</button>
                  <button id="vtc-edit-mode-btn" class="vtc-edit" type="button">${esc(t('editMode'))}</button>
                </div>
                <div class="vtc-actions-right">
                  <button id="vtc-dashboard-close" class="vtc-close" type="button">${esc(t('close'))}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top:8px;margin-bottom:8px;">
          <div class="vtc-note" style="color:#fbbf24;font-size:0.95rem;font-weight:600;">${esc(t('noteEdit')).replace(' :-)', '\u00A0:-)')}</div>
        </div>
        <div id="vtc-pie">
          ${buildPieChart(initialSummaries, initialRating)}
        </div>

        <div style="display:flex;gap:10px;align-items:center;margin:16px 0;flex-wrap:wrap;">
          <div class="vtc-downloads-section" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <select id="vtc-dashboard-download-select">
              <option value="summary-json">${esc(t('summaryJson'))}</option>
              <option value="details-json">${esc(t('detailsJson'))}</option>
              <option value="summary-csv">${esc(t('summaryCsv'))}</option>
              <option value="details-csv">${esc(t('detailsCsv'))}</option>
            </select>
            <button id="vtc-dashboard-download-btn" type="button">${esc(t('download'))}</button>
          </div>

          ${icsModules.length > 0 ? `
          <div class="vtc-ics-section">
            <button id="vtc-dashboard-ics-btn" class="vtc-export-btn vtc-th-tip" type="button" data-tip="${esc(t('exportIcsTitle'))}">${esc(t('exportIcs'))}</button>
            <div style="position:relative;display:inline-block;">
              <button id="vtc-ics-filter-toggle" class="vtc-export-filter-btn" type="button">${esc(t('filterModules'))}</button>
              <div id="vtc-ics-filter-panel" style="display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:1000;width:220px;background:rgba(10,10,10,0.98);border:1px solid rgba(252,211,77,0.2);border-radius:8px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                <p style="margin:0 0 6px;font-size:0.75rem;color:#fcd34d;font-weight:600;">${esc(t('selectModulesToExport'))}</p>
                <div id="vtc-ics-filter-list" style="display:flex;flex-direction:column;max-height:200px;overflow-y:auto;"></div>
              </div>
            </div>
          </div>` : `
          <div class="vtc-ics-section">
            <button id="vtc-dashboard-ics-btn" class="vtc-export-btn" type="button" title="${esc(t('exportIcsTitle'))}">${esc(t('exportIcs'))}</button>
          </div>`}
        </div>

        <div class="vtc-table-scroll">
          <table>
            <thead>
              <tr>
                  <th><span class="vtc-th-tip" data-i18n-key="moduleHeader" data-i18n-tip="moduleTip" data-tip="${esc(t('moduleTip'))}">${esc(t('moduleHeader'))} &#9432;</span></th>
                  <th><span class="vtc-th-tip" data-i18n-key="currentHeader" data-i18n-tip="currentTip" data-tip="${esc(t('currentTip'))}"><span class="vtc-th-long">${esc(t('currentHeader'))}</span><span class="vtc-th-short">${esc(t('curShort') || 'cur')}</span> &#9432;</span></th>
                  <th><span class="vtc-th-tip" data-i18n-key="bestHeader" data-i18n-tip="bestTip" data-tip="${esc(t('bestTip'))}"><span class="vtc-th-long">${esc(t('bestHeader'))}</span><span class="vtc-th-short">${esc(t('bestShort') || 'best')}</span> &#9432;</span></th>
                  <th><span class="vtc-th-tip" data-i18n-key="hoursHeader" data-i18n-tip="hoursTip" data-tip="${esc(t('hoursTip'))}">${esc(t('hoursHeader'))} &#9432;</span></th>
                  <th><span class="vtc-th-tip" data-i18n-key="futureHeader" data-i18n-tip="futureTip" data-tip="${esc(t('futureTip'))}"><span class="vtc-th-long">${esc(t('futureHeader'))}</span><span class="vtc-th-short">${esc(t('futShort') || 'fut')}</span> &#9432;</span></th>
                  <th><span class="vtc-th-tip" data-i18n-key="statusHeader" data-i18n-tip="statusTip" data-tip="${esc(t('statusTip').replace('{threshold}', currentThreshold))}">${esc(t('statusHeader'))} &#9432;</span></th>
                </tr>
            </thead>
            <tbody id="vtc-table-body">${buildRows(initialSummaries)}</tbody>
          </table>
        </div>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(252,211,77,0.08); text-align: center; font-size: 0.8rem; color: #78716c;">
          <p style="margin: 0;">made with &#10084; by CKHO and yoke</p>
          <p style="margin: 6px 0 0;"><a href="https://kitzure.github.io/eggyolk/" target="_blank" style="color: #fbbf24; text-decoration: none;">kitzure.github.io/eggyolk</a></p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Theme initialization: prefer saved theme, default to portal (light)
    try {
      const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('vtc_theme') : null;
      if (!saved || saved === 'portal') {
        overlay.classList.add('vtc-theme-portal');
      } else {
        overlay.classList.remove('vtc-theme-portal');
      }
      const themeToggle = overlay.querySelector('#vtc-theme-toggle');
      if (themeToggle) {
        const updateIcon = () => {
          const activePortal = overlay.classList.contains('vtc-theme-portal');
          themeToggle.textContent = activePortal ? '🎨' : '🌓';
        };
        themeToggle.addEventListener('click', () => {
          const isPortal = overlay.classList.toggle('vtc-theme-portal');
          try { if (typeof localStorage !== 'undefined') localStorage.setItem('vtc_theme', isPortal ? 'portal' : 'compact'); } catch (e) {}
          updateIcon();
        });
        updateIcon();
      }
    } catch (e) { console.debug && console.debug('[VTC] theme init failed', e); }

    // Attempt to load translations from bookmarklet/translations.js (preferred).
    (async function tryLoadTranslations(){
      // determine a reasonable base URL to fetch resources from
      let base = '';
      const script = document.currentScript;
      if (script && script.src) {
        base = script.src.replace(/\/[^/]*$/, '/') ;
      } else {
        base = location.origin + '/src/bookmarklet/';
      }

      // Helper to merge translations object into `translations`
      const mergeTranslations = (obj) => {
        if (!obj) return;
        Object.keys(obj).forEach(lang => {
          translations[lang] = Object.assign({}, translations[lang] || {}, obj[lang]);
        });
      };

      try {
        // Try loading translations.js via script tag (easier to host/edit)
        const scriptUrl = base + 'translations.js?v=' + Date.now();
        await new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = scriptUrl;
          s.async = true;
          const clean = () => { if (s && s.parentNode) s.parentNode.removeChild(s); };
          s.onload = () => { try { if (window.vtcTranslations) mergeTranslations(window.vtcTranslations); } catch(e){}; clean(); resolve(); };
          s.onerror = () => { clean(); resolve(); };
          document.head.appendChild(s);
          // if neither onload nor onerror fire in 1500ms, continue
          setTimeout(() => { clean(); resolve(); }, 1500);
        });

        // Refresh language select options and UI after merging
        const langEl = overlay.querySelector('#vtc-lang-select');
        if (langEl) {
          langEl.innerHTML = Object.keys(translations).map(code => `
            <option value="${code}" ${code === currentLang ? 'selected' : ''}>${(translations[code] && translations[code].languageName) || code}</option>
          `).join('');
          updateCrossSemTexts();
        }
      } catch (err) {
        console.debug && console.debug('[VTC] translation loader error', err);
      }
    })();

    // Set mode class once on load; CSS media queries handle ongoing viewport changes.
    // We do NOT update this on resize to avoid flicker when scrollbars appear/disappear.
    (function setModeOnce() {
      try {
        const w = window.innerWidth || document.documentElement.clientWidth || 1024;
        if (w >= 769) {
          overlay.classList.add('vtc-mode-desktop');
          overlay.setAttribute('data-vtc-mode', 'desktop');
        } else {
          overlay.classList.add('vtc-mode-mobile');
          overlay.setAttribute('data-vtc-mode', 'mobile');
        }
      } catch (e) {}
    })();

    // debug badge removed in production build (was used for diagnostics)

    const fileMap = {
      'summary-json': () => ({ name: 'vtc-integrated-attendance-summary.json', mime: 'application/json;charset=utf-8', content: JSON.stringify(semesterSummaries[currentSemester], null, 2) }),
      'details-json': () => ({ name: 'vtc-integrated-attendance-details.json', mime: 'application/json;charset=utf-8', content: JSON.stringify(details, null, 2) }),
      'summary-csv': () => ({ name: 'vtc-integrated-attendance-summary.csv', mime: 'text/csv;charset=utf-8', content: toCsv(semesterSummaries[currentSemester]) }),
      'details-csv': () => ({ name: 'vtc-integrated-attendance-details.csv', mime: 'text/csv;charset=utf-8', content: toCsv(details) })
    };

    overlay.querySelector("#vtc-dashboard-close").addEventListener("click", () => {
      overlay.remove();
      // floating reopen button
      let eggBtn = document.getElementById('vtc-egg-reopen');
      if (eggBtn) eggBtn.remove();
      eggBtn = document.createElement('button');
      eggBtn.id = 'vtc-egg-reopen';
      eggBtn.innerHTML = '🍳';
      eggBtn.title = 'reopen VTC dashboard';
      eggBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483646;width:48px;height:48px;border-radius:50%;background:rgba(252,211,77,0.15);border:1px solid rgba(252,211,77,0.3);color:#fcd34d;font-size:1.4rem;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
      eggBtn.addEventListener('click', () => {
        eggBtn.remove();
        renderDashboardOverlay(semesterSummaries, details, calendarEvents);
      });
      document.body.appendChild(eggBtn);
    });
    overlay.querySelector("#vtc-dashboard-download-btn").addEventListener("click", () => {
      const select = overlay.querySelector("#vtc-dashboard-download-select");
      const key = select.value;
      const file = fileMap[key];
      if (file) {
        const { name, mime, content } = file();
        download(name, content, mime);
      }
    });
    // --- ICS module filter ---
    const icsSelected = new Set(icsModules); // default all selected

    const icsFilterPanel = overlay.querySelector("#vtc-ics-filter-panel");
    const icsFilterList = overlay.querySelector("#vtc-ics-filter-list");
    const icsFilterToggle = overlay.querySelector("#vtc-ics-filter-toggle");

    const renderIcsFilterList = () => {
      if (!icsFilterList || icsModules.length === 0) return;

      // Map module codes to semesters
      const moduleSemesterMap = {};
      for (const semName of semesterNames) {
        if (semName === 'Overall') continue;
        const mods = semesterSummaries[semName] || [];
        for (const mod of mods) {
          if (!moduleSemesterMap[mod.moduleCode]) moduleSemesterMap[mod.moduleCode] = [];
          if (!moduleSemesterMap[mod.moduleCode].includes(semName)) {
            moduleSemesterMap[mod.moduleCode].push(semName);
          }
        }
      }

      // Group ICS modules by semester
      const semGroups = {};
      const unassigned = [];
      for (const code of icsModules) {
        const sems = moduleSemesterMap[code];
        if (sems && sems.length > 0) {
          const primary = sems[0];
          if (!semGroups[primary]) semGroups[primary] = [];
          semGroups[primary].push(code);
        } else {
          unassigned.push(code);
        }
      }

      let html = '';
      let groupIndex = 0;
      for (const semName of semesterNames) {
        if (semName === 'Overall') continue;
        const codes = semGroups[semName];
        if (!codes || codes.length === 0) continue;
        html += `<div style="margin-bottom:10px;" data-ics-group="${esc(semName)}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <p style="margin:0;font-size:0.7rem;color:#a8a29e;font-weight:600;">${esc(tSemName(semName))}</p>
            <div style="display:flex;gap:6px;">
              <a href="#" class="vtc-ics-all" data-group="${esc(semName)}" style="font-size:0.8rem;color:#fbbf24;text-decoration:none;padding:2px 4px;">${esc(t('all'))}</a>
              <a href="#" class="vtc-ics-off" data-group="${esc(semName)}" style="font-size:0.8rem;color:#a8a29e;text-decoration:none;padding:2px 4px;">${esc(t('off'))}</a>
            </div>
          </div>`;
        for (const code of codes) {
          const isChecked = icsSelected.has(code) ? 'checked' : '';
          html += `<label style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;font-size:0.8rem;color:#d6d3d1;">
            <input type="checkbox" value="${esc(code)}" ${isChecked} style="accent-color:#fbbf24;cursor:pointer;width:16px;height:16px;min-width:16px;">
            <span>${esc(code)}</span>
          </label>`;
        }
        html += `</div>`;
        groupIndex++;
      }
      if (unassigned.length > 0) {
        html += `<div style="margin-bottom:10px;" data-ics-group="other">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <p style="margin:0;font-size:0.7rem;color:#a8a29e;font-weight:600;">${esc(t('other'))}</p>
            <div style="display:flex;gap:6px;">
              <a href="#" class="vtc-ics-all" data-group="other" style="font-size:0.8rem;color:#fbbf24;text-decoration:none;padding:2px 4px;">${esc(t('all'))}</a>
              <a href="#" class="vtc-ics-off" data-group="other" style="font-size:0.8rem;color:#a8a29e;text-decoration:none;padding:2px 4px;">${esc(t('off'))}</a>
            </div>
          </div>`;
        for (const code of unassigned) {
          const isChecked = icsSelected.has(code) ? 'checked' : '';
          html += `<label style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;font-size:0.8rem;color:#d6d3d1;">
            <input type="checkbox" value="${esc(code)}" ${isChecked} style="accent-color:#fbbf24;cursor:pointer;width:16px;height:16px;min-width:16px;">
            <span>${esc(code)}</span>
          </label>`;
        }
        html += `</div>`;
      }
      icsFilterList.innerHTML = html;

      icsFilterList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) icsSelected.add(cb.value);
          else icsSelected.delete(cb.value);
        });
      });

      // all / off toggles per group
      icsFilterList.querySelectorAll('.vtc-ics-all').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const group = link.getAttribute('data-group');
          const container = icsFilterList.querySelector(`[data-ics-group="${group}"]`);
          if (!container) return;
          container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
            if (cb.checked) icsSelected.add(cb.value);
            else icsSelected.delete(cb.value);
          });
        });
      });
      icsFilterList.querySelectorAll('.vtc-ics-off').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const group = link.getAttribute('data-group');
          const container = icsFilterList.querySelector(`[data-ics-group="${group}"]`);
          if (!container) return;
          container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
            if (cb.checked) icsSelected.add(cb.value);
            else icsSelected.delete(cb.value);
          });
        });
      });
    };

    renderIcsFilterList();

    if (icsFilterToggle && icsFilterPanel) {
      icsFilterToggle.addEventListener('click', () => {
        const isHidden = icsFilterPanel.style.display === 'none';
        icsFilterPanel.style.display = isHidden ? 'block' : 'none';
        icsFilterToggle.textContent = isHidden ? t('hideFilter') : t('filterModules');
      });
      icsFilterPanel.style.display = 'none';
    }

    overlay.querySelector("#vtc-dashboard-ics-btn").addEventListener("click", () => {
      const btn = overlay.querySelector("#vtc-dashboard-ics-btn");
      const originalText = btn.textContent;
      btn.textContent = t('exporting');
      btn.disabled = true;
      try {
        const filteredEvents = calendarEvents.filter(ev => {
          const code = moduleCodeFromText(getEventText(ev));
          return !code || icsSelected.has(code); // keep non-module events (holidays etc.) or selected modules
        });
        download('vtc-calendar-events.ics', toIcs(filteredEvents), 'text/calendar;charset=utf-8');
      } finally {
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 1200);
      }
    });

    overlay.querySelector("#vtc-edit-mode-btn").addEventListener("click", () => {
      editMode = !editMode;
      const btn = overlay.querySelector("#vtc-edit-mode-btn");
      btn.textContent = editMode ? t('doneEditing') : t('editMode');
      if (editMode) {
        btn.style.background = "rgba(52,211,153,0.15)";
        btn.style.color = "#34d399";
      } else {
        btn.style.background = "";
        btn.style.color = "";
      }
      const sums = semesterSummaries[currentSemester] || [];
      overlay.querySelector("#vtc-table-body").innerHTML = buildRows(sums);
    });

    overlay.querySelector("#vtc-table-body").addEventListener("change", (e) => {
      if (!e.target.classList.contains("vtc-hours-input")) return;
      const code = e.target.dataset.module;
      const field = e.target.dataset.field || 'calendar';
      const val = parseFloat(e.target.value);
      if (Number.isNaN(val) || val < 0) return;

      const key = `${currentSemester}::${code}`;
      if (field === 'total') {
        manualOverrides[key] = { totalCalendarScheduledHours: val };
        // keep Overall in sync so the overall display reflects the edited total
        const overallKey = `Overall::${code}`;
        manualOverrides[overallKey] = { totalCalendarScheduledHours: val };
        console.debug && console.debug('[VTC] manual override (total)', key, val, 'also set', overallKey);
      } else {
        manualOverrides[key] = { calendarScheduledHours: val };
        console.debug && console.debug('[VTC] manual override (per-sem)', key, val);
      }

      semesterSummaries[currentSemester] = applyOverrides(semesterSummaries[currentSemester], currentSemester);
      if (semesterSummaries["Overall"]) {
        semesterSummaries["Overall"] = applyOverrides(semesterSummaries["Overall"], "Overall");
      }

      const sums = semesterSummaries[currentSemester] || [];
      overlay.querySelector("#vtc-table-body").innerHTML = buildRows(sums);
      overlay.querySelector("#vtc-pie").innerHTML = buildPieChart(sums, buildRating(sums));
    });

    overlay.querySelector("#vtc-semester-select").addEventListener("change", (e) => {
      currentSemester = e.target.value;
      semesterSummaries[currentSemester] = applyOverrides(semesterSummaries[currentSemester], currentSemester);
      const sums = semesterSummaries[currentSemester] || [];
      overlay.querySelector("#vtc-table-body").innerHTML = buildRows(sums);
      overlay.querySelector("#vtc-pie").innerHTML = buildPieChart(sums, buildRating(sums));
    });

    overlay.querySelector("#vtc-threshold-select").addEventListener("change", (e) => {
      currentThreshold = parseInt(e.target.value, 10);
      try { localStorage.setItem('vtc_threshold', String(currentThreshold)); } catch (e) {}
      overlay.style.setProperty('--vtc-threshold', currentThreshold + '%');
      semesterSummaries[currentSemester] = applyOverrides(semesterSummaries[currentSemester], currentSemester);
      if (semesterSummaries["Overall"]) {
        semesterSummaries["Overall"] = applyOverrides(semesterSummaries["Overall"], "Overall");
      }
      const sums = semesterSummaries[currentSemester] || [];
      overlay.querySelector("#vtc-table-body").innerHTML = buildRows(sums);
      overlay.querySelector("#vtc-pie").innerHTML = buildPieChart(sums, buildRating(sums));
      // Update legend and status tooltip
      const legendEl = overlay.querySelector('.vtc-legend');
      if (legendEl) legendEl.textContent = t('legend').replace('{threshold}', currentThreshold);
      overlay.querySelectorAll('thead .vtc-th-tip').forEach(el => {
        const tipKey = el.getAttribute('data-i18n-tip');
        if (tipKey) el.setAttribute('data-tip', esc(t(tipKey).replace('{threshold}', currentThreshold)));
      });
    });

    // language selector: update tooltip and accessible label for cross-sem badges
    const updateCrossSemTexts = () => {
      // cross-sem badges
      overlay.querySelectorAll('.vtc-cross-sem').forEach(el => {
        el.title = t('crossSemTooltip');
        el.setAttribute('aria-label', t('crossSem'));
      });
      // header title
      const h1 = overlay.querySelector('h1');
      if (h1) h1.textContent = t('title');
      // note
      const note = overlay.querySelector('.vtc-note');
      if (note) note.innerHTML = esc(t('noteEdit')).replace(' :-)', '\u00A0:-)');
      // buttons
      const editBtn = overlay.querySelector('#vtc-edit-mode-btn');
      if (editBtn) editBtn.textContent = editMode ? t('doneEditing') : t('editMode');
      const closeBtn = overlay.querySelector('#vtc-dashboard-close');
      if (closeBtn) closeBtn.textContent = t('close');
      const dlBtn = overlay.querySelector('#vtc-dashboard-download-btn');
      if (dlBtn) dlBtn.textContent = t('download');
      const icsBtn = overlay.querySelector('#vtc-dashboard-ics-btn');
      if (icsBtn) {
        icsBtn.textContent = t('exportIcs');
        icsBtn.title = t('exportIcsTitle');
      }
      const filterBtn = overlay.querySelector('#vtc-ics-filter-toggle');
      if (filterBtn) filterBtn.textContent = t('filterModules');
      // ICS filter panel title and list
      const filterTitle = icsFilterPanel && icsFilterPanel.querySelector('p');
      if (filterTitle) filterTitle.textContent = t('selectModulesToExport');
      renderIcsFilterList();
      // semester select: translate all semester names
      const semSel = overlay.querySelector('#vtc-semester-select');
      if (semSel) {
        Array.from(semSel.options).forEach(opt => {
          opt.text = tSemName(opt.value);
        });
      }

      // warning box
      const warnTitle = overlay.querySelector('.vtc-warning-title');
      if (warnTitle) warnTitle.innerHTML = '&#9888; ' + esc(t('warningTitle'));
      const warnSub = overlay.querySelector('.vtc-warning-sub');
      if (warnSub) warnSub.textContent = t('warningSub');

      // legend text under title
      const legendEl = overlay.querySelector('.vtc-legend');
      if (legendEl) legendEl.textContent = t('legend').replace('{threshold}', currentThreshold);

      // update cross-sem tooltip attributes (data-tip) as well as title/aria
      overlay.querySelectorAll('.vtc-cross-sem').forEach(el => {
        el.setAttribute('data-tip', t('crossSemTooltip'));
        el.title = t('crossSemTooltip');
        el.setAttribute('aria-label', t('crossSem'));
      });

      // ensure export ICS button's tooltip updates
      if (icsBtn) {
        icsBtn.setAttribute('data-tip', t('exportIcsTitle'));
        icsBtn.title = t('exportIcsTitle');
      }

      // table header tooltips and labels (use data-i18n-key / data-i18n-tip)
      overlay.querySelectorAll('thead .vtc-th-tip').forEach(el => {
        const key = el.getAttribute('data-i18n-key');
        const tipKey = el.getAttribute('data-i18n-tip');
        if (tipKey) el.setAttribute('data-tip', esc(t(tipKey).replace('{threshold}', currentThreshold)));
        if (!key) return;
        // update long/short variants if present
        const longEl = el.querySelector('.vtc-th-long');
        const shortEl = el.querySelector('.vtc-th-short');
        if (longEl) longEl.textContent = t(key);
        if (shortEl) {
          // map known shorts
          if (key === 'currentHeader') shortEl.textContent = t('curShort') || shortEl.textContent;
          else if (key === 'bestHeader') shortEl.textContent = t('bestShort') || shortEl.textContent;
          else if (key === 'futureHeader') shortEl.textContent = t('futShort') || shortEl.textContent;
        }
        // if no long/short, update the element text (strip tip symbol if present)
        if (!longEl && !shortEl) {
          el.innerHTML = esc(t(key)) + ' &#9432;';
        }
      });
    };

    const langEl = overlay.querySelector('#vtc-lang-select');
    if (langEl) {
      // ensure select reflects stored language
      try { langEl.value = currentLang; } catch (e) {}
      langEl.addEventListener('change', (e) => {
        currentLang = e.target.value;
        try { if (typeof localStorage !== 'undefined') localStorage.setItem('vtc_lang', currentLang); } catch (e) {}
        updateCrossSemTexts();
        // re-render rows and pie so translated strings inside rows update immediately
        const sums = semesterSummaries[currentSemester] || [];
        overlay.querySelector('#vtc-table-body').innerHTML = buildRows(sums);
        overlay.querySelector('#vtc-pie').innerHTML = buildPieChart(sums, buildRating(sums));
        // update download select labels
        const dl = overlay.querySelector('#vtc-dashboard-download-select');
        if (dl) {
          dl.innerHTML = `
            <option value="summary-json">${esc(t('summaryJson'))}</option>
            <option value="details-json">${esc(t('detailsJson'))}</option>
            <option value="summary-csv">${esc(t('summaryCsv'))}</option>
            <option value="details-csv">${esc(t('detailsCsv'))}</option>
          `;
        }
      });
      // initial set
      updateCrossSemTexts();
      // populate download select labels initially
      const dlInit = overlay.querySelector('#vtc-dashboard-download-select');
      if (dlInit) {
        dlInit.innerHTML = `
          <option value="summary-json">${esc(t('summaryJson'))}</option>
          <option value="details-json">${esc(t('detailsJson'))}</option>
          <option value="summary-csv">${esc(t('summaryCsv'))}</option>
          <option value="details-csv">${esc(t('detailsCsv'))}</option>
        `;
      }
    }

    // Show tooltips on hover for pointer devices (click still toggles for touch)
    if (window.matchMedia('(hover: hover)').matches) {
      overlay.addEventListener('mouseover', (e) => {
        const tip = e.target.closest('.vtc-th-tip, .vtc-bar-tip');
        if (tip) tip.classList.add('show-tip');
      });
      overlay.addEventListener('mouseout', (e) => {
        const tip = e.target.closest('.vtc-th-tip, .vtc-bar-tip');
        if (tip) tip.classList.remove('show-tip');
      });
    }

    // tap/click tooltips on mobile (hover doesn't exist)
    overlay.addEventListener("click", (e) => {
      const tip = e.target.closest(".vtc-th-tip");
      const barTip = e.target.closest(".vtc-bar-tip");
      const targetTip = tip || barTip;

      if (!targetTip) {
        overlay.querySelectorAll(".vtc-th-tip.show-tip, .vtc-bar-tip.show-tip").forEach(el => el.classList.remove("show-tip"));
        return;
      }

      overlay.querySelectorAll(".vtc-th-tip.show-tip, .vtc-bar-tip.show-tip").forEach(el => {
        if (el !== targetTip) el.classList.remove("show-tip");
      });
      targetTip.classList.toggle("show-tip");
    });

    return overlay;
  };

  // Accept either a single string or an array of strings (for multi-language support)
  const findMenuUrlByText = textOrTexts => {
    const texts = Array.isArray(textOrTexts) ? textOrTexts : [textOrTexts];
    const links = [...document.querySelectorAll("a[href]")];
    for (const text of texts) {
      const link = links.find(a => {
        const label = clean(a.textContent);
        return label === text || label.includes(text);
      });
      if (link) {
        return new URL(link.getAttribute("href"), location.origin).href;
      }
    }
    throw new Error(`Cannot find left menu link: ${texts.join(' / ')}`);
  };

  const timeToMinutes = value => {
    const s = String(value || "").trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    let hours = Number(m[1]);
    const minutes = Number(m[2]);

    // Handle 12-hour AM/PM format (e.g., "02:30 PM", "9:15 am")
    if (/[pP][mM]/.test(s) && hours !== 12) {
      hours += 12;
    } else if (/[aA][mM]/.test(s) && hours === 12) {
      hours = 0;
    }

    return hours * 60 + minutes;
  };

  const lessonMinutes = lessonTime => {
    const m = String(lessonTime || "").match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
    if (!m) return 0;

    let start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);

    if (end < start) end += 1440;
    return end - start;
  };

  const attendedMinutesFromRow = row => {
    const duration = lessonMinutes(row.lessonTime);
    if (/Absent|缺席/i.test(row.status)) return 0;

    const start = timeToMinutes(String(row.lessonTime || "").split("-")[0].trim());
    const arrive = timeToMinutes(row.attendTime);

    if (start == null || arrive == null) return duration;

    const lateBy = Math.max(0, arrive - start);
    return Math.max(0, duration - lateBy);
  };

  const moduleCodeFromText = text => {
    const m = clean(text).match(/\b[A-Z]{2,4}\d{4}[A-Z]?\b/);
    return m ? m[0] : "";
  };

  const getEventText = event => {
    return [
      event.summary,
      event.title,
      event.name,
      event.subject,
      event.details,
      event.description
    ].filter(Boolean).join(" ");
  };

  const parseVtcDateTime = value => {
    if (!value) return null;

    const s = String(value).trim();
    const compact = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);

    if (compact) {
      return new Date(
        Number(compact[1]),
        Number(compact[2]) - 1,
        Number(compact[3]),
        Number(compact[4]),
        Number(compact[5]),
        Number(compact[6] || 0)
      );
    }

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const eventStartEnd = event => {
    const startRaw =
      event.startDateTime ||
      event.start ||
      event.startTime ||
      event.startDate ||
      event.begin;

    const endRaw =
      event.endDateTime ||
      event.end ||
      event.endTime ||
      event.endDate ||
      event.finish;

    const start = parseVtcDateTime(startRaw);
    const end = parseVtcDateTime(endRaw);

    if (!start || !end) return null;
    return { start, end };
  };

  const eventMinutes = event => {
    const se = eventStartEnd(event);
    if (!se) return 0;
    return Math.max(0, (se.end - se.start) / 60000);
  };

  const postForm = async (form, extraFields = {}) => {
    const fd = new FormData(form);

    for (const [key, value] of Object.entries(extraFields)) {
      fd.set(key, value);
    }

    const action = new URL(form.getAttribute("action"), location.origin).href;

    const res = await fetch(action, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(fd)
    });

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${action}`);
    }

    return await res.text();
  };

  const getCalendarFeedUrl = async () => {
    if (typeof eventFeedUrl !== "undefined") {
      return new URL(eventFeedUrl, location.origin).href;
    }

    const calendarUrl = findMenuUrlByText(["Calendar", "日曆"]);
    console.log("Fetching Calendar page:", calendarUrl);
    pushStep(tStatus('statusFindingCalendarApi'));

    const res = await fetch(calendarUrl, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${calendarUrl}`);
    }

    const html = await res.text();
    const m = html.match(/var\s+eventFeedUrl\s*=\s*['"]([^'"]+)['"]/);

    if (!m) {
      throw new Error("Cannot find eventFeedUrl in Calendar page.");
    }

    return new URL(m[1], location.origin).href;
  };

  const fetchCalendarEvents = async () => {
    const feedUrl = await getCalendarFeedUrl();

    const fetchRange = async (fromDate, toDate) => {
      const url = new URL(feedUrl);
      url.searchParams.set("from", ymd(fromDate));
      url.searchParams.set("to", ymd(toDate));

      const res = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        }
      });

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}: ${url}`);
      }

      return await res.json();
    };

    const normalize = data => {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.events)) return data.events;
      if (Array.isArray(data.data)) return data.data;
      return [data];
    };

    const addMonths = d => new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const all = [];

    for (let cursor = new Date(RANGE_START); cursor < RANGE_END; cursor = addMonths(cursor)) {
      const next = addMonths(cursor);
      const chunkEnd = next < RANGE_END ? next : RANGE_END;

      console.log(`Calendar fetch: ${ymd(cursor)} -> ${ymd(chunkEnd)}`);
      updateStatus(tStatus('statusFetchingCalendarRange').replace('{start}', ymd(cursor)).replace('{end}', ymd(chunkEnd)));
      all.push(...normalize(await fetchRange(cursor, chunkEnd)));
      await sleep(150);
    }

    const seen = new Set();

    return all.filter(event => {
      const key = JSON.stringify(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  function findAttendanceForm(doc) {
    return [...doc.forms].find(form =>
      form.querySelector("select") &&
      form.querySelector("[id$='changeModuleButton']")
    );
  }

  const loadIframe = async url => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1200px;height:900px;";
    document.body.appendChild(iframe);

    await new Promise((resolve, reject) => {
      iframe.onload = resolve;
      iframe.onerror = reject;
      iframe.src = url;
    });

    await sleep(1000);
    return iframe;
  };

  const waitForIframeLoadAfterClick = async (iframe, clickFn) => {
    const loaded = new Promise(resolve => {
      const done = () => {
        iframe.removeEventListener("load", done);
        resolve();
      };

      iframe.addEventListener("load", done);
    });

    clickFn();

    await Promise.race([loaded, sleep(6000)]);
    await sleep(1000);
  };

  const findClassAttendancePage = async () => {
    const profileUrl = findMenuUrlByText(["Profile", "個人檔案"]);
    console.log("Loading Profile in hidden iframe:", profileUrl);
    pushStep(tStatus('statusFindingAttendancePage'));

    const iframe = await loadIframe(profileUrl);
    let doc = iframe.contentDocument;

    if (findAttendanceForm(doc)) {
      const html = doc.documentElement.outerHTML;
      iframe.remove();
      return html;
    }

    const classTabLink = [...doc.querySelectorAll("a[id]")]
      .find(a => {
        const t = clean(a.textContent);
        return t.includes("Class Attendance") || t.includes("課堂出席");
      });

    if (!classTabLink) {
      console.log("Iframe Profile preview:", clean(doc.body ? doc.body.innerText : "").slice(0, 1500));
      iframe.remove();
      throw new Error("Cannot find Class Attendance tab link in Profile iframe.");
    }

    console.log("Clicking Class Attendance tab in iframe:", classTabLink.id);

    await waitForIframeLoadAfterClick(iframe, () => classTabLink.click());

    doc = iframe.contentDocument;

    if (!findAttendanceForm(doc)) {
      console.log("After iframe tab click preview:", clean(doc.body ? doc.body.innerText : "").slice(0, 1500));
      iframe.remove();
      throw new Error("Clicked Class Attendance tab, but cannot find attendance module form.");
    }

    const html = doc.documentElement.outerHTML;
    iframe.remove();
    return html;
  };

  // ── SEMESTER ESTIMATION FROM CALENDAR GAPS ───────────────────────────
  const estimateSemesterRanges = (events) => {
    const allDates = events.map(e => {
      const se = eventStartEnd(e);
      if (!se) return null;
      return new Date(se.start.getFullYear(), se.start.getMonth(), se.start.getDate());
    }).filter(Boolean).sort((a, b) => a - b);

    if (allDates.length === 0) return [];

    const seen = new Set();
    const dates = allDates.filter(d => {
      const key = d.toDateString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const first = dates[0];
    const last = dates[dates.length - 1];
    const totalDays = (last - first) / (1000 * 60 * 60 * 24);

    // Short study period — just one block
    if (totalDays < 60) {
      return [{ name: "Overall", start: first, end: last }];
    }

    // Find all gaps >= 10 days between consecutive event dates
    const gaps = [];
    for (let i = 1; i < dates.length; i++) {
      const gap = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
      if (gap >= 10) {
        gaps.push({
          from: dates[i - 1],
          to: dates[i],
          days: gap
        });
      }
    }

    // Sort by gap size descending, take top 2 as semester breaks
    gaps.sort((a, b) => b.days - a.days);
    const breakPoints = gaps.slice(0, 2).map(g => ({
      date: new Date(g.from.getTime() + (g.to - g.from) / 2)
    }));
    breakPoints.sort((a, b) => a.date - b.date);

    const ranges = [];
    let cursor = new Date(first);
    let idx = 1;

    for (const bp of breakPoints) {
      if (bp.date > cursor) {
        ranges.push({
          name: "Sem " + idx,
          start: new Date(cursor),
          end: new Date(bp.date)
        });
        idx++;
        cursor = new Date(bp.date.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    if (cursor <= last) {
      ranges.push({
        name: "Sem " + idx,
        start: new Date(cursor),
        end: new Date(last)
      });
    }

    // If no meaningful breaks found, fall back to even split (max 3)
    if (ranges.length === 0) {
      const chunkDays = Math.max(45, Math.round(totalDays / 3));
      let c = new Date(first);
      let i = 1;
      while (c < last && i <= 3) {
        const end = new Date(c.getTime() + chunkDays * 24 * 60 * 60 * 1000);
        ranges.push({ name: "Sem " + i, start: new Date(c), end: end > last ? last : end });
        c = new Date(end.getTime() + 24 * 60 * 60 * 1000);
        i++;
      }
    }

    return ranges;
  };

  const getModules = doc => {
    const form = findAttendanceForm(doc);

    if (!form) {
      throw new Error("Cannot find attendance module form.");
    }

    const select = form.querySelector("select");
    const seen = new Set();

    return [...select.options]
      .filter(option => option.value)
      .map(option => ({
        value: option.value,
        text: clean(option.textContent)
      }))
      .filter(module => {
        const key = `${module.value}|${module.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const parseRows = doc => {
    return [...doc.querySelectorAll("table.hkvtcsp_wording tbody tr")]
      .map(tr => {
        const tds = [...tr.querySelectorAll("td")].map(td => clean(td.textContent));

        return {
          date: tds[0] || "",
          status: tds[1] || "",
          attendTime: tds[2] || "",
          lessonTime: tds[3] || "",
          room: tds[4] || ""
        };
      })
      .filter(row => /^\d{2}\/\d{2}\/\d{4}/.test(row.date));
  };

  const submitModule = async (html, module) => {
    const doc = parseHtml(html);
    const form = findAttendanceForm(doc);

    if (!form) {
      throw new Error("Cannot find attendance module form.");
    }

    const select = form.querySelector("select");
    const button = form.querySelector("[id$='changeModuleButton']");

    const fields = {};
    fields[select.name] = module.value;
    fields[button.name] = button.value || "";
    fields[`${form.name}_SUBMIT`] = "1";

    return await postForm(form, fields);
  };

  // ── MAIN ─────────────────────────────────────────────────────────────
  (async () => {
    pushStep(tStatus('statusFetchingEvents'));

    const calendarEvents = await fetchCalendarEvents();

    console.log(`Calendar events fetched: ${calendarEvents.length}`);
    console.log("Sample calendar event:", calendarEvents[0]);
    console.log("Sample event code:", moduleCodeFromText(getEventText(calendarEvents[0])));
    console.log("Sample event minutes:", eventMinutes(calendarEvents[0]));
    pushStep(tStatus('statusFoundEvents').replace('{n}', calendarEvents.length));

    const calendarMinutesByModule = {};
    const calendarDebugRows = [];

    for (const event of calendarEvents) {
      const eventText = getEventText(event);
      const moduleCode = moduleCodeFromText(eventText);
      const minutes = eventMinutes(event);

      calendarDebugRows.push({
        moduleCode,
        minutes,
        summary: event.summary || "",
        startDateTime: event.startDateTime || event.start || "",
        endDateTime: event.endDateTime || event.end || ""
      });

      if (!moduleCode || !minutes) continue;

      calendarMinutesByModule[moduleCode] = (calendarMinutesByModule[moduleCode] || 0) + minutes;
    }

    console.log("Calendar event parse debug, first 20 rows:");
    console.table(calendarDebugRows.slice(0, 20));

    console.log("Calendar scheduled hours by module:");
    console.table(
      Object.entries(calendarMinutesByModule)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([moduleCode, minutes]) => ({
          moduleCode,
          calendarScheduledHours: +(minutes / 60).toFixed(2)
        }))
    );

    let html = await findClassAttendancePage();
    let doc = parseHtml(html);
    const modules = getModules(doc);

    console.log(`Modules found: ${modules.length}`);
    console.table(modules);
    pushStep(tStatus('statusGrabbingModules').replace('{n}', modules.length));

    const summaries = [];
    const details = [];

    for (let idx = 0; idx < modules.length; idx++) {
      const module = modules[idx];
      console.log("Attendance module:", module.text);
      updateStatus(tStatus('statusGrabbingModuleProgress').replace('{current}', idx + 1).replace('{total}', modules.length).replace('{name}', module.text));

      html = await submitModule(html, module);
      doc = parseHtml(html);

      const rows = parseRows(doc);

      const recordMinutes = rows.reduce((sum, row) => sum + lessonMinutes(row.lessonTime), 0);
      const attendedMinutes = rows.reduce((sum, row) => sum + attendedMinutesFromRow(row), 0);

      const present = rows.filter(row => /^Present|出席$/i.test(row.status)).length;
      const late = rows.filter(row => /^Late|遲到$/i.test(row.status)).length;
      const absent = rows.filter(row => /Absent|缺席/i.test(row.status)).length;
      const lateMinutes = rows.reduce((sum, row) => {
        if (!/^Late|遲到$/i.test(row.status)) return sum;
        return sum + (lessonMinutes(row.lessonTime) - attendedMinutesFromRow(row));
      }, 0);

      const calendarMinutes = calendarMinutesByModule[module.value] || 0;
      const futureMinutes = Math.max(0, calendarMinutes - recordMinutes);

      const currentHourRate = recordMinutes
        ? +((attendedMinutes / recordMinutes) * 100).toFixed(2)
        : null;

      const bestPossibleFullTermRate = calendarMinutes
        ? +(((attendedMinutes + futureMinutes) / calendarMinutes) * 100).toFixed(2)
        : null;

      const status70 = currentHourRate == null
        ? "NO_RECORD"
        : currentHourRate < currentThreshold
          ? "BELOW_70_NOW"
          : "OK_NOW";

      const bestStatus70 = bestPossibleFullTermRate == null
        ? "NO_CALENDAR_MATCH"
        : bestPossibleFullTermRate < currentThreshold
          ? "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT"
          : "CAN_REACH_OR_KEEP_70_IF_FUTURE_PRESENT";

      const calHours = +(calendarMinutes / 60).toFixed(2);
      const attHours = +(attendedMinutes / 60).toFixed(2);
      const futHours = +(futureMinutes / 60).toFixed(2);
      const neededHours = Math.max(0, (currentThreshold / 100) * calHours - attHours);
      const skipHours = futHours > 0 ? Math.max(0, +(futHours - neededHours).toFixed(2)) : 0;
      const modEvents = calendarEvents.filter(e => moduleCodeFromText(getEventText(e)) === module.value);
      const totalLessons = modEvents.length > 0 ? modEvents.length : rows.length;
      const absentRate = totalLessons > 0 ? +((absent / totalLessons) * 100).toFixed(1) : 0;
      const effectiveAbsentRate = calHours > 0 ? +(((recordMinutes - attendedMinutes) / 60) / calHours * 100).toFixed(1) : 0;
      const avgLessonHours = modEvents.length > 0 ? +(calHours / modEvents.length).toFixed(1) : 2;

      const summary = {
        moduleCode: module.value,
        moduleText: module.text,
        records: rows.length,
        present,
        late,
        lateHours: +(lateMinutes / 60).toFixed(2),
        absent,
        absentRate,
        overallAbsentRate: absentRate,
        effectiveAbsentRate,
        overallEffectiveAbsentRate: effectiveAbsentRate,
        attendanceRecordHours: +(recordMinutes / 60).toFixed(2),
        attendedHours: attHours,
        deductedHours: +((recordMinutes - attendedMinutes) / 60).toFixed(2),
        currentHourRate,
        calendarScheduledHours: calHours,
        futureCalendarHours: futHours,
        bestPossibleFullTermRate,
        skipAllowanceHours: skipHours,
        avgLessonHours,
        status70,
        bestStatus70
      };

      summaries.push(summary);

      rows.forEach(row => {
        details.push({
          moduleCode: module.value,
          moduleText: module.text,
          ...row
        });
      });

      console.log("Summary:", summary);
      await sleep(250);
    }

    console.log("Final summary:");
    console.table(summaries);

    // ── SEMESTER BREAKDOWN ─────────────────────────────────────────────
    pushStep(tStatus('statusDetectingSemesters'));
    const semesterRanges = estimateSemesterRanges(calendarEvents);

    const isDetailInRange = (detail, range) => {
      const m = String(detail.date || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) return false;
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return d >= range.start && d <= range.end;
    };

    const isEventInRange = (event, range) => {
      const se = eventStartEnd(event);
      if (!se) return false;
      return se.start >= range.start && se.start <= range.end;
    };

    const buildSummaryFromData = (moduleCode, moduleText, modDetails, modCalEvents, overallAbsentRate) => {
      const recMins = modDetails.reduce((sum, row) => sum + lessonMinutes(row.lessonTime), 0);
      const attMins = modDetails.reduce((sum, row) => sum + attendedMinutesFromRow(row), 0);
      const pres = modDetails.filter(row => /^Present|出席$/i.test(row.status)).length;
      const lat = modDetails.filter(row => /^Late|遲到$/i.test(row.status)).length;
      const abs = modDetails.filter(row => /Absent|缺席/i.test(row.status)).length;
      const lateMins = modDetails.reduce((sum, row) => {
        if (!/^Late|遲到$/i.test(row.status)) return sum;
        return sum + (lessonMinutes(row.lessonTime) - attendedMinutesFromRow(row));
      }, 0);

      const calMins = modCalEvents.reduce((sum, ev) => {
        const code = moduleCodeFromText(getEventText(ev));
        if (code !== moduleCode) return sum;
        return sum + eventMinutes(ev);
      }, 0);
      const futMins = Math.max(0, calMins - recMins);

      const curRate = recMins ? +((attMins / recMins) * 100).toFixed(2) : null;
      const bestRate = calMins ? +(((attMins + futMins) / calMins) * 100).toFixed(2) : null;

      const calHours = +(calMins / 60).toFixed(2);
      const attHours = +(attMins / 60).toFixed(2);
      const futHours = +(futMins / 60).toFixed(2);
      const neededHours = Math.max(0, (currentThreshold / 100) * calHours - attHours);
      const skipHours = futHours > 0 ? Math.max(0, +(futHours - neededHours).toFixed(2)) : 0;
      const totalLessons = modCalEvents.length > 0 ? modCalEvents.length : modDetails.length;
      const absentRate = totalLessons > 0 ? +((abs / totalLessons) * 100).toFixed(1) : 0;
      const effectiveAbsentRate = calHours > 0 ? +(((recMins - attMins) / 60) / calHours * 100).toFixed(1) : 0;
      const avgLessonHours = modCalEvents.length > 0 ? +(calHours / modCalEvents.length).toFixed(1) : 2;

      // Calculate overall effective absent rate using all details and all calendar events
      const allModDets = details.filter(d => d.moduleCode === moduleCode);
      const allRecMins = allModDets.reduce((sum, row) => sum + lessonMinutes(row.lessonTime), 0);
      const allAttMins = allModDets.reduce((sum, row) => sum + attendedMinutesFromRow(row), 0);
      const allCalMins = calendarEvents.reduce((sum, ev) => {
        const code = moduleCodeFromText(getEventText(ev));
        if (code !== moduleCode) return sum;
        return sum + eventMinutes(ev);
      }, 0);
      const overallEffectiveAbsentRate = allCalMins > 0 ? +(((allRecMins - allAttMins) / 60) / (allCalMins / 60) * 100).toFixed(1) : 0;

      return {
        moduleCode,
        moduleText,
        records: modDetails.length,
        present: pres,
        late: lat,
        lateHours: +(lateMins / 60).toFixed(2),
        absent: abs,
        absentRate,
        overallAbsentRate: overallAbsentRate != null ? overallAbsentRate : absentRate,
        effectiveAbsentRate,
        overallEffectiveAbsentRate,
        attendanceRecordHours: +(recMins / 60).toFixed(2),
        attendedHours: attHours,
        deductedHours: +((recMins - attMins) / 60).toFixed(2),
        currentHourRate: curRate,
        calendarScheduledHours: calHours,
        futureCalendarHours: futHours,
        bestPossibleFullTermRate: bestRate,
        skipAllowanceHours: skipHours,
        avgLessonHours,
        status70: curRate == null ? "NO_RECORD" : curRate < currentThreshold ? "BELOW_70_NOW" : "OK_NOW",
        bestStatus70: bestRate == null ? "NO_CALENDAR_MATCH" : bestRate < currentThreshold ? "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT" : "CAN_REACH_OR_KEEP_70_IF_FUTURE_PRESENT"
      };
    };

    const semesterSummaries = { "Overall": summaries };
    for (const range of semesterRanges) {
      const semDetails = details.filter(d => isDetailInRange(d, range));
      const semEvents = calendarEvents.filter(e => isEventInRange(e, range));
      const semSums = [];
      for (const mod of modules) {
        const modDets = semDetails.filter(d => d.moduleCode === mod.value);
        const modEvs = semEvents.filter(e => moduleCodeFromText(getEventText(e)) === mod.value);
        if (modDets.length === 0 && modEvs.length === 0) continue;
        const allModDets = details.filter(d => d.moduleCode === mod.value);
        const allAbs = allModDets.filter(row => /Absent|缺席/i.test(row.status)).length;
        const overallAbsRate = allModDets.length > 0 ? +((allAbs / allModDets.length) * 100).toFixed(1) : 0;
        semSums.push(buildSummaryFromData(mod.value, mod.text, modDets, modEvs, overallAbsRate));
      }
      semesterSummaries[range.name] = semSums;
    }

    // Add totalCalendarScheduledHours to all summaries for cross-sem display & warnings
    const overallSums = semesterSummaries["Overall"] || [];
    for (const semName of Object.keys(semesterSummaries)) {
      for (const s of semesterSummaries[semName]) {
        const overall = overallSums.find(o => o.moduleCode === s.moduleCode);
        s.totalCalendarScheduledHours = overall ? overall.calendarScheduledHours : s.calendarScheduledHours;
      }
    }

    showStatus(tStatus('statusDoneTitle').replace('{n}', modules.length), 'success');

    try {
      localStorage.setItem('vtc-integrated-data', JSON.stringify({
        semesterSummaries,
        details,
        calendarEvents,
        semesterRanges: semesterRanges.map(r => ({ name: r.name, start: r.start.toISOString(), end: r.end.toISOString() })),
        scrapedAt: new Date().toISOString()
      }));
    } catch (e) {
      console.error('[VTC Attendance] Failed to store integrated data:', e);
    }

    const overlay = renderDashboardOverlay(semesterSummaries, details, calendarEvents);

    removeStatus(3000);

    console.log("Done.");
  })().catch(e => {
    console.error('[VTC Attendance] Grabber error:', e);
    pushStep(tStatus('statusError').replace('{message}', e.message || tStatus('statusUnknownError')));
    showStatus(tStatus('statusErrorTitle'), 'error');
  });
})();
