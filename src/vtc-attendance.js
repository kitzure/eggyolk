var allModules = {};

function loadAllModules() {
  try {
    var stored = localStorage.getItem('vtc-modules');
    if (stored) allModules = JSON.parse(stored);
  } catch (e) {
    allModules = {};
  }
}

function saveAllModules() {
  try {
    localStorage.setItem('vtc-modules', JSON.stringify(allModules));
  } catch (e) {}
}

loadAllModules();

var step1 = document.getElementById('step1');
var step4 = document.getElementById('step4');
var mainBack = document.getElementById('mainBack');
var resultsArea = document.getElementById('resultsArea');

// restore saved app state on page load
(function restoreOnLoad() {
  var rawHash = window.location.hash || '';
  var isAutoMode = rawHash.indexOf('mode=auto') !== -1;

  // ── AUTO-CALCULATE from calendar + attendance records ──────────────
  if (tryAutoCalculate()) return;

  // If opened from grabber (#mode=auto) but no data found, show a clear message
  if (isAutoMode) {
    step1.classList.add('hidden');
    if (mainBack) mainBack.classList.add('hidden');
    if (resultsArea) {
      resultsArea.innerHTML = '<p class="about-text">no grabbed data found</p>' +
        '<div class="spacer-half"></div>' +
        '<p style="font-size:0.8rem;color:#a8a29e;line-height:1.5;">the grabber may still be running, or the data was cleared.<br>please run the bookmarklet again on the VTC portal.</p>';
    }
    if (step4) step4.classList.remove('hidden');
    return;
  }
})();

function tryAutoCalculate() {
  // ── NEW: check for integrated data (hours-based calculation) ────────
  var integratedData;
  try {
    integratedData = JSON.parse(localStorage.getItem('vtc-integrated-data'));
  } catch (e) {}

  var summaries = null;
  if (integratedData && integratedData.semesterSummaries) {
    summaries = integratedData.semesterSummaries.Overall || integratedData.semesterSummaries[Object.keys(integratedData.semesterSummaries)[0]] || [];
  } else if (integratedData && integratedData.summaries) {
    summaries = integratedData.summaries;
  }

  if (summaries && summaries.length > 0) {
    step1.classList.add('hidden');
    if (mainBack) mainBack.classList.add('hidden');

    var html = '<p class="about-text">auto-calculated from VTC calendar + attendance records</p>';
    html += '<div class="spacer-half"></div>';

    for (var i = 0; i < summaries.length; i++) {
      var s = summaries[i];
      var statusColor = '#78716c';
      var statusBg = 'rgba(0,0,0,0.2)';
      var statusBorder = 'rgba(252,211,77,0.1)';

      if (s.status70 === 'BELOW_70_NOW') {
        statusColor = '#f87171';
        statusBg = 'rgba(248,113,113,0.08)';
        statusBorder = 'rgba(248,113,113,0.25)';
      } else if (s.status70 === 'OK_NOW') {
        statusColor = '#34d399';
        statusBg = 'rgba(52,211,153,0.08)';
        statusBorder = 'rgba(52,211,153,0.25)';
      }

      html += '<div style="margin-bottom:1.2rem;padding:0.8rem 1rem;border-radius:10px;background:' + statusBg + ';border:1px solid ' + statusBorder + ';">';

      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">';
      html += '<strong style="color:#fcd34d;font-size:1.05rem;">' + s.moduleCode + '</strong>';
      html += '<span style="font-size:0.9rem;color:' + statusColor + ';font-weight:600;">' + (s.currentHourRate != null ? s.currentHourRate + '%' : 'N/A') + '</span>';
      html += '</div>';

      html += '<div style="font-size:0.75rem;color:#a8a29e;margin-bottom:0.5rem;">';
      html += 'recorded <strong style="color:#d6d3d1;">' + s.attendanceRecordHours + ' hrs</strong> / calendar <strong style="color:#d6d3d1;">' + s.calendarScheduledHours + ' hrs</strong>';
      if (s.futureCalendarHours > 0) {
        html += ' &mdash; <strong style="color:#78716c;">' + s.futureCalendarHours + ' hrs</strong> not started';
      }
      html += '</div>';

      html += '<div class="vtc-breakdown" style="font-size:0.78rem;">';
      html += '<span>Present: <strong>' + s.present + '</strong></span>';
      html += '<span>Late: <strong>' + s.late + '</strong></span>';
      html += '<span>Absent: <strong>' + s.absent + '</strong></span>';
      html += '<span>Attended: <strong>' + s.attendedHours + ' hrs</strong></span>';
      html += '<span>Deducted: <strong>' + s.deductedHours + ' hrs</strong></span>';
      html += '</div>';

      if (s.bestPossibleFullTermRate != null) {
        var projColor = s.bestStatus70.indexOf('CANNOT_REACH') !== -1 ? '#f87171' : '#34d399';
        html += '<div style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid rgba(255,255,255,0.05);font-size:0.75rem;color:#a8a29e;">';
        if (s.bestStatus70.indexOf('CANNOT_REACH') !== -1) {
          html += '<span style="color:#f87171;">&#9888;</span> Even if all future lessons attended, max rate: <strong style="color:#f87171;">' + s.bestPossibleFullTermRate + '%</strong>';
        } else if (s.bestStatus70.indexOf('CAN_REACH') !== -1 && s.status70 === 'BELOW_70_NOW') {
          html += '<span style="color:#34d399;">&#10004;</span> Can reach 70% if future lessons attended (projected: <strong style="color:#34d399;">' + s.bestPossibleFullTermRate + '%</strong>)';
        } else if (s.status70 === 'OK_NOW') {
          html += '<span style="color:#34d399;">&#10004;</span> On track. Full term projection: <strong style="color:#34d399;">' + s.bestPossibleFullTermRate + '%</strong>';
        }
        html += '</div>';
      }

      html += '</div>';
    }

    if (resultsArea) resultsArea.innerHTML = html;
    if (step4) step4.classList.remove('hidden');
    return true;
  }

  // ── FALLBACK: old calendar + attendance records merge ────────────────
  var calData, attData;
  try {
    calData = JSON.parse(localStorage.getItem('vtc-calendar-data'));
    attData = JSON.parse(localStorage.getItem('vtc-attendance-records'));
  } catch (e) { return false; }

  if (!calData || !calData.rawEvents || !attData || !attData.records) return false;

  step1.classList.add('hidden');
  if (mainBack) mainBack.classList.add('hidden');

  var moduleRegex = /\b([A-Z]{2,4}\d{3,4}[A-Z]?)\b/;

  function parseICalDate(str) {
    if (!str || typeof str !== 'string') return null;
    var m = str.match(/(\d{4})(\d{2})(\d{2})T/);
    if (!m) return null;
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function extractCode(title) {
    var match = String(title).match(moduleRegex);
    return match ? match[1] : null;
  }

  var calByModule = {};
  for (var i = 0; i < calData.rawEvents.length; i++) {
    var ev = calData.rawEvents[i];
    if (!ev || typeof ev !== 'object') continue;
    var title = ev.summary || ev.title || ev.name || ev.subject || ev.description || '';
    var code = extractCode(title);
    if (!code) {
      var fields = ['course', 'module', 'code', 'eventName', 'activity', 'event'];
      for (var k = 0; k < fields.length; k++) {
        if (ev[fields[k]]) {
          var m = String(ev[fields[k]]).match(moduleRegex);
          if (m) { code = m[1]; break; }
        }
      }
    }
    if (!code) continue;
    var iso = parseICalDate(ev.startDateTime || ev.start || ev.date || ev.begin || ev.from || ev.day || ev.dateTime || ev.scheduledDate || '');
    if (!iso) iso = parseICalDate(ev.endDateTime || ev.end || ev.to || ev.finish || '');
    if (!iso) continue;
    if (!calByModule[code]) calByModule[code] = [];
    calByModule[code].push({ date: iso, raw: ev });
  }

  var results = [];
  var moduleCodes = Object.keys(calByModule).sort();

  for (var mIdx = 0; mIdx < moduleCodes.length; mIdx++) {
    var code = moduleCodes[mIdx];
    var events = calByModule[code];
    events.sort(function (a, b) {
      var ad = a.date.split('/');
      var bd = b.date.split('/');
      var adt = new Date(+ad[2], +ad[1] - 1, +ad[0]);
      var bdt = new Date(+bd[2], +bd[1] - 1, +bd[0]);
      return adt - bdt;
    });

    var attRows = attData.records[code] || [];
    var attMap = {};
    for (var r = 0; r < attRows.length; r++) {
      attMap[attRows[r].date] = attRows[r].status;
    }

    var lessonsArr = [];
    var present = 0, late = 0, absent = 0, notStarted = 0;

    for (var eIdx = 0; eIdx < events.length; eIdx++) {
      var evDate = events[eIdx].date;
      var status = attMap[evDate];
      var lessonStatus = 'none';
      if (status) {
        var st = String(status).toLowerCase().trim();
        if (st === 'present') { lessonStatus = 'attended'; present++; }
        else if (st === 'late') { late++; }
        else if (st.indexOf('absent') !== -1) { lessonStatus = 'absent'; absent++; }
        else { notStarted++; }
      } else {
        notStarted++;
      }
      lessonsArr.push({ status: lessonStatus, date: evDate });
    }

    var total = lessonsArr.length;
    var attended = present + late;
    var attendRate = total > 0 ? ((attended / total) * 100).toFixed(1) : 0;
    var absentRate = total > 0 ? ((absent / total) * 100).toFixed(1) : 0;

    allModules[code] = {
      code: code,
      totalLessons: total,
      weeks: total ? '1' + (total > 1 ? '-' + total : '') : 'unknown',
      weekArray: total ? Array.from({ length: total }, function (_, i) { return i + 1; }) : [],
      lessons: lessonsArr,
      semStart: calData.semStart || '',
      semEnd: calData.semEnd || ''
    };

    results.push({
      code: code,
      total: total,
      present: present,
      late: late,
      absent: absent,
      notStarted: notStarted,
      attendRate: attendRate,
      absentRate: absentRate
    });
  }

  saveAllModules();

  var html = '<p class="about-text">auto-calculated from VTC calendar + attendance records</p>';
  html += '<div class="spacer-half"></div>';

  for (var ri = 0; ri < results.length; ri++) {
    var res = results[ri];
    html += '<div style="margin-bottom:1.2rem;padding:0.8rem 1rem;border-radius:10px;background:rgba(0,0,0,0.2);border:1px solid rgba(252,211,77,0.1);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">';
    html += '<strong style="color:#fcd34d;font-size:1.05rem;">' + res.code + '</strong>';
    html += '<span style="font-size:0.85rem;color:#78716c;">' + res.attendRate + '%</span>';
    html += '</div>';
    html += '<div class="vtc-breakdown" style="font-size:0.8rem;">';
    html += '<span>On time: <strong>' + res.present + '</strong></span>';
    html += '<span>Late: <strong>' + res.late + '</strong></span>';
    html += '<span>Absent: <strong>' + res.absent + '</strong></span>';
    if (res.notStarted > 0) html += '<span class="vtc-unmarked">Not started: <strong>' + res.notStarted + '</strong></span>';
    html += '<span>Total: <strong>' + res.total + '</strong></span>';
    html += '</div>';
    html += '</div>';
  }

  if (resultsArea) resultsArea.innerHTML = html;
  if (step4) step4.classList.remove('hidden');

  return true;
}

document.getElementById('startOver').addEventListener('click', function () {
  try {
    localStorage.removeItem('vtc-modules');
    localStorage.removeItem('vtc-app-state');
    localStorage.removeItem('vtc-calendar-data');
    localStorage.removeItem('vtc-attendance-records');
    localStorage.removeItem('vtc-integrated-data');
  } catch (e) {}
  allModules = {};
  if (resultsArea) resultsArea.innerHTML = '';
  step4.classList.add('hidden');
  step1.classList.remove('hidden');
  mainBack.classList.remove('hidden');
});

document.getElementById('backToModules').addEventListener('click', function () {
  step4.classList.add('hidden');
  step1.classList.remove('hidden');
  mainBack.classList.remove('hidden');
});

/* video click-to-zoom */
(function () {
  var videos = document.querySelectorAll('.timetable-video');
  videos.forEach(function (video) {
    video.style.cursor = 'pointer';
    video.addEventListener('click', function () {
      if (video.classList.contains('zoomed')) {
        video.classList.remove('zoomed');
        var bd = document.querySelector('.video-backdrop');
        if (bd) bd.remove();
        return;
      }
      var bd = document.createElement('div');
      bd.className = 'video-backdrop';
      document.body.appendChild(bd);
      video.classList.add('zoomed');
      bd.addEventListener('click', function () {
        video.classList.remove('zoomed');
        bd.remove();
      });
    });
  });
})();
