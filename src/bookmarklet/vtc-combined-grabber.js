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
  const THRESHOLD = 70;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = s => String(s || "").replace(/\s+/g, " ").trim();
  const parseHtml = html => new DOMParser().parseFromString(html, "text/html");
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

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
    st.color = '#fef3c7';
    st.background = 'rgba(10, 10, 10, 0.97)';
    st.border = '1px solid rgba(252, 211, 77, 0.2)';
    st.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
    if (st.backdropFilter !== undefined) st.backdropFilter = 'blur(10px)';

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
  }

  function setStatusIconAndTitle(type) {
    if (!statusHeaderIcon || !statusHeaderTitle) return;
    if (type === 'success') {
      statusHeaderIcon.className = 'vtc-check';
      statusHeaderIcon.innerHTML = '&#10003;';
      statusHeaderTitle.style.color = '#34d399';
      statusHeaderTitle.textContent = 'Done!';
    } else if (type === 'error') {
      statusHeaderIcon.className = 'vtc-check';
      statusHeaderIcon.style.background = '#f87171';
      statusHeaderIcon.style.color = '#fff';
      statusHeaderIcon.innerHTML = '&#10007;';
      statusHeaderTitle.style.color = '#f87171';
      statusHeaderTitle.textContent = 'Error';
    } else {
      statusHeaderIcon.className = 'vtc-spinner';
      statusHeaderIcon.innerHTML = '';
      statusHeaderIcon.style.background = '';
      statusHeaderIcon.style.color = '';
      statusHeaderTitle.style.color = '#fbbf24';
      statusHeaderTitle.textContent = 'Grabbing...';
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
    showStatus('Grabbing...', 'info');
  }

  function updateStatus(html) {
    if (statusSteps.length === 0) return;
    statusSteps[statusSteps.length - 1] = html;
    showStatus('Grabbing...', 'info');
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

  pushStep('Starting integrated grabber...');

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

    const esc = value => String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

    const getStatusLabel = s => {
      if (s.bestStatus70 === "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT") return "failed";
      if (s.status70 === "BELOW_70_NOW") return "almost pass";
      if (s.status70 === "NO_RECORD") return "no record";
      return "passed";
    };

    const getStatusColor = s => {
      if (s.bestStatus70 === "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT") return "#f87171";
      if (s.status70 === "BELOW_70_NOW") return "#fbbf24";
      if (s.status70 === "NO_RECORD") return "#a8a29e";
      return "#34d399";
    };

    const fmtSkip = (h, avgLessonHours = 2) => {
      if (h == null || Number.isNaN(h) || h <= 0) return "you must attend all";

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
      if (lessons >= 1) {
        const whole = Math.floor(lessons);
        const rem = lessons - whole;
        if (rem >= 0.75) {
          approx = `≈ ${whole + 1} lesson${whole + 1 > 1 ? "s" : ""} @ ${avgH}h`;
        } else if (rem >= 0.25) {
          approx = `≈ ${whole + 0.5} lesson${whole + 0.5 > 1 ? "s" : ""} @ ${avgH}h`;
        } else if (whole >= 1) {
          approx = `≈ ${whole} lesson${whole > 1 ? "s" : ""} @ ${avgH}h`;
        }
      } else if (lessons >= 0.5) {
        approx = `≈ half a lesson @ ${avgH}h`;
      } else if (h >= 0.5) {
        approx = `≈ quarter of a lesson @ ${avgH}h`;
      }

      return approx ? `you can skip around ${timeStr} (${approx})` : `you can skip around ${timeStr}`;
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

        const failText = isFailed
          ? `<div class="vtc-skip" style="color:#f87171;">paying your hard earned money for a modules is kinda painful right?</div>`
          : "";

        const totalHours = s.totalCalendarScheduledHours ?? s.calendarScheduledHours;
        const hoursDisplay = (isCrossSem && !isOverallView && totalHours !== s.calendarScheduledHours)
          ? `${esc(s.attendedHours)} / ${esc(s.calendarScheduledHours)} h <span style="color:#a8a29e;font-size:0.7rem;">(total: ${esc(totalHours)} h)</span>`
          : `${esc(s.attendedHours)} / ${esc(s.calendarScheduledHours)} h`;

        const lowHourWarn = ((isCrossSem ? totalHours : s.calendarScheduledHours) <= 32)
          ? `<div class="vtc-skip" style="color:#f87171;font-weight:700;">IF YOU SKIP, YOU HAVE HIGH CHANCE YOUR ABSENT RATE WENT HIGH!</div>`
          : "";

        const lanWarn = "";

        const effVal = (isCrossSem && !isOverallView) ? (s.overallEffectiveAbsentRate ?? s.effectiveAbsentRate) : s.effectiveAbsentRate;
        const effLabel = (isCrossSem && !isOverallView) ? "overall absent rate" : "absent rate";
        const absentWarn = effVal >= 30 ? ` <span class="vtc-absent-warn">≥30% = instant fail</span>` : "";
        const absentColor = effVal >= 30 ? "#f87171" : "#fb923c";
        // show effective absent rate when there are absences OR lates (late still impacts attendance)
        const effDisplay = effVal != null ? Math.round(effVal) : null;
        const absentText = ((s.absent > 0 || s.late > 0) && effVal != null) ? `<div class="vtc-absent" style="color:${absentColor};">${effLabel}: ${effVal}% (round up as ${effDisplay}%)${absentWarn}</div>` : "";
        const lateLessons = s.avgLessonHours > 0 ? Math.round(s.lateHours / s.avgLessonHours) : 0;
        const lateApprox = lateLessons > 0 ? ` (≈ ${lateLessons} lesson${lateLessons > 1 ? 's' : ''})` : '';
        const lateText = (s.lateHours > 0) ? `<div class="vtc-absent" style="color:#fbbf24;">late: ${esc(s.lateHours)} h${lateApprox}</div>` : "";
        const crossSemTag = isCrossSem ? `<div class="vtc-cross-sem">cross sem</div>` : "";

        return `
          <tr>
            <td>
              <strong style="color:#fcd34d;font-size:1.05rem;">${esc(s.moduleCode)}</strong>
              ${crossSemTag}
              <div class="vtc-muted">${esc(s.moduleText)}</div>
              ${absentText}
              ${lateText}
              ${skipText ? `<div class="vtc-skip" style="color:${skipColor};">${esc(skipText)}</div>` : ""}
              ${lowHourWarn}
              ${lanWarn}
              ${failText}
            </td>
            <td>${current == null ? "-" : current + "%"}</td>
            <td>${best == null ? "-" : best + "%"}</td>
            <td>${hoursDisplay}</td>
            <td>${esc(s.futureCalendarHours)} h</td>
            <td><span class="vtc-badge" style="background:${color}22;color:${color};border:1px solid ${color}44;">${esc(label)}</span></td>
          </tr>
          <tr>
            <td colspan="6">
              <div class="vtc-bar-wrap">
                <div class="vtc-bar vtc-best vtc-bar-tip" data-tip="best possible rate: ${best != null ? best + '%' : 'N/A'}" style="width:${Math.max(0, Math.min(100, best || 0))}%"></div>
                <div class="vtc-bar vtc-current vtc-bar-tip" data-tip="current rate: ${current != null ? current + '%' : 'N/A'}" style="width:${Math.max(0, Math.min(100, current || 0))}%"></div>
                <div class="vtc-threshold"></div>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    };

    const buildRating = summaries => {
      const total = summaries.length;
      if (total === 0) return { label: "unknown", color: "#78716c", emoji: "&#128528;" };
      const green = summaries.filter(s => s.status70 === "OK_NOW").length;
      const red = summaries.filter(s => s.bestStatus70 === "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT").length;
      if (green / total >= 0.6) return { label: "excellent", color: "#34d399", emoji: "&#128513;" };
      if (red / total >= 0.4) return { label: "bad", color: "#f87171", emoji: "&#128555;" };
      return { label: "normal", color: "#fbbf24", emoji: "&#128528;" };
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
              ${green > 0 ? `<span><span class="vtc-pie-dot" style="background:#34d399;"></span> passed: ${green}</span>` : ''}
              ${yellow > 0 ? `<span><span class="vtc-pie-dot" style="background:#fbbf24;"></span> almost pass: ${yellow}</span>` : ''}
              ${red > 0 ? `<span><span class="vtc-pie-dot" style="background:#f87171;"></span> failed: ${red}</span>` : ''}
              ${grey > 0 ? `<span><span class="vtc-pie-dot" style="background:#78716c;"></span> no record: ${grey}</span>` : ''}
            </div>
          </div>
          ${rating ? `<span class="vtc-rating" style="color:${rating.color};">${rating.emoji} ${esc(rating.label)}</span>` : ''}
        </div>
      `;
    };

    const initialSummaries = semesterSummaries[activeSemester];
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
    overlay.innerHTML = `
      <style>
        #vtc-attendance-dashboard-overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: #0a0a0a;
          color: #fef3c7;
          font-family: Arial, Helvetica, sans-serif;
          overflow: auto;
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
        #vtc-attendance-dashboard-overlay .vtc-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
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
          font-size: 0.75rem;
          margin-top: 4px;
        }
        #vtc-attendance-dashboard-overlay .vtc-skip {
          font-size: 0.7rem;
          margin-top: 3px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        #vtc-attendance-dashboard-overlay .vtc-absent {
          font-size: 0.7rem;
          margin-top: 3px;
          font-weight: 600;
          color: #fb923c;
          letter-spacing: 0.02em;
        }
        #vtc-attendance-dashboard-overlay .vtc-absent-warn {
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.6rem;
          letter-spacing: 0.04em;
        }
        #vtc-attendance-dashboard-overlay .vtc-cross-sem {
          display: inline-block;
          font-size: 0.6rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #fbbf24;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 4px;
          padding: 1px 6px;
          margin-top: 3px;
        }
        #vtc-attendance-dashboard-overlay .vtc-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
          margin: 24px 0;
        }
        #vtc-attendance-dashboard-overlay .vtc-card {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(252,211,77,0.12);
          border-radius: 12px;
          padding: 18px;
        }
        #vtc-attendance-dashboard-overlay .vtc-card .label {
          color: #a8a29e;
          font-size: 0.8rem;
          text-transform: lowercase;
          letter-spacing: 0.05em;
        }
        #vtc-attendance-dashboard-overlay .vtc-card .num {
          font-size: 2rem;
          font-weight: 700;
          color: #fcd34d;
          margin-top: 6px;
        }
        #vtc-attendance-dashboard-overlay table {
          width: 100%;
          border-collapse: collapse;
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(252,211,77,0.1);
          border-radius: 12px;
          overflow: hidden;
          table-layout: fixed;
        }
        #vtc-attendance-dashboard-overlay th,
        #vtc-attendance-dashboard-overlay td {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(252,211,77,0.08);
          text-align: left;
          vertical-align: top;
          font-size: 1rem;
        }
        #vtc-attendance-dashboard-overlay th:nth-child(1),
        #vtc-attendance-dashboard-overlay td:nth-child(1) { width: 30%; }
        #vtc-attendance-dashboard-overlay th:nth-child(2),
        #vtc-attendance-dashboard-overlay td:nth-child(2) { width: 13%; }
        #vtc-attendance-dashboard-overlay th:nth-child(3),
        #vtc-attendance-dashboard-overlay td:nth-child(3) { width: 13%; }
        #vtc-attendance-dashboard-overlay th:nth-child(4),
        #vtc-attendance-dashboard-overlay td:nth-child(4) { width: 18%; }
        #vtc-attendance-dashboard-overlay th:nth-child(5),
        #vtc-attendance-dashboard-overlay td:nth-child(5) { width: 12%; }
        #vtc-attendance-dashboard-overlay th:nth-child(6),
        #vtc-attendance-dashboard-overlay td:nth-child(6) { width: 14%; }
        #vtc-attendance-dashboard-overlay th {
          background: rgba(252,211,77,0.06);
          color: #fcd34d;
          font-weight: 600;
          font-size: 0.85rem;
          text-transform: lowercase;
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
        #vtc-attendance-dashboard-overlay .vtc-bar-wrap {
          position: relative;
          height: 10px;
          background: rgba(255,255,255,0.06);
          border-radius: 999px;
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
          left: 70%;
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
          padding: 4px 10px;
          border-radius: 6px;
          background: rgba(41,37,36,0.98);
          border: 1px solid rgba(252,211,77,0.2);
          color: #fbbf24;
          font-size: 0.7rem;
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
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        #vtc-attendance-dashboard-overlay .vtc-pie-legend span {
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #d6d3d1;
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
          padding: 4px 14px;
          border-radius: 999px;
          font-size: 0.8rem;
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
        #vtc-attendance-dashboard-overlay .vtc-th-tip {
          position: relative;
          cursor: help;
          white-space: nowrap;
        }
        #vtc-attendance-dashboard-overlay .vtc-th-tip::after {
          content: attr(data-tip);
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          transform: none;
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(41,37,36,0.98);
          border: 1px solid rgba(252,211,77,0.2);
          color: #fbbf24;
          font-size: 0.75rem;
          font-weight: 400;
          text-transform: none;
          letter-spacing: normal;
          white-space: normal;
          min-width: 160px;
          max-width: 240px;
          text-align: left;
          line-height: 1.4;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s;
          z-index: 2147483647;
        }
        #vtc-attendance-dashboard-overlay th {
          position: relative;
          overflow: visible;
        }
        #vtc-attendance-dashboard-overlay table,
        #vtc-attendance-dashboard-overlay thead,
        #vtc-attendance-dashboard-overlay tbody,
        #vtc-attendance-dashboard-overlay tr {
          overflow: visible;
        }
        #vtc-attendance-dashboard-overlay .vtc-th-tip:hover::after,
        #vtc-attendance-dashboard-overlay .vtc-th-tip.show-tip::after {
          opacity: 1;
        }
        #vtc-attendance-dashboard-overlay .vtc-th-short {
          display: none;
        }
        @media (max-width: 640px) {
          #vtc-attendance-dashboard-overlay .vtc-dashboard {
            padding: 14px 10px;
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
            justify-content: space-between;
            gap: 6px;
          }
          #vtc-attendance-dashboard-overlay .vtc-muted {
            font-size: 0.6rem;
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
            font-size: 0.75rem;
            padding: 5px 8px;
            flex: 1;
            min-width: 0;
          }
          #vtc-attendance-dashboard-overlay .vtc-downloads-section button,
          #vtc-attendance-dashboard-overlay .vtc-downloads-top button {
            font-size: 0.75rem;
            padding: 5px 10px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay #vtc-dashboard-ics-btn {
            font-size: 0.75rem;
            padding: 5px 10px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay #vtc-ics-filter-toggle {
            font-size: 0.75rem;
            padding: 5px 10px;
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
            font-size: 0.75rem;
            padding: 5px 10px;
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
            font-size: 0.7rem;
            padding: 5px 10px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay .vtc-bar-wrap,
          #vtc-attendance-dashboard-overlay .vtc-bar {
            height: 5px;
          }
          #vtc-attendance-dashboard-overlay .vtc-bar-tip::after {
            font-size: 0.6rem;
            padding: 3px 8px;
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
          #vtc-attendance-dashboard-overlay th,
          #vtc-attendance-dashboard-overlay td {
            padding: 4px 2px;
            font-size: 0.62rem;
          }
          #vtc-attendance-dashboard-overlay table {
            display: table;
            table-layout: fixed;
            width: 100%;
            min-width: 520px;
            white-space: normal;
            border-radius: 8px;
          }
          #vtc-attendance-dashboard-overlay .vtc-table-scroll {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 0 -10px;
            padding: 0 10px;
          }
          #vtc-attendance-dashboard-overlay .vtc-table-scroll::-webkit-scrollbar {
            height: 4px;
          }
          #vtc-attendance-dashboard-overlay .vtc-table-scroll::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
            border-radius: 4px;
          }
          #vtc-attendance-dashboard-overlay .vtc-table-scroll::-webkit-scrollbar-thumb {
            background: rgba(252,211,77,0.3);
            border-radius: 4px;
          }
          #vtc-attendance-dashboard-overlay th:nth-child(1),
          #vtc-attendance-dashboard-overlay td:nth-child(1) { width: 28%; }
          #vtc-attendance-dashboard-overlay th:nth-child(2),
          #vtc-attendance-dashboard-overlay td:nth-child(2) { width: 12%; }
          #vtc-attendance-dashboard-overlay th:nth-child(3),
          #vtc-attendance-dashboard-overlay td:nth-child(3) { width: 12%; }
          #vtc-attendance-dashboard-overlay th:nth-child(4),
          #vtc-attendance-dashboard-overlay td:nth-child(4) { width: 20%; }
          #vtc-attendance-dashboard-overlay th:nth-child(5),
          #vtc-attendance-dashboard-overlay td:nth-child(5) { width: 12%; }
          #vtc-attendance-dashboard-overlay th:nth-child(6),
          #vtc-attendance-dashboard-overlay td:nth-child(6) { width: 16%; }
          #vtc-attendance-dashboard-overlay .vtc-badge {
            font-size: 0.6rem;
            padding: 2px 6px;
            white-space: nowrap;
          }
          #vtc-attendance-dashboard-overlay .vtc-skip,
          #vtc-attendance-dashboard-overlay .vtc-absent {
            font-size: 0.62rem;
          }
          #vtc-attendance-dashboard-overlay .vtc-cross-sem {
            font-size: 0.55rem;
            padding: 1px 4px;
          }
          #vtc-attendance-dashboard-overlay .vtc-th-long {
            display: none;
          }
          #vtc-attendance-dashboard-overlay .vtc-th-tip::after {
            left: 0;
            transform: none;
            min-width: 140px;
            max-width: 200px;
            font-size: 0.7rem;
            padding: 6px 8px;
          }
          #vtc-attendance-dashboard-overlay .vtc-th-short {
            display: inline;
          }
          #vtc-attendance-dashboard-overlay td .vtc-muted {
            display: none;
          }
          #vtc-attendance-dashboard-overlay td:first-child strong {
            font-size: 0.78rem;
          }
          #vtc-attendance-dashboard-overlay .vtc-pie {
            width: 80px;
            height: 80px;
          }
          #vtc-attendance-dashboard-overlay .vtc-pie::after {
            inset: 20px;
          }
        }
      </style>

      <div class="vtc-dashboard">
        <div style="background: rgba(220,38,38,0.12); border: 1px solid rgba(248,113,113,0.3); border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; text-align: center;">
          <p style="margin: 0; color: #f87171; font-size: 1.1rem; font-weight: 700;">&#9888; for reference only</p>
          <p style="margin: 6px 0 0; color: #fca5a5; font-size: 0.85rem;">not 100% confirmed. always double-check with your official attendance.</p>
        </div>

        <div class="vtc-sticky-header">
          <div class="vtc-header">
            <div>
              <h1>VTC Attendance Dashboard</h1>
              <div class="vtc-muted">blue = current rate, green = best possible rate, red line = 70%</div>
            </div>
            <div class="vtc-header-actions">
              <select id="vtc-semester-select" class="vtc-semester-select">
                ${semesterNames.map(name => `<option value="${esc(name)}" ${name === activeSemester ? 'selected' : ''}>${esc(name)}</option>`).join('')}
              </select>
              <button class="vtc-close" type="button">close</button>
            </div>
          </div>
        </div>

        <div id="vtc-pie">
          ${buildPieChart(initialSummaries, initialRating)}
        </div>

        <div style="display:flex;gap:10px;align-items:center;margin:16px 0;flex-wrap:wrap;">
          <div class="vtc-downloads-section" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <select id="vtc-dashboard-download-select">
              <option value="summary-json">summary JSON</option>
              <option value="details-json">details JSON</option>
              <option value="summary-csv">summary CSV</option>
              <option value="details-csv">details CSV</option>
            </select>
            <button id="vtc-dashboard-download-btn" type="button">download</button>
          </div>

          ${icsModules.length > 0 ? `
          <div class="vtc-ics-section">
            <button id="vtc-dashboard-ics-btn" class="vtc-export-btn" type="button" title="download an .ics file you can import into Google Calendar, Apple Calendar, or Outlook">export ICS</button>
            <div style="position:relative;display:inline-block;">
              <button id="vtc-ics-filter-toggle" class="vtc-export-filter-btn" type="button">filter modules</button>
              <div id="vtc-ics-filter-panel" style="display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:1000;width:220px;background:rgba(10,10,10,0.98);border:1px solid rgba(252,211,77,0.2);border-radius:8px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                <p style="margin:0 0 6px;font-size:0.75rem;color:#fcd34d;font-weight:600;">select modules to export</p>
                <div id="vtc-ics-filter-list" style="display:flex;flex-direction:column;max-height:200px;overflow-y:auto;"></div>
              </div>
            </div>
          </div>` : `
          <div class="vtc-ics-section">
            <button id="vtc-dashboard-ics-btn" class="vtc-export-btn" type="button" title="download an .ics file you can import into Google Calendar, Apple Calendar, or Outlook">export ICS</button>
          </div>`}
        </div>

        <div class="vtc-table-scroll">
          <table>
            <thead>
              <tr>
                <th><span class="vtc-th-tip" data-tip="module code and name">module &#9432;</span></th>
                <th><span class="vtc-th-tip" data-tip="your current attendance rate based on recorded hours"><span class="vtc-th-long">current</span><span class="vtc-th-short">cur</span> &#9432;</span></th>
                <th><span class="vtc-th-tip" data-tip="max possible rate if you attend every future lesson"><span class="vtc-th-long">best possible</span><span class="vtc-th-short">best</span> &#9432;</span></th>
                <th><span class="vtc-th-tip" data-tip="attended hours / total scheduled hours from calendar">hours &#9432;</span></th>
                <th><span class="vtc-th-tip" data-tip="hours for lessons that have not happened yet"><span class="vtc-th-long">future</span><span class="vtc-th-short">fut</span> &#9432;</span></th>
                <th><span class="vtc-th-tip" data-tip="passed = above 70%, almost pass = below 70% but can reach, failed = cannot reach 70% even if all future attended, no record = no attendance data">status &#9432;</span></th>
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

    const fileMap = {
      'summary-json': () => ({ name: 'vtc-integrated-attendance-summary.json', mime: 'application/json;charset=utf-8', content: JSON.stringify(semesterSummaries[currentSemester], null, 2) }),
      'details-json': () => ({ name: 'vtc-integrated-attendance-details.json', mime: 'application/json;charset=utf-8', content: JSON.stringify(details, null, 2) }),
      'summary-csv': () => ({ name: 'vtc-integrated-attendance-summary.csv', mime: 'text/csv;charset=utf-8', content: toCsv(semesterSummaries[currentSemester]) }),
      'details-csv': () => ({ name: 'vtc-integrated-attendance-details.csv', mime: 'text/csv;charset=utf-8', content: toCsv(details) })
    };

    overlay.querySelector(".vtc-close").addEventListener("click", () => {
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

    if (icsFilterList && icsModules.length > 0) {
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
        const gid = `vtc-ics-group-${groupIndex}`;
        html += `<div style="margin-bottom:10px;" data-ics-group="${esc(semName)}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <p style="margin:0;font-size:0.7rem;color:#a8a29e;font-weight:600;">${esc(semName)}</p>
            <div style="display:flex;gap:6px;">
              <a href="#" class="vtc-ics-all" data-group="${esc(semName)}" style="font-size:0.8rem;color:#fbbf24;text-decoration:none;padding:2px 4px;">all</a>
              <a href="#" class="vtc-ics-off" data-group="${esc(semName)}" style="font-size:0.8rem;color:#a8a29e;text-decoration:none;padding:2px 4px;">off</a>
            </div>
          </div>`;
        for (const code of codes) {
          html += `<label style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;font-size:0.8rem;color:#d6d3d1;">
            <input type="checkbox" value="${esc(code)}" checked style="accent-color:#fbbf24;cursor:pointer;width:16px;height:16px;min-width:16px;">
            <span>${esc(code)}</span>
          </label>`;
        }
        html += `</div>`;
        groupIndex++;
      }
      if (unassigned.length > 0) {
        html += `<div style="margin-bottom:10px;" data-ics-group="other">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <p style="margin:0;font-size:0.7rem;color:#a8a29e;font-weight:600;">other</p>
            <div style="display:flex;gap:6px;">
              <a href="#" class="vtc-ics-all" data-group="other" style="font-size:0.8rem;color:#fbbf24;text-decoration:none;padding:2px 4px;">all</a>
              <a href="#" class="vtc-ics-off" data-group="other" style="font-size:0.8rem;color:#a8a29e;text-decoration:none;padding:2px 4px;">off</a>
            </div>
          </div>`;
        for (const code of unassigned) {
          html += `<label style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;font-size:0.8rem;color:#d6d3d1;">
            <input type="checkbox" value="${esc(code)}" checked style="accent-color:#fbbf24;cursor:pointer;width:16px;height:16px;min-width:16px;">
            <span>${esc(code)}</span>
          </label>`;
        }
        html += `</div>`;
      }
      icsFilterList.innerHTML = html;

      const updateCheckboxState = (cb) => {
        if (cb.checked) icsSelected.add(cb.value);
        else icsSelected.delete(cb.value);
      };

      icsFilterList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => updateCheckboxState(cb));
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
            updateCheckboxState(cb);
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
            updateCheckboxState(cb);
          });
        });
      });
    }

    if (icsFilterToggle && icsFilterPanel) {
      icsFilterToggle.addEventListener('click', () => {
        const isHidden = icsFilterPanel.style.display === 'none';
        icsFilterPanel.style.display = isHidden ? 'block' : 'none';
        icsFilterToggle.textContent = isHidden ? 'hide filter' : 'filter modules';
      });
      icsFilterPanel.style.display = 'none';
    }

    overlay.querySelector("#vtc-dashboard-ics-btn").addEventListener("click", () => {
      const btn = overlay.querySelector("#vtc-dashboard-ics-btn");
      const originalText = btn.textContent;
      btn.textContent = "exporting...";
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

    overlay.querySelector("#vtc-semester-select").addEventListener("change", (e) => {
      currentSemester = e.target.value;
      const sums = semesterSummaries[currentSemester] || [];
      overlay.querySelector("#vtc-table-body").innerHTML = buildRows(sums);
      overlay.querySelector("#vtc-pie").innerHTML = buildPieChart(sums, buildRating(sums));
    });

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

  const findMenuUrlByText = text => {
    const links = [...document.querySelectorAll("a[href]")];
    const link = links.find(a => {
      const label = clean(a.textContent);
      return label === text || label.includes(text);
    });

    if (!link) {
      throw new Error(`Cannot find left menu link: ${text}`);
    }

    return new URL(link.getAttribute("href"), location.origin).href;
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
    if (/Absent/i.test(row.status)) return 0;

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

    const calendarUrl = findMenuUrlByText("Calendar");
    console.log("Fetching Calendar page:", calendarUrl);
    pushStep('Finding calendar API...');

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
      updateStatus(`Fetching calendar ${ymd(cursor)} -> ${ymd(chunkEnd)}`);
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
    const profileUrl = findMenuUrlByText("Profile");
    console.log("Loading Profile in hidden iframe:", profileUrl);
    pushStep('Finding Class Attendance page...');

    const iframe = await loadIframe(profileUrl);
    let doc = iframe.contentDocument;

    if (findAttendanceForm(doc)) {
      const html = doc.documentElement.outerHTML;
      iframe.remove();
      return html;
    }

    const classTabLink = [...doc.querySelectorAll("a[id]")]
      .find(a => clean(a.textContent).includes("Class Attendance"));

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
    pushStep('Fetching calendar events...');

    const calendarEvents = await fetchCalendarEvents();

    console.log(`Calendar events fetched: ${calendarEvents.length}`);
    console.log("Sample calendar event:", calendarEvents[0]);
    console.log("Sample event code:", moduleCodeFromText(getEventText(calendarEvents[0])));
    console.log("Sample event minutes:", eventMinutes(calendarEvents[0]));
    pushStep(`Found ${calendarEvents.length} calendar events`);

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
    pushStep(`Grabbing ${modules.length} module(s)...`);

    const summaries = [];
    const details = [];

    for (let idx = 0; idx < modules.length; idx++) {
      const module = modules[idx];
      console.log("Attendance module:", module.text);
      updateStatus(`${idx + 1}/${modules.length}: ${module.text}`);

      html = await submitModule(html, module);
      doc = parseHtml(html);

      const rows = parseRows(doc);

      const recordMinutes = rows.reduce((sum, row) => sum + lessonMinutes(row.lessonTime), 0);
      const attendedMinutes = rows.reduce((sum, row) => sum + attendedMinutesFromRow(row), 0);

      const present = rows.filter(row => /^Present$/i.test(row.status)).length;
      const late = rows.filter(row => /^Late$/i.test(row.status)).length;
      const absent = rows.filter(row => /Absent/i.test(row.status)).length;
      const lateMinutes = rows.reduce((sum, row) => {
        if (!/^Late$/i.test(row.status)) return sum;
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
        : currentHourRate < THRESHOLD
          ? "BELOW_70_NOW"
          : "OK_NOW";

      const bestStatus70 = bestPossibleFullTermRate == null
        ? "NO_CALENDAR_MATCH"
        : bestPossibleFullTermRate < THRESHOLD
          ? "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT"
          : "CAN_REACH_OR_KEEP_70_IF_FUTURE_PRESENT";

      const calHours = +(calendarMinutes / 60).toFixed(2);
      const attHours = +(attendedMinutes / 60).toFixed(2);
      const futHours = +(futureMinutes / 60).toFixed(2);
      const neededHours = Math.max(0, (THRESHOLD / 100) * calHours - attHours);
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
    pushStep('Detecting semesters...');
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
      const pres = modDetails.filter(row => /^Present$/i.test(row.status)).length;
      const lat = modDetails.filter(row => /^Late$/i.test(row.status)).length;
      const abs = modDetails.filter(row => /Absent/i.test(row.status)).length;
      const lateMins = modDetails.reduce((sum, row) => {
        if (!/^Late$/i.test(row.status)) return sum;
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
      const neededHours = Math.max(0, (THRESHOLD / 100) * calHours - attHours);
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
        status70: curRate == null ? "NO_RECORD" : curRate < THRESHOLD ? "BELOW_70_NOW" : "OK_NOW",
        bestStatus70: bestRate == null ? "NO_CALENDAR_MATCH" : bestRate < THRESHOLD ? "CANNOT_REACH_70_EVEN_IF_FUTURE_PRESENT" : "CAN_REACH_OR_KEEP_70_IF_FUTURE_PRESENT"
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
        const allAbs = allModDets.filter(row => /Absent/i.test(row.status)).length;
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

    showStatus(`Done! Grabbed ${modules.length} module(s)`, 'success');

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
    pushStep(`Error: ${e.message || 'unknown error'}`);
    showStatus('Something went wrong', 'error');
  });
})();
