(function() {
  'use strict';

  // ========== HK Public Holidays (2025-2026) ==========
  var HOLIDAYS = [
    '2025-01-01','2025-01-29','2025-01-30','2025-01-31',
    '2025-04-04','2025-04-05','2025-04-18','2025-04-19','2025-04-21',
    '2025-05-01','2025-05-05','2025-05-31','2025-06-02',
    '2025-07-01','2025-09-16','2025-10-01','2025-10-11','2025-10-21',
    '2025-12-25','2025-12-26',
    '2026-01-01','2026-02-17','2026-02-18','2026-02-19',
    '2026-04-04','2026-04-05','2026-04-10','2026-04-11','2026-04-13',
    '2026-05-01','2026-05-25','2026-06-19','2026-07-01',
    '2026-09-25','2026-10-01','2026-10-17','2026-10-27',
    '2026-12-25','2026-12-26'
  ];

  function isHoliday(d) {
    var iso = fmtISO(d);
    return HOLIDAYS.indexOf(iso) !== -1;
  }

  function nextWorkingDay(d) {
    var cur = new Date(d);
    while (isHoliday(cur)) {
      cur.setDate(cur.getDate() + 1);
    }
    return cur;
  }

  function fmtISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
  }

  function pad2(n) {
    return n < 10 ? '0'+n : ''+n;
  }

  function parseLocalDate(str) {
    var p = str.split('-').map(Number);
    return new Date(p[0], p[1]-1, p[2]);
  }

  function daysBetween(a, b) {
    var ms = 24*60*60*1000;
    return Math.round((b - a) / ms);
  }

  // ========== State ==========
  var LS_KEY = 'wisewage_profile';
  var profile = loadProfile();
  var charts = {};
  var selectedCycle = null;
  var selectedYear = null;
  var prevTab = 'dashboard';
  var currentTab = 'welcome';
  var aiConnected = false;
  var aiEnabled = false;

  function loadProfile() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {
      name: '', salary: 0, payday: 4, workHours: 9, workDays: 5,
      balance: 0, aiApiKey: '', expenses: {},
      bonusEnabled: false, bonusThreshold: 10, bonusSalary: 0,
      timesheet: {},
      customMpf: false, empMpf: 0
    };
  }

  function saveProfile() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(profile));
    } catch(e) {}
  }

  // ========== AI Connection Check ==========
  function checkAIConnection() {
    var key = profile.aiApiKey;
    if (!key) {
      aiEnabled = false;
      aiConnected = false;
      updateAILabel();
      return;
    }
    aiEnabled = true;
    updateAILabel();
    fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hello' }] }] })
    })
    .then(function(r) {
      if (r.ok) {
        aiConnected = true;
      } else {
        aiConnected = false;
      }
      updateAILabel();
    })
    .catch(function(err) {
      aiConnected = false;
      updateAILabel();
    });
  }

  function updateAILabel() {
    var aiHead = document.querySelector('.ai-head span');
    var aiBody = document.querySelector('.ai-body .muted');
    if (aiHead) {
      aiHead.textContent = aiEnabled ? 'ai assistant' : 'helper';
    }
    if (aiBody) {
      aiBody.textContent = aiEnabled ? 'ask me anything about your budget!' : 'ask me anything about your budget! (local mode — no api key set) type "help" for a list of things you can ask.';
    }
  }

  // ========== Payday Logic ==========
  function getPaydayInMonth(year, month, day) {
    var d = new Date(year, month, day);
    if (isHoliday(d)) d = nextWorkingDay(d);
    return d;
  }

  function getPaydayBefore(ref) {
    var d = new Date(ref);
    var day = profile.payday || 4;
    var candidate = new Date(d.getFullYear(), d.getMonth(), day);
    if (isHoliday(candidate)) candidate = nextWorkingDay(candidate);
    if (candidate > d) {
      candidate = new Date(d.getFullYear(), d.getMonth()-1, day);
      if (isHoliday(candidate)) candidate = nextWorkingDay(candidate);
    }
    return candidate;
  }

  function getPaydayAfter(ref) {
    var d = new Date(ref);
    var day = profile.payday || 4;
    var candidate = new Date(d.getFullYear(), d.getMonth(), day);
    if (isHoliday(candidate)) candidate = nextWorkingDay(candidate);
    if (candidate <= d) {
      candidate = new Date(d.getFullYear(), d.getMonth()+1, day);
      if (isHoliday(candidate)) candidate = nextWorkingDay(candidate);
    }
    return candidate;
  }

  function getCurrentCycle() {
    var today = new Date();
    var last = getPaydayBefore(today);
    var next = getPaydayAfter(today);
    return { start: last, end: next };
  }

  function getAllCycles() {
    var today = new Date();
    var day = profile.payday || 4;
    // Find earliest expense date to determine how far back to go
    var earliest = new Date(today.getFullYear() - 2, today.getMonth(), 1);
    var allExp = [];
    Object.keys(profile.expenses).forEach(function(key) {
      var arr = profile.expenses[key];
      if (arr) arr.forEach(function(e) {
        if (e.date) allExp.push(parseLocalDate(e.date));
      });
    });
    if (allExp.length) {
      allExp.sort(function(a, b) { return a - b; });
      earliest = allExp[0];
    }
    // Go back one more cycle from earliest
    var start = new Date(earliest.getFullYear(), earliest.getMonth() - 1, day);
    if (isHoliday(start)) start = nextWorkingDay(start);
    // End 2 years ahead
    var end = new Date(today.getFullYear() + 2, today.getMonth(), day);
    if (isHoliday(end)) end = nextWorkingDay(end);
    // Generate cycles
    var cycles = [];
    var m = new Date(start.getFullYear(), start.getMonth(), day);
    if (isHoliday(m)) m = nextWorkingDay(m);
    while (m <= end) {
      var s = new Date(m.getFullYear(), m.getMonth() - 1, day);
      if (isHoliday(s)) s = nextWorkingDay(s);
      cycles.push({ start: s, end: m });
      m = new Date(m.getFullYear(), m.getMonth() + 1, day);
      if (isHoliday(m)) m = nextWorkingDay(m);
    }
    return cycles;
  }

  function cycleKey(cycle) {
    return fmtISO(cycle.start) + '_to_' + fmtISO(cycle.end);
  }

  function getCycleExpenses(cycle) {
    var key = cycleKey(cycle);
    return profile.expenses[key] || [];
  }

  function addExpense(cycle, amount, desc, dateStr) {
    var key = cycleKey(cycle);
    if (!profile.expenses[key]) profile.expenses[key] = [];
    profile.expenses[key].push({
      amount: Number(amount),
      desc: desc || 'expense',
      date: dateStr || fmtISO(new Date())
    });
    profile.balance = Math.max(0, Number(profile.balance) - Number(amount));
    saveProfile();
  }

  function delExpense(cycle, idx) {
    var key = cycleKey(cycle);
    if (profile.expenses[key]) {
      var amount = profile.expenses[key][idx].amount || 0;
      profile.expenses[key].splice(idx, 1);
      profile.balance = Number(profile.balance) + Number(amount);
      saveProfile();
    }
  }

  // ========== Toast ==========
  function showToast(msg, source, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    var icon = type === 'success' ? '&#10003;' : (type === 'error' ? '&#10007;' : 'i');
    var iconClass = 'toast-icon';
    if (type === 'success') iconClass += ' toast-success';
    if (type === 'error') iconClass += ' toast-error';
    toast.className = 'toast';
    toast.innerHTML =
      '<div class="' + iconClass + '">' + icon + '</div>' +
      '<div class="toast-body">' +
        '<div class="toast-msg">' + esc(msg) + '</div>' +
        '<div class="toast-source">' + (source ? esc(source) : 'wisewage') + '</div>' +
      '</div>' +
      '<button class="toast-close" aria-label="close">&#10005;</button>';
    container.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // ========== MPF ==========
  function calcMPF(salary, customMpf, empMpf) {
    var s = Number(salary) || 0;
    var emp = 0, empr = 0;
    if (customMpf && Number(empMpf) > 0) {
      emp = Number(empMpf);
      empr = emp; // assume employer matches for simplicity
    } else if (s < 7100) {
      emp = 0;
      empr = s * 0.05;
    } else if (s <= 30000) {
      emp = s * 0.05;
      empr = s * 0.05;
    } else {
      emp = 1500;
      empr = 1500;
    }
    return { employee: emp, employer: empr, total: emp + empr, net: s - emp };
  }

  function calcHourlyWage(salary, hours, days, bonusEnabled, bonusThreshold, bonusSalary, daysWorked) {
    var w = Number(salary) || 0;
    var h = Number(hours) || 9;
    var d = Number(days) || 5;
    var monthlyHours = h * d * 4.33;
    if (monthlyHours <= 0) return 0;

    var baseRate = w / monthlyHours;
    var hasBonus = !!bonusEnabled;
    var threshold = Number(bonusThreshold) || 10;
    var bonus = Number(bonusSalary) || 0;
    var worked = Number(daysWorked) || 0;

    if (!hasBonus || worked <= threshold || bonus <= 0) {
      return baseRate;
    }

    var totalPay = bonus;
    return totalPay / monthlyHours;
  }

  function getTimesheetMonthKey(year, month) {
    return year + '-' + pad2(month + 1);
  }

  function getCurrentMonthDaysWorked() {
    var now = new Date();
    var key = getTimesheetMonthKey(now.getFullYear(), now.getMonth());
    var days = profile.timesheet[key] || [];
    return days.length;
  }

  // ========== UI Helpers ==========
  function fmt$(n) {
    return '$' + Math.round(n).toLocaleString();
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function setHTML(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function showTab(name) {
    if (name !== currentTab) {
      prevTab = currentTab;
      currentTab = name;
    }
    document.querySelectorAll('.tab-panel').forEach(function(p) {
      p.classList.remove('active');
    });
    document.querySelectorAll('.activity-btn').forEach(function(b) {
      b.classList.remove('active');
    });
    document.querySelectorAll('.top-bar-item').forEach(function(b) {
      b.classList.remove('active');
    });
    var panel = document.getElementById('tab-' + name);
    var btn = document.querySelector('.activity-btn[data-tab="' + name + '"]');
    var topItem = document.querySelector('.top-bar-item[data-tab="' + name + '"]');
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');
    if (topItem) topItem.classList.add('active');
    var titles = { welcome:'welcome', dashboard:'dashboard', stats:'stats', profile:'profile', timesheet:'timesheet', settings:'settings' };
    // disable/enable activity bar buttons based on welcome state
    var hasProfile = profile.name && profile.name.trim();
    document.querySelectorAll('.activity-btn').forEach(function(b) {
      var tabName = b.dataset.tab;
      if (tabName === 'back' || tabName === 'settings') {
        b.classList.remove('disabled');
      } else {
        if (!hasProfile) {
          b.classList.add('disabled');
        } else {
          b.classList.remove('disabled');
        }
      }
    });
    document.querySelectorAll('.top-bar-item').forEach(function(b) {
      var tabName = b.dataset.tab;
      if (tabName === 'settings' || tabName === 'timesheet') {
        if (!hasProfile) {
          b.classList.add('disabled');
        } else {
          b.classList.remove('disabled');
        }
      } else {
        if (!hasProfile) {
          b.classList.add('disabled');
        } else {
          b.classList.remove('disabled');
        }
      }
    });
    setText('status-text', titles[name] || name);
    var statusBack = document.getElementById('status-back-btn');
    if (statusBack) {
      statusBack.style.display = name === 'welcome' ? 'none' : 'inline-flex';
    }
    if (name === 'welcome') renderWelcome();
    if (name === 'dashboard') renderDashboard();
    if (name === 'stats') renderStats();
    if (name === 'profile') renderProfile();
    if (name === 'timesheet') renderTimesheetTab();
    if (name === 'settings') renderSettings();
    renderSidebar(name);

    // Manage countdown timer
    if (name === 'dashboard') {
      if (!countdownTimer) countdownTimer = setInterval(updatePaydayCountdown, 1000);
    } else {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }
    updateAIButton();
  }

  function renderSidebar(tab) {
    var sidebarTitle = document.getElementById('sidebar-title');
    var sidebarContent = document.getElementById('sidebar-content');
    if (!sidebarContent || !sidebarTitle) return;
    sidebarTitle.style.display = 'block';
    var titleText = { welcome:'welcome', dashboard:'dashboard', stats:'stats', profile:'profile', timesheet:'timesheet', settings:'settings' };
    sidebarTitle.textContent = titleText[tab] || tab;
    var html = '';
    if (tab === 'welcome') {
      var hasProfile = profile.name && profile.name.trim();
      if (hasProfile) {
        html = '<div style="padding:0 4px;">\n        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">quick start</div>\n        <div class="sidebar-item" style="padding:4px 0;font-size:0.8rem;color:var(--text);">1. add expenses</div>\n        <div class="sidebar-item" style="padding:4px 0;font-size:0.8rem;color:var(--text);">2. view stats</div>\n        <div class="sidebar-item" style="padding:4px 0;font-size:0.8rem;color:var(--text);">3. check settings</div>\n        </div>';
      } else {
        html = '<div style="padding:0 4px;">\n        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">quick start</div>\n        <div class="sidebar-item" style="padding:4px 0;font-size:0.8rem;color:var(--text);">1. set your profile</div>\n        <div class="sidebar-item" style="padding:4px 0;font-size:0.8rem;color:var(--text);">2. add expenses</div>\n        <div class="sidebar-item" style="padding:4px 0;font-size:0.8rem;color:var(--text);">3. view stats</div>\n        </div>';
      }
    } else if (tab === 'dashboard') {
      var hasSalary = profile.salary > 0;
      if (!hasSalary) {
        html = '<div style="padding:0 4px;">' +
          '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">no data yet</div>' +
          '<div class="sidebar-item sidebar-link" style="padding:4px 0;font-size:0.8rem;color:var(--text);cursor:pointer;" id="sidebar-go-profile">1. set your salary</div>' +
          '<div class="sidebar-item sidebar-link" style="padding:4px 0;font-size:0.8rem;color:var(--text);cursor:pointer;" id="sidebar-go-welcome">2. go to welcome</div>' +
          '</div>';
      } else {
        var cycle = getCurrentCycle();
        var mpf = calcMPF(profile.salary, profile.customMpf, profile.empMpf);
        var totalDays = daysBetween(cycle.start, cycle.end);
        var safeDaily = totalDays > 0 ? mpf.net / totalDays : 0;
        var expList = getCycleExpenses(cycle);
        var totalExp = expList.reduce(function(s, e) { return s + e.amount; }, 0);
        html = '<div style="padding:0 4px;">' +
          '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">this cycle</div>' +
          '<div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">net: ' + fmt$(mpf.net) + '</div>' +
          '<div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">daily: ' + fmt$(safeDaily) + '</div>' +
          '<div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">spent: ' + fmt$(totalExp) + '</div>' +
          '<div style="margin-top:12px;font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">actions</div>' +
          '<div class="sidebar-item sidebar-link" style="padding:4px 0;font-size:0.8rem;color:var(--text);cursor:pointer;" id="sidebar-quick-add">+ add expense</div>' +
          '<div style="margin-top:10px;font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">recent expenses</div>';
        if (!expList.length) {
          html += '<div style="font-size:0.75rem;color:var(--text-secondary);padding:2px 0;">no expenses yet</div>';
        } else {
          expList.slice(0, 5).reverse().forEach(function(e) {
            html += '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.75rem;"><span style="color:var(--text);">' + esc(e.desc) + '</span><span style="color:var(--red);">' + fmt$(e.amount) + '</span></div>';
          });
        }
        html += '</div>';
      }
    } else if (tab === 'stats') {
      var hasExpenses = false;
      var allKeys = Object.keys(profile.expenses || {});
      for (var i = 0; i < allKeys.length; i++) {
        if (profile.expenses[allKeys[i]] && profile.expenses[allKeys[i]].length > 0) {
          hasExpenses = true;
          break;
        }
      }
      if (!hasExpenses) {
        html = '<div style="padding:0 4px;text-align:center;">' +
          '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:20px;">no data yet</div>' +
          '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px;">add expenses to see cycles</div>' +
          '</div>';
      } else {
        var cycles = getAllCycles();
        html = '<div style="padding:0 4px;">';
        var groups = {};
        cycles.forEach(function(c) {
          var year = c.end.getFullYear();
          if (!groups[year]) groups[year] = [];
          groups[year].push(c);
        });
        var years = Object.keys(groups).sort(function(a, b) { return a - b; });
        years.forEach(function(year) {
          html += '<div style="font-size:0.75rem;color:var(--text-secondary);margin:8px 0 4px;padding-bottom:2px;border-bottom:1px solid var(--border);">' + year + '</div>';
          groups[year].forEach(function(c) {
            var key = cycleKey(c);
            var curKey = cycleKey(selectedCycle || getCurrentCycle());
            var active = key === curKey ? 'color:var(--accent);' : 'color:var(--text-secondary);';
            html += '<div style="padding:3px 0;font-size:0.75rem;' + active + 'cursor:pointer;" class="sidebar-cycle" data-key="' + key + '">' + pad2(c.start.getMonth()+1) + '/' + pad2(c.start.getDate()) + ' → ' + pad2(c.end.getMonth()+1) + '/' + pad2(c.end.getDate()) + '</div>';
          });
        });
        html += '</div>';
      }
    } else if (tab === 'profile') {
      var mpf = calcMPF(profile.salary, profile.customMpf, profile.empMpf);
      var workedDays = getCurrentMonthDaysWorked();
      var hourly = calcHourlyWage(profile.salary, profile.workHours, profile.workDays, profile.bonusEnabled, profile.bonusThreshold, profile.bonusSalary, workedDays);
      html = '<div style="padding:0 4px;">\n        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">profile summary</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">name: ' + esc(profile.name || '-') + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">salary: ' + fmt$(profile.salary) + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">payday: ' + (profile.payday || '-') + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">balance: ' + fmt$(profile.balance) + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">days worked: ' + workedDays + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">hourly: ' + fmt$(hourly) + '/hr</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">net: ' + fmt$(mpf.net) + '</div>';
      if (profile.customMpf) {
        html += '<div style="margin-top:8px;font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;">mpf</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">employee: ' + fmt$(mpf.employee) + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">employer: ' + fmt$(mpf.employer) + '</div>';
      } else {
        html += '<div style="margin-top:8px;font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;">mpf</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text-secondary);">using standard estimate</div>';
      }
      if (profile.bonusEnabled) {
        html += '<div style="margin-top:8px;font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;">bonus</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">threshold: ' + profile.bonusThreshold + ' days</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">bonus salary: ' + fmt$(profile.bonusSalary) + '</div>';
      }
      html += '</div>';
    } else if (tab === 'timesheet') {
      var workedDays = getCurrentMonthDaysWorked();
      var daysInMonth = new Date(timesheetCurrentYear, timesheetCurrentMonth + 1, 0).getDate();
      html = '<div style="padding:0 4px;">\n        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">this month</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">days worked: ' + workedDays + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">days in month: ' + daysInMonth + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">remaining: ' + (daysInMonth - workedDays) + '</div>';
      if (profile.bonusEnabled) {
        var bonusActive = workedDays > profile.bonusThreshold;
        html += '<div style="margin-top:8px;font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;">bonus</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">threshold: ' + profile.bonusThreshold + ' days</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:var(--text);">bonus salary: ' + fmt$(profile.bonusSalary) + '</div>\n        <div class="sidebar-item" style="padding:3px 0;font-size:0.8rem;color:' + (bonusActive ? 'var(--green)' : 'var(--text)') + ';">status: ' + (bonusActive ? 'active' : 'not yet') + '</div>';
      }
      html += '</div>';
    } else if (tab === 'settings') {
      html = '<div style="padding:0 4px;">\n        <div class="sidebar-item sidebar-link" data-action="scroll" data-target="settings-ai-card" style="padding:4px 0;font-size:0.8rem;color:var(--text);cursor:pointer;">ai assistant</div>\n        <div class="sidebar-item sidebar-link" data-action="trigger" data-target="btn-export" style="padding:4px 0;font-size:0.8rem;color:var(--text);cursor:pointer;">data export</div>\n        <div class="sidebar-item sidebar-link" data-action="trigger" data-target="btn-import" style="padding:4px 0;font-size:0.8rem;color:var(--text);cursor:pointer;">data import</div>\n        <div class="sidebar-item sidebar-link" data-action="trigger" data-target="btn-reset" style="padding:4px 0;font-size:0.8rem;color:var(--text);cursor:pointer;">reset all data</div>\n        </div>';
    }
    sidebarContent.innerHTML = html;
    if (tab === 'stats') {
      sidebarContent.querySelectorAll('.sidebar-cycle').forEach(function(el) {
        el.addEventListener('click', function() {
          var parts = el.dataset.key.split('_to_');
          selectedCycle = { start: parseLocalDate(parts[0]), end: parseLocalDate(parts[1]) };
          renderStats();
          renderSidebar('stats');
        });
      });
    }
    if (tab === 'settings') {
      sidebarContent.querySelectorAll('.sidebar-link').forEach(function(el) {
        el.addEventListener('click', function() {
          var action = el.dataset.action;
          var target = el.dataset.target;
          var label = el.textContent;
          if (action === 'scroll') {
            var targetEl = document.getElementById(target);
            if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('scrolled to ' + label);
          } else if (action === 'trigger') {
            var targetEl = document.getElementById(target);
            if (targetEl) targetEl.click();
            var msg;
            if (label === 'data export') msg = 'exporting data...';
            else if (label === 'data import') msg = 'please import your data (json)';
            else msg = label + ' triggered';
            showToast(msg);
          }
        });
      });
    }
    if (tab === 'dashboard') {
      var goProfile = document.getElementById('sidebar-go-profile');
      var goWelcome = document.getElementById('sidebar-go-welcome');
      var quickAdd = document.getElementById('sidebar-quick-add');
      if (goProfile) {
        goProfile.addEventListener('click', function() {
          showTab('profile');
        });
      }
      if (goWelcome) {
        goWelcome.addEventListener('click', function() {
          showTab('welcome');
        });
      }
      if (quickAdd) {
        quickAdd.addEventListener('click', function() {
          var amountInput = document.getElementById('exp-amount');
          if (amountInput) amountInput.focus();
          showToast('add an expense above', 'wisewage');
        });
      }
    }
  }

  function updateAIButton() {
    var toggle = document.getElementById('ai-toggle');
    if (!toggle) return;
    var hasProfile = profile.name && profile.name.trim();
    toggle.style.display = hasProfile ? 'flex' : 'none';
  }

  // ========== Welcome ==========
  function renderWelcome() {
    var hasProfile = profile.name && profile.name.trim();
    var titleEl = document.querySelector('.welcome-title');
    var subtitleEl = document.querySelector('.welcome-subtitle');
    var recentSection = document.getElementById('welcome-recent-section');
    var recentList = document.getElementById('welcome-recent-list');

    if (titleEl) {
      titleEl.textContent = hasProfile ? 'welcome back, ' + profile.name : 'wisewage';
    }
    if (subtitleEl) {
      subtitleEl.textContent = hasProfile ? 'your budget dashboard' : 'a budget calculator for hk paychecks';
    }

    if (recentSection && recentList) {
      if (hasProfile) {
        recentSection.style.display = '';
        var cycles = getAllCycles();
        var recentExp = [];
        cycles.slice(-3).reverse().forEach(function(c) {
          var key = cycleKey(c);
          var expList = profile.expenses[key] || [];
          if (expList.length) {
            recentExp.push({
              cycle: fmtISO(c.start) + ' → ' + fmtISO(c.end),
              count: expList.length,
              total: expList.reduce(function(s, e) { return s + e.amount; }, 0)
            });
          }
        });
        if (recentExp.length) {
          recentList.innerHTML = recentExp.map(function(r) {
            return '<div class="welcome-item" style="cursor:default;">' +
              '<span class="welcome-item-icon">📅</span>' +
              '<span class="welcome-item-text">' + r.cycle + '</span>' +
              '<span class="welcome-item-desc">' + r.count + ' items, ' + fmt$(r.total) + '</span>' +
              '</div>';
          }).join('');
        } else {
          recentList.innerHTML = '<div class="welcome-item-text" style="color:var(--text-secondary);font-size:0.8rem;padding:4px 0;">no recent expenses</div>';
        }
      } else {
        recentSection.style.display = 'none';
      }
    }
  }

  function initWelcome() {
    var fileInput = document.getElementById('import-file');
    var startProfileBtn = document.getElementById('welcome-start-profile');
    var startImportBtn = document.getElementById('welcome-start-import');
    var helpOverlay = document.getElementById('help-overlay');
    var helpClose = document.getElementById('help-close');
    var helpCards = document.querySelectorAll('.welcome-card');

    if (startProfileBtn) {
      startProfileBtn.addEventListener('click', function() {
        showTab('profile');
      });
    }

    if (startImportBtn) {
      startImportBtn.addEventListener('click', function() {
        fileInput.click();
      });
    }

    fileInput.addEventListener('change', function() {
      if (!fileInput.files[0]) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = JSON.parse(e.target.result);
          if (data) {
            profile = data;
            saveProfile();
            showToast('data imported successfully', 'wisewage', 'success');
            showTab('dashboard');
          }
        } catch(err) {
          showToast('invalid import file', 'wisewage', 'error');
        }
      };
      reader.readAsText(fileInput.files[0]);
    });

    // Help overlay
    helpCards.forEach(function(card) {
      card.addEventListener('click', function() {
        if (helpOverlay) helpOverlay.classList.add('show');
      });
    });
    if (helpClose) {
      helpClose.addEventListener('click', function() {
        if (helpOverlay) helpOverlay.classList.remove('show');
      });
    }
    if (helpOverlay) {
      helpOverlay.addEventListener('click', function(e) {
        if (e.target === helpOverlay) helpOverlay.classList.remove('show');
      });
    }
  }

  // ========== Dashboard ==========
  function renderDashboard() {
    var cycle = getCurrentCycle();
    var mpf = calcMPF(profile.salary, profile.customMpf, profile.empMpf);
    var totalDays = daysBetween(cycle.start, cycle.end);
    var daysPassed = daysBetween(cycle.start, new Date());
    var daysLeft = daysBetween(new Date(), cycle.end);
    if (daysLeft < 0) daysLeft = 0;
    var safeDaily = totalDays > 0 ? mpf.net / totalDays : 0;
    var expList = getCycleExpenses(cycle);
    var totalExp = expList.reduce(function(s, e) { return s + e.amount; }, 0);
    var committed = safeDaily * daysPassed;
    var remaining = Number(profile.balance) - totalExp - committed;
    if (remaining < 0) remaining = 0;

    var hasSalary = profile.salary > 0;
    var grid = document.querySelector('#tab-dashboard .grid-3');
    var addExpenseCard = document.querySelector('#tab-dashboard .card.mt-2');
    var recentExpCard = document.querySelectorAll('#tab-dashboard .card.mt-2')[1];
    var emptyState = document.getElementById('dash-empty-state');

    if (!hasSalary) {
      if (grid) grid.style.display = 'none';
      if (addExpenseCard) addExpenseCard.style.display = '';
      if (recentExpCard) recentExpCard.style.display = '';
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.id = 'dash-empty-state';
        emptyState.style.marginBottom = '16px';
        emptyState.innerHTML = '<div class="card" style="border-left:3px solid var(--accent);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">' +
          '<div>' +
          '<div style="font-size:0.85rem;color:var(--text);font-weight:600;margin-bottom:4px;">set your monthly salary</div>' +
          '<div style="font-size:0.75rem;color:var(--text-secondary);">add your salary in profile to get budget insights and daily recommendations</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button class="btn btn-small" id="dash-setup-btn">go to profile</button>' +
          '<button class="btn btn-small" id="dash-import-btn" style="background:var(--border);color:var(--text);">import data</button>' +
          '</div>' +
          '</div>' +
          '</div>';
        document.getElementById('tab-dashboard').appendChild(emptyState);
        document.getElementById('dash-setup-btn').addEventListener('click', function() {
          showTab('profile');
        });
        document.getElementById('dash-import-btn').addEventListener('click', function() {
          document.getElementById('import-file').click();
        });
      } else {
        emptyState.style.display = '';
      }
      setText('dash-greeting', '');
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (grid) grid.style.display = '';
      setText('dash-greeting', profile.name ? 'welcome back, ' + profile.name : 'welcome back');
      setText('dash-balance', fmt$(remaining));
      setText('dash-balance-sub', 'starting: ' + fmt$(profile.balance) + ' | spent: ' + fmt$(totalExp));
      setText('dash-daily', fmt$(safeDaily));
      setText('dash-days', String(daysLeft));
      setText('dash-days-sub', fmtISO(cycle.start) + ' → ' + fmtISO(cycle.end));
    }

    if (addExpenseCard) addExpenseCard.style.display = '';
    if (recentExpCard) recentExpCard.style.display = '';

    // Expenses
    var expEl = document.getElementById('exp-list');
    var totalEl = document.getElementById('exp-total');
    setText('exp-total', 'total: ' + fmt$(totalExp));
    if (!expList.length) {
      expEl.innerHTML = '<div style="text-align:center;padding:32px 20px;">' +
        '<div style="font-size:2.5rem;margin-bottom:12px;">📝</div>' +
        '<div style="font-size:1rem;color:var(--text);font-weight:600;margin-bottom:8px;">add your first expense</div>' +
        '<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">use the form above to track your spending</div>' +
        '<div style="font-size:0.75rem;color:var(--text-secondary);">tip: enter the amount and a short description (e.g. "lunch")</div>' +
        '</div>';
    } else {
      expEl.innerHTML = expList.map(function(e, i) {
        return '<div class="expense-item">' +
          '<div class="expense-info">' +
          '<span class="expense-desc">' + esc(e.desc) + '</span>' +
          '<span class="expense-date">' + e.date + '</span>' +
          '</div>' +
          '<div class="flex items-center">' +
          '<span class="expense-amt">' + fmt$(e.amount) + '</span>' +
          '<button class="expense-del" data-idx="' + i + '">×</button>' +
          '</div>' +
          '</div>';
      }).join('');
      expEl.querySelectorAll('.expense-del').forEach(function(b) {
        b.addEventListener('click', function() {
          delExpense(cycle, Number(b.dataset.idx));
          renderDashboard();
        });
      });
    }

    // Date input default
    var dateInput = document.getElementById('exp-date');
    if (dateInput && !dateInput.value) dateInput.value = fmtISO(new Date());

    // Update countdown
    updatePaydayCountdown();
  }

  function updatePaydayCountdown() {
    var countdownEl = document.getElementById('payday-countdown');
    if (!countdownEl) return;

    var cycle = getCurrentCycle();
    var now = new Date();
    var end = cycle.end;
    var diff = end - now;

    if (diff <= 0) {
      countdownEl.textContent = 'payday!';
      return;
    }

    var days = Math.floor(diff / (24 * 60 * 60 * 1000));
    var hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    var minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    var seconds = Math.floor((diff % (60 * 1000)) / 1000);

    if (days > 0) {
      countdownEl.textContent = days + 'd ' + pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
    } else {
      countdownEl.textContent = pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
    }
  }

  var countdownTimer = null;

  function initDashboard() {
    document.getElementById('exp-add').addEventListener('click', function() {
      var amount = Number(document.getElementById('exp-amount').value);
      var desc = document.getElementById('exp-desc').value.trim();
      var dateStr = document.getElementById('exp-date').value;
      if (!amount || amount <= 0) return;
      addExpense(getCurrentCycle(), amount, desc, dateStr);
      document.getElementById('exp-amount').value = '';
      document.getElementById('exp-desc').value = '';
      renderDashboard();
    });
  }

  // ========== Stats ==========
  function renderStats() {
    var cycle = selectedCycle ? selectedCycle : getCurrentCycle();
    var mpf = calcMPF(profile.salary, profile.customMpf, profile.empMpf);
    var workedDays = getCurrentMonthDaysWorked();
    var hourly = calcHourlyWage(profile.salary, profile.workHours, profile.workDays, profile.bonusEnabled, profile.bonusThreshold, profile.bonusSalary, workedDays);
    var hasSalary = profile.salary > 0;
    var hasExpenses = false;
    var allKeys = Object.keys(profile.expenses || {});
    for (var i = 0; i < allKeys.length; i++) {
      if (profile.expenses[allKeys[i]] && profile.expenses[allKeys[i]].length > 0) {
        hasExpenses = true;
        break;
      }
    }
    var hasData = hasSalary || hasExpenses;

    var tabsEl = document.getElementById('cycle-year-tabs');
    var chipsEl = document.getElementById('cycle-chips');
    var cycleInfo = document.getElementById('cycle-info');

    if (!hasExpenses) {
      // No expenses yet - hide date chips and show empty state
      if (tabsEl) tabsEl.style.display = 'none';
      if (chipsEl) chipsEl.innerHTML = '';
      if (cycleInfo) {
        cycleInfo.innerHTML = '<div style="text-align:center;padding:40px 20px;">' +
          '<div style="font-size:2rem;margin-bottom:12px;">&#128196;</div>' +
          '<div style="font-size:1rem;color:var(--text-secondary);font-weight:600;">no data yet</div>' +
          '<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">please go to <strong style="color:var(--accent);">dashboard</strong> and add your first expense</div>' +
          '</div>';
      }
    } else {
      if (tabsEl) tabsEl.style.display = '';
      // Cycle chips - grouped by year
      var cycles = getAllCycles();
      var groups = {};
      cycles.forEach(function(c) {
        var year = c.end.getFullYear();
        if (!groups[year]) groups[year] = [];
        groups[year].push(c);
      });
      var years = Object.keys(groups).sort(function(a, b) { return a - b; });
      if (!selectedYear && years.length) selectedYear = years[Math.max(0, years.indexOf(String(cycle.end.getFullYear())))];
      if (!selectedYear && years.length) selectedYear = years[years.length - 1];

      tabsEl.innerHTML = years.map(function(y) {
        var active = y === selectedYear ? 'active' : '';
        return '<button class="cycle-year-tab ' + active + '" data-year="' + y + '">' + y + '</button>';
      }).join('');
      tabsEl.querySelectorAll('.cycle-year-tab').forEach(function(b) {
        b.addEventListener('click', function() {
          selectedYear = b.dataset.year;
          renderStats();
        });
      });

      var curKey = cycleKey(cycle);
      var yearCycles = groups[selectedYear] || cycles;
      chipsEl.innerHTML = yearCycles.map(function(c) {
        var key = cycleKey(c);
        var active = key === curKey ? 'active' : '';
        return '<button class="cycle-chip ' + active + '" data-key="' + key + '">' + fmtISO(c.start) + ' → ' + fmtISO(c.end) + '</button>';
      }).join('');

      chipsEl.querySelectorAll('.cycle-chip').forEach(function(b) {
        b.addEventListener('click', function() {
          var parts = b.dataset.key.split('_to_');
          selectedCycle = { start: parseLocalDate(parts[0]), end: parseLocalDate(parts[1]) };
          renderStats();
        });
      });

      var totalDays = daysBetween(cycle.start, cycle.end);
      cycleInfo.innerHTML = 'cycle length: ' + totalDays + ' days | net salary: ' + fmt$(mpf.net);
    }

    setText('stat-hourly', fmt$(hourly) + '/hr');

    // Show/hide sections based on salary
    var chartsEl = document.getElementById('stats-charts');
    var mpfEl = document.getElementById('stats-mpf');
    var hourlyEl = document.getElementById('stats-hourly');
    if (chartsEl) chartsEl.style.display = hasSalary ? '' : 'none';
    if (mpfEl) mpfEl.style.display = hasSalary ? '' : 'none';
    if (hourlyEl) hourlyEl.style.display = hasSalary ? '' : 'none';

    // MPF grid
    var mpfGrid = document.getElementById('mpf-grid');
    var empMpfLabel = profile.customMpf ? 'employee mpf (custom)' : 'employee mpf';
    mpfGrid.innerHTML = '' +
      '<div class="card"><div class="card-title">gross salary</div><div class="card-value">' + fmt$(profile.salary) + '</div></div>' +
      '<div class="card"><div class="card-title">' + empMpfLabel + '</div><div class="card-value warn">' + fmt$(mpf.employee) + '</div></div>' +
      '<div class="card"><div class="card-title">employer mpf</div><div class="card-value warn">' + fmt$(mpf.employer) + '</div></div>' +
      '<div class="card"><div class="card-title">net salary</div><div class="card-value">' + fmt$(mpf.net) + '</div></div>';

    // Charts
    if (hasSalary) renderCharts(cycle, mpf, daysBetween(cycle.start, cycle.end));
  }

  function renderCharts(cycle, mpf, totalDays) {
    var expList = getCycleExpenses(cycle);
    var totalExp = expList.reduce(function(s, e) { return s + e.amount; }, 0);

    // Breakdown doughnut
    var ctx1 = document.getElementById('chart-breakdown').getContext('2d');
    if (charts.breakdown) charts.breakdown.destroy();
    charts.breakdown = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['Net Salary', 'Employee MPF', 'Employer MPF'],
        datasets: [{
          data: [mpf.net, mpf.employee, mpf.employer],
          backgroundColor: ['#4ec9b0', '#ce9178', '#858585'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cccccc', font: { size: 11 } } } }
      }
    });

    // Daily spending bar
    var dailyMap = {};
    for (var d = new Date(cycle.start); d <= cycle.end; d.setDate(d.getDate()+1)) {
      dailyMap[fmtISO(d)] = 0;
    }
    expList.forEach(function(e) { if (dailyMap[e.date] !== undefined) dailyMap[e.date] += e.amount; });
    var labels = Object.keys(dailyMap).sort();
    var data = labels.map(function(k) { return dailyMap[k]; });

    var ctx2 = document.getElementById('chart-daily').getContext('2d');
    if (charts.daily) charts.daily.destroy();
    charts.daily = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Spending',
          data: data,
          backgroundColor: '#f44747',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#858585', maxTicksLimit: 10 }, grid: { color: '#3e3e42' } },
          y: { ticks: { color: '#858585' }, grid: { color: '#3e3e42' } }
        },
        plugins: { legend: { display: false } }
      }
    });

    // Balance trend line
    var safeDaily = totalDays > 0 ? mpf.net / totalDays : 0;
    var trendLabels = [];
    var trendData = [];
    var running = Number(profile.balance);
    var cumExp = 0;
    var expByDate = {};
    expList.forEach(function(e) { expByDate[e.date] = (expByDate[e.date] || 0) + e.amount; });
    var dayCount = 0;
    for (var d2 = new Date(cycle.start); d2 <= cycle.end; d2.setDate(d2.getDate()+1)) {
      var iso = fmtISO(d2);
      cumExp += (expByDate[iso] || 0);
      dayCount++;
      var committed = safeDaily * dayCount;
      var bal = Number(profile.balance) - cumExp - committed;
      if (bal < 0) bal = 0;
      trendLabels.push(iso);
      trendData.push(bal);
    }

    var ctx3 = document.getElementById('chart-trend').getContext('2d');
    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [{
          label: 'Projected Balance',
          data: trendData,
          borderColor: '#4ec9b0',
          backgroundColor: 'rgba(78,201,176,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#858585', maxTicksLimit: 10 }, grid: { color: '#3e3e42' } },
          y: { ticks: { color: '#858585' }, grid: { color: '#3e3e42' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // ========== Timesheet Calendar ==========
  var timesheetCurrentYear = new Date().getFullYear();
  var timesheetCurrentMonth = new Date().getMonth();

  function renderTimesheet(year, month) {
    var grid = document.getElementById('timesheet-grid');
    var monthLabel = document.getElementById('timesheet-month');
    if (!grid || !monthLabel) return;

    var monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    monthLabel.textContent = monthNames[month] + ' ' + year;

    var key = getTimesheetMonthKey(year, month);
    var workedDays = profile.timesheet[key] || [];

    var firstDay = new Date(year, month, 1);
    var startDay = firstDay.getDay(); // 0 = sunday
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var prevMonthDays = new Date(year, month, 0).getDate();

    var html = '';
    // Weekday headers
    var weekdays = ['S','M','T','W','T','F','S'];
    weekdays.forEach(function(d) {
      html += '<div style="text-align:center;font-size:0.75rem;color:var(--text-secondary);padding:4px 0;">' + d + '</div>';
    });

    // Previous month padding
    for (var i = startDay - 1; i >= 0; i--) {
      var d = prevMonthDays - i;
      html += '<div class="timesheet-day other-month">' + d + '</div>';
    }

    // Current month days
    var today = new Date();
    for (var d = 1; d <= daysInMonth; d++) {
      var isWorked = workedDays.indexOf(d) !== -1;
      var isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
      var classes = 'timesheet-day';
      if (isWorked) classes += ' worked';
      if (isToday) classes += ' today';
      html += '<div class="' + classes + '" data-day="' + d + '">' + d + '</div>';
    }

    // Next month padding to fill 6 rows
    var totalCells = startDay + daysInMonth;
    var remaining = 42 - totalCells;
    for (var d = 1; d <= remaining; d++) {
      html += '<div class="timesheet-day other-month">' + d + '</div>';
    }

    grid.innerHTML = html;

    // Click handlers
    grid.querySelectorAll('.timesheet-day:not(.other-month)').forEach(function(el) {
      el.addEventListener('click', function() {
        var day = Number(el.dataset.day);
        var key = getTimesheetMonthKey(timesheetCurrentYear, timesheetCurrentMonth);
        var days = profile.timesheet[key] || [];
        var idx = days.indexOf(day);
        if (idx === -1) {
          days.push(day);
        } else {
          days.splice(idx, 1);
        }
        days.sort(function(a, b) { return a - b; });
        profile.timesheet[key] = days;
        renderTimesheet(timesheetCurrentYear, timesheetCurrentMonth);
        updateBonusDisplay();
        saveProfile();
      });
    });

    updateBonusDisplay();
  }

  // ========== Profile ==========
  function renderProfile() {
    document.getElementById('profile-name').value = profile.name || '';
    document.getElementById('profile-salary').value = profile.salary || '';
    document.getElementById('profile-payday').value = profile.payday || '';
    document.getElementById('profile-hours').value = profile.workHours || '';
    document.getElementById('profile-days').value = profile.workDays || '';
    document.getElementById('profile-balance').value = profile.balance || '';
    document.getElementById('profile-custom-mpf').checked = !!profile.customMpf;
    document.getElementById('profile-emp-mpf').value = profile.empMpf || '';
    var customMpfField = document.getElementById('custom-mpf-field');
    var mpfHint = document.getElementById('mpf-hint');
    if (customMpfField) customMpfField.style.display = profile.customMpf ? '' : 'none';
    if (mpfHint) mpfHint.style.display = profile.customMpf ? 'none' : '';
    document.getElementById('profile-bonus').checked = !!profile.bonusEnabled;
    document.getElementById('profile-bonus-threshold').value = profile.bonusThreshold || 10;
    document.getElementById('profile-bonus-salary').value = profile.bonusSalary || '';
    var bonusFields = document.getElementById('bonus-fields');
    if (bonusFields) bonusFields.style.display = profile.bonusEnabled ? '' : 'none';
    updateBonusDisplay();
  }

  function renderTimesheetTab() {
    // Render timesheet
    timesheetCurrentYear = new Date().getFullYear();
    timesheetCurrentMonth = new Date().getMonth();
    renderTimesheet(timesheetCurrentYear, timesheetCurrentMonth);
    // Also render bonus settings
    document.getElementById('profile-bonus').checked = !!profile.bonusEnabled;
    document.getElementById('profile-bonus-threshold').value = profile.bonusThreshold || 10;
    document.getElementById('profile-bonus-salary').value = profile.bonusSalary || '';
    var bonusFields = document.getElementById('bonus-fields');
    if (bonusFields) bonusFields.style.display = profile.bonusEnabled ? '' : 'none';
    updateBonusDisplay();
  }

  function updateBonusDisplay() {
    var bonusEnabled = document.getElementById('profile-bonus').checked;
    var bonusThreshold = Number(document.getElementById('profile-bonus-threshold').value) || 10;
    var bonusSalary = Number(document.getElementById('profile-bonus-salary').value) || 0;
    var baseSalary = Number(document.getElementById('profile-salary').value) || 0;

    var bonusDisplay = document.getElementById('bonus-display');
    var daysWorkedEl = document.getElementById('bonus-days-worked');
    var baseSalaryEl = document.getElementById('bonus-base-salary');
    var bonusSalaryEl = document.getElementById('bonus-bonus-salary');
    var totalSalaryEl = document.getElementById('bonus-total-salary');
    var timesheetCountEl = document.getElementById('timesheet-count');
    var bonusHintEl = document.getElementById('timesheet-bonus-hint');

    var key = getTimesheetMonthKey(timesheetCurrentYear, timesheetCurrentMonth);
    var workedDays = (profile.timesheet[key] || []).length;

    if (timesheetCountEl) timesheetCountEl.textContent = workedDays;
    if (bonusHintEl) bonusHintEl.style.display = (bonusEnabled && workedDays > bonusThreshold) ? '' : 'none';
    if (bonusDisplay) bonusDisplay.style.display = bonusEnabled ? '' : 'none';

    if (bonusEnabled && daysWorkedEl) {
      daysWorkedEl.textContent = workedDays + ' days';
      if (baseSalaryEl) baseSalaryEl.textContent = fmt$(baseSalary);
      if (bonusSalaryEl) bonusSalaryEl.textContent = fmt$(bonusSalary);
      if (totalSalaryEl) totalSalaryEl.textContent = (workedDays > bonusThreshold && bonusSalary > 0) ? fmt$(bonusSalary) : fmt$(baseSalary);
    }
  }

  function initProfile() {
    var customMpfToggle = document.getElementById('profile-custom-mpf');
    var customMpfField = document.getElementById('custom-mpf-field');
    var mpfHint = document.getElementById('mpf-hint');
    if (customMpfToggle && customMpfField && mpfHint) {
      customMpfToggle.addEventListener('change', function() {
        customMpfField.style.display = customMpfToggle.checked ? '' : 'none';
        mpfHint.style.display = customMpfToggle.checked ? 'none' : '';
      });
    }

    document.getElementById('profile-save').addEventListener('click', function() {
      profile.name = document.getElementById('profile-name').value.trim();
      profile.salary = Number(document.getElementById('profile-salary').value) || 0;
      profile.payday = Number(document.getElementById('profile-payday').value) || 4;
      profile.workHours = Number(document.getElementById('profile-hours').value) || 9;
      profile.workDays = Number(document.getElementById('profile-days').value) || 5;
      profile.balance = Number(document.getElementById('profile-balance').value) || 0;
      profile.customMpf = document.getElementById('profile-custom-mpf').checked;
      profile.empMpf = Number(document.getElementById('profile-emp-mpf').value) || 0;
      profile.bonusEnabled = document.getElementById('profile-bonus').checked;
      profile.bonusThreshold = Number(document.getElementById('profile-bonus-threshold').value) || 10;
      profile.bonusSalary = Number(document.getElementById('profile-bonus-salary').value) || 0;
      saveProfile();
      showTab('dashboard');
    });
  }

  function initTimesheet() {
    var bonusToggle = document.getElementById('profile-bonus');
    var bonusFields = document.getElementById('bonus-fields');

    if (bonusToggle && bonusFields) {
      bonusToggle.addEventListener('change', function() {
        bonusFields.style.display = bonusToggle.checked ? '' : 'none';
        updateBonusDisplay();
      });
    }

    var bonusThresholdInput = document.getElementById('profile-bonus-threshold');
    var bonusSalaryInput = document.getElementById('profile-bonus-salary');
    if (bonusThresholdInput) bonusThresholdInput.addEventListener('input', updateBonusDisplay);
    if (bonusSalaryInput) bonusSalaryInput.addEventListener('input', updateBonusDisplay);

    var salaryInput = document.getElementById('profile-salary');
    if (salaryInput) salaryInput.addEventListener('input', updateBonusDisplay);

    // Timesheet navigation
    var prevBtn = document.getElementById('timesheet-prev');
    var nextBtn = document.getElementById('timesheet-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        timesheetCurrentMonth--;
        if (timesheetCurrentMonth < 0) {
          timesheetCurrentMonth = 11;
          timesheetCurrentYear--;
        }
        renderTimesheet(timesheetCurrentYear, timesheetCurrentMonth);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        timesheetCurrentMonth++;
        if (timesheetCurrentMonth > 11) {
          timesheetCurrentMonth = 0;
          timesheetCurrentYear++;
        }
        renderTimesheet(timesheetCurrentYear, timesheetCurrentMonth);
      });
    }
  }

  // ========== Settings ==========
  function renderSettings() {
    document.getElementById('settings-apikey').value = profile.aiApiKey || '';
  }

  function initSettings() {
    document.getElementById('settings-save').addEventListener('click', function() {
      profile.aiApiKey = document.getElementById('settings-apikey').value.trim();
      saveProfile();
      showToast('settings saved', 'wisewage', 'success');
    });

    document.getElementById('btn-export').addEventListener('click', function() {
      var blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wisewage-backup.json';
      a.click();
      showToast('data exported successfully', 'wisewage', 'success');
    });

    document.getElementById('btn-import').addEventListener('click', function() {
      document.getElementById('file-import').click();
    });

    document.getElementById('file-import').addEventListener('change', function() {
      if (!this.files[0]) return;
      var reader = new FileReader();
      var self = this;
      reader.onload = function(e) {
        try {
          var data = JSON.parse(e.target.result);
          if (data) {
            profile = data;
            saveProfile();
            showToast('data imported successfully', 'wisewage', 'success');
            showTab('dashboard');
          }
        } catch(err) {
          showToast('invalid import file', 'wisewage', 'error');
        }
        self.value = '';
      };
      reader.readAsText(this.files[0]);
    });

    document.getElementById('btn-reset').addEventListener('click', function() {
      if (!confirm('are you sure? this will delete all your data.')) return;
      localStorage.removeItem(LS_KEY);
      profile = { name: '', salary: 0, payday: 4, workHours: 9, workDays: 5, balance: 0, aiApiKey: '', expenses: {} };
      showTab('welcome');
      initWelcome();
    });
  }

  // ========== AI Chat ==========
  function initAI() {
    var toggle = document.getElementById('ai-toggle');
    var panel = document.getElementById('ai-panel');
    var closeBtn = document.getElementById('ai-close');
    var sendBtn = document.getElementById('ai-send');
    var input = document.getElementById('ai-input');
    var body = document.getElementById('ai-body');

    toggle.addEventListener('click', function() {
      panel.classList.toggle('open');
    });
    closeBtn.addEventListener('click', function() {
      panel.classList.remove('open');
    });

    function append(msg, cls) {
      var div = document.createElement('div');
      div.className = 'ai-msg ' + cls;
      div.textContent = msg;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    function getLocalTip() {
      var cycle = getCurrentCycle();
      var mpf = calcMPF(profile.salary, profile.customMpf, profile.empMpf);
      var totalDays = daysBetween(cycle.start, cycle.end);
      var daysPassed = daysBetween(cycle.start, new Date());
      var safeDaily = totalDays > 0 ? mpf.net / totalDays : 0;
      var expList = getCycleExpenses(cycle);
      var totalExp = expList.reduce(function(s, e) { return s + e.amount; }, 0);
      var committed = safeDaily * daysPassed;
      var remaining = Number(profile.balance) - totalExp - committed;
      if (remaining < 0) remaining = 0;
      var daysLeft = daysBetween(new Date(), cycle.end);
      if (daysLeft < 0) daysLeft = 0;

      var tips = [];
      if (safeDaily < 100) {
        tips.push('your safe daily budget is below hk$100. consider bringing a lunchbox or using octopus meal subsidies if available.');
      } else if (safeDaily > 300) {
        tips.push('your daily budget is comfortable. you can afford some small treats, but keep tracking!');
      }
      if (remaining < 500) {
        tips.push('your remaining balance is very low. avoid non-essential spending until payday.');
      } else if (remaining > 5000) {
        tips.push('you have a healthy buffer. consider saving the extra in a high-interest savings account.');
      }
      if (daysLeft <= 3) {
        tips.push('payday is almost here! hold on tight for a few more days.');
      } else if (daysLeft > 20) {
        tips.push('it is still early in the cycle. spread out your spending evenly.');
      }
      if (totalExp > mpf.net * 0.7) {
        tips.push('you have spent over 70% of your net salary. consider cutting back on dining out and entertainment.');
      }
      if (tips.length === 0) {
        tips.push('keep tracking your expenses. small savings add up over time!');
      }
      return tips.join(' ');
    }

    function send() {
      var q = input.value.trim();
      if (!q) return;
      append('you: ' + q, 'ai-msg-user');
      input.value = '';

      var hasProfile = profile.name && profile.name.trim();
      if (!hasProfile) {
        append('helper: please set up your profile first before using the chat!', 'ai-msg-ai');
        return;
      }

      var key = profile.aiApiKey;
      if (!key) {
        var greetingWords = ['hello','hi','hey','yo','sup','good morning','good afternoon','good evening','howdy','greetings'];
        var isGreeting = greetingWords.some(function(g) { return q.toLowerCase().indexOf(g) !== -1; });
        var budgetWords = ['budget','money','spend','spending','save','saving','salary','payday','mpf','expense','cost','afford','buy','lunch','dining','food','transport','shopping','cheap','expensive','price','amount','balance','remaining','daily','weekly','monthly','cost','hkd','dollar','finance','financial','income','wage','earnings'];
        var isBudgetRelated = budgetWords.some(function(g) { return q.toLowerCase().indexOf(g) !== -1; });
        var aiLabel = aiEnabled ? 'ai' : 'helper';
        if (isGreeting) {
          append(aiLabel + ': hey ' + profile.name + '! i am your budget assistant. i am currently in local mode — ask me anything about your money or spending!', 'ai-msg-ai');
        } else if (q.toLowerCase() === 'help' || q.toLowerCase().indexOf('help') !== -1) {
          append(aiLabel + ': here is what you can ask me:\n' +
            '1. how much can i spend today?\n' +
            '2. is my budget okay?\n' +
            '3. how much mpf do i pay?\n' +
            '4. when is my next payday?\n' +
            '5. can i afford [something]?\n' +
            '6. tips for saving money\n' +
            '7. how much have i spent this cycle?\n' +
            '8. is my hourly wage good?\n' +
            '9. should i buy [something]?\n' +
            '10. any budget warnings?\n' +
            'just type your question and i will give you tips based on your profile!', 'ai-msg-ai');
        } else if (isBudgetRelated) {
          append(aiLabel + ': (local mode) ' + getLocalTip(), 'ai-msg-ai');
        } else {
          append(aiLabel + ': can you explain further more? i am a budget assistant and i am best at answering questions about your money, spending, and savings. type "help" for a list of things you can ask.', 'ai-msg-ai');
        }
        return;
      }

      var cycle = getCurrentCycle();
      var mpf = calcMPF(profile.salary, profile.customMpf, profile.empMpf);
      var totalDays = daysBetween(cycle.start, cycle.end);
      var daysPassed = daysBetween(cycle.start, new Date());
      var safeDaily = totalDays > 0 ? mpf.net / totalDays : 0;
      var expList = getCycleExpenses(cycle);
      var totalExp = expList.reduce(function(s, e) { return s + e.amount; }, 0);
      var committed = safeDaily * daysPassed;
      var remaining = Number(profile.balance) - totalExp - committed;
      if (remaining < 0) remaining = 0;

      var prompt = 'You are a helpful budget assistant. The user is in Hong Kong.\n' +
        'Their monthly salary is HK$' + profile.salary + '.\n' +
        'After employee MPF (HK$' + mpf.employee + '), net salary is HK$' + mpf.net + '.\n' +
        'Current pay cycle: ' + fmtISO(cycle.start) + ' to ' + fmtISO(cycle.end) + ' (' + totalDays + ' days).\n' +
        'Safe daily budget: HK$' + Math.round(safeDaily) + '.\n' +
        'Current bank balance: HK$' + profile.balance + '.\n' +
        'Spent so far this cycle: HK$' + totalExp + '.\n' +
        'Estimated remaining: HK$' + Math.round(remaining) + '.\n' +
        'Answer briefly and practically.\n\nUser question: ' + q;

      fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var reply = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) || 'no response';
        append('ai: ' + reply, 'ai-msg-ai');
      })
      .catch(function(err) {
        aiConnected = false;
        updateAILabel();
        append('helper: (gemini unavailable — using local tips) ' + getLocalTip(), 'ai-msg-ai');
      });
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') send();
    });
  }

  // ========== Activity Bar ==========
  function initActivityBar() {
    document.querySelectorAll('.activity-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.tab;
        if (tab === 'back') {
          window.location.href = 'index.html';
          return;
        }
        showTab(tab);
      });
    });
    document.querySelectorAll('.top-bar-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var tab = item.dataset.tab;
        showTab(tab);
      });
    });

    var logoBtn = document.getElementById('logo-btn');
    if (logoBtn) {
      logoBtn.addEventListener('click', function() {
        if (currentTab === 'welcome') return;
        showTab('dashboard');
      });
    }

    var statusBackBtn = document.getElementById('status-back-btn');
    if (statusBackBtn) {
      statusBackBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (currentTab === 'welcome') return;
        showTab(prevTab);
      });
    }
  }

  // ========== Utils ==========
  function esc(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ========== Boot ==========
  function boot() {
    initActivityBar();
    initWelcome();
    initDashboard();
    initProfile();
    initTimesheet();
    initSettings();
    initAI();

    if (profile.name) {
      showTab('dashboard');
    } else {
      showTab('welcome');
    }
    // update welcome button visibility on boot
    var hasProfile = profile.name && profile.name.trim();
    document.querySelectorAll('.activity-btn[data-tab="back"]').forEach(function(b) {
      b.style.display = hasProfile ? 'none' : 'flex';
    });
    // disable settings buttons on welcome screen
    if (!hasProfile) {
      document.querySelectorAll('.activity-btn[data-tab="settings"]').forEach(function(b) {
        b.classList.add('disabled');
      });
      document.querySelectorAll('.top-bar-item[data-tab="settings"]').forEach(function(b) {
        b.classList.add('disabled');
      });
    }
    updateAIButton();
    checkAIConnection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
