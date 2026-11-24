/**
 * งานตั้งเวลา
 *  - tick() ทุก 5 นาที: ข้อความเช้า (MORNING_TIME, วัน MORNING_DAYS) + แจ้งเตือนตามแท็บ "แจ้งเตือน"
 *  - importSalesHourly() ทุกชั่วโมง: ดึงไฟล์ยอดจากโฟลเดอร์ Drive
 * รัน setupTriggers() ครั้งเดียวหลังติดตั้ง/อัปเดต
 */

function setupTriggers() {
  const handlers = ['morningBrief', 'eventReminder', 'weeklyReview', 'importSalesHourly', 'tick'];
  setupSalesSheets();
  setupReminders();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('importSalesHourly').timeBased().everyHours(1).create();
  console.log('ตั้ง trigger แล้ว: ข้อความเช้า ' + prop_('MORNING_TIME', '07:30') + ' (จ.–ส.), แจ้งเตือนตามแท็บ "แจ้งเตือน", นำเข้าไฟล์ยอดทุกชั่วโมง');
}

function isWorkDay_(d) {
  return String(prop_('WORK_DAYS', CONFIG.WORK_DAYS)).split(',').map(Number).indexOf(d.getDay()) >= 0;
}

/** Trigger: ทุก 5 นาที */
function tick() {
  const now = now_();
  try { runMorning_(now); } catch (e) { console.error('ข้อความเช้า: ' + (e && e.message || e)); }
  try { runReminders_(now); } catch (e) { console.error('แจ้งเตือน: ' + (e && e.message || e)); }
}

/** ส่งข้อความเช้าวันละครั้ง เมื่อถึง MORNING_TIME (ค่าเริ่มต้น 07:30) ในวัน MORNING_DAYS (จ.–ส.) */
function runMorning_(now) {
  const days = String(prop_('MORNING_DAYS', '1,2,3,4,5,6')).split(',').map(Number);
  if (days.indexOf(now.getDay()) < 0) return false;
  const clock = parseClock_(prop_('MORNING_TIME', '07:30')) || { h: 7, m: 30 };
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), clock.h, clock.m);
  if (now < at || now - at > 3 * 3600000) return false;
  const key = fmtDate_(now) + ' ' + now.getFullYear();
  if (prop_('LAST_MORNING', '') === key) return false;
  setProp_('LAST_MORNING', key);
  return morningBrief();
}

/** ข้อความเช้า: ยอดขาย (รวม + F1–F5) + วันเกิดลูกค้า — ส่งเข้ากลุ่มหลักครั้งเดียว */
function morningBrief() {
  const messages = buildMorningMessages_(now_());
  if (!messages.length) return false;
  linePush_(prop_('GROUP_ID', ''), messages);
  return true;
}

function buildMorningMessages_(now) {
  const messages = [];
  if (flag_('BRIEF_ENABLED')) {
    importSalesQuietly_(false); // ใช้ไฟล์ล่าสุดในโฟลเดอร์ (ถ้ามี)
    try {
      const snap = getSalesSnapshot_();
      if (snap.source === 'none') throw new Error('ยังไม่มีไฟล์ยอด');
      const sales = salesMessages_(snap, null, { greeting: now });
      // แหล่งข้อมูลแบบข้อความ (dashboard.json เดิม) → ใส่คำทักทายนำหน้าเอง
      if (typeof sales[0] === 'string') sales[0] = '☀️ สวัสดีตอนเช้าค่ะ — ' + fmtDateLong_(now) + '\n\n' + sales[0];
      sales.forEach(function (m) { messages.push(m); });
      const ai = aiSalesComment_(snap);
      if (ai) messages.push(ai);
    } catch (e) {
      console.error('ยอดเช้า: ' + (e && e.message || e));
    }
  }
  if (flag_('BIRTHDAY_ENABLED')) {
    try {
      const bd = buildBirthdayAlert_(now);
      // LINE ส่งได้ครั้งละ 5 ข้อความ — การ์ดวันเกิดใช้ที่เหลือ
      if (bd) [].concat(bd).slice(0, Math.max(1, 5 - messages.length)).forEach(function (m) { messages.push(m); });
    } catch (e) {
      console.error('วันเกิด: ' + (e && e.message || e));
    }
  }
  return messages;
}

/** Trigger: ทุกศุกร์บ่าย */
function weeklyReview() {
  if (!flag_('REVIEW_ENABLED')) return;
  linePush_(prop_('GROUP_ID', ''), buildWeeklyReview_(now_()));
}

/** Trigger: ทุก 10 นาที — เตือนนัดที่จะเริ่มภายใน REMIND_BEFORE_MIN นาที (ครั้งเดียวต่อนัด) */
function eventReminder() {
  const groupId = prop_('GROUP_ID', '');
  if (!flag_('REMINDER_ENABLED') || !groupId) return;
  const now = now_();
  const before = Number(prop_('REMIND_BEFORE_MIN', CONFIG.REMIND_BEFORE_MIN));
  const events = getEvents_(now, new Date(now.getTime() + before * 60000))
    .filter(function (e) { return !e.allDay && e.start >= now; });
  if (!events.length) return;
  const cache = CacheService.getScriptCache();
  const fresh = events.filter(function (e) {
    const key = 'rem_' + Utilities.base64EncodeWebSafe(e.id + '|' + e.start.getTime()).slice(0, 200);
    if (cache.get(key)) return false;
    cache.put(key, '1', 21600);
    return true;
  });
  if (!fresh.length) return;
  const lines = ['⏰ ใกล้ถึงเวลานัด'];
  fresh.forEach(function (e) {
    const mins = Math.max(0, Math.round((e.start - now) / 60000));
    lines.push(formatEventLine_(e) + ' (อีก ' + mins + ' นาที)');
  });
  linePush_(groupId, lines.join('\n'));
}

function buildMorningBrief_(now) {
  const today = startOfDay_(now);
  const out = ['☀️ สวัสดีตอนเช้าทีมขาย — ' + fmtDateLong_(now)];

  const weekly = getWeekly_();
  if (now.getDay() === 1) {
    out.push('');
    out.push('🗓️ แผนสัปดาห์นี้');
    out.push(formatWeeklyList_(weekly, now));
    const weekEvents = getEvents_(today, addDays_(today, 7));
    out.push('');
    out.push(formatAgendaDays_('📅 นัดสัปดาห์นี้', weekEvents, today, 7));
  } else {
    out.push('');
    out.push(formatAgenda_('📅 นัดวันนี้', getEvents_(today, addDays_(today, 1))));
  }

  const open = openTasks_();
  const dueSoon = open.filter(function (t) { return t.due && dayDiff_(t.due, now) <= 1; });
  out.push('');
  out.push(dueSoon.length ? formatTaskList_('📋 งานถึงกำหนด/เลยกำหนด', dueSoon, now, 15)
    : '📋 ไม่มีงานถึงกำหนดวันนี้ (งานค้างทั้งหมด ' + open.length + ')');

  if (now.getDay() !== 1) {
    const pending = weeklyDueNow_(weekly, now);
    if (pending.length) {
      out.push('');
      out.push('🔁 งานประจำที่ถึงกำหนดแล้วแต่ยังไม่ติ๊ก');
      pending.forEach(function (w) {
        out.push('⬜ #' + w.id + ' ' + w.text + (w.owner ? ' — ' + w.owner : '') + ' (' + weeklyDueLabel_(w.dow) + ')');
      });
    }
  }

  out.push('');
  out.push(safeSalesShort_());
  return out.join('\n');
}

function buildWeeklyReview_(now) {
  const weekStart = startOfWeek_(now);
  const weekEnd = addDays_(weekStart, 7);
  const out = ['📈 สรุปประจำสัปดาห์ ' + fmtDate_(weekStart) + ' – ' + fmtDate_(addDays_(weekStart, 6))];

  const tasks = getTasks_();
  const closed = tasks.filter(function (t) {
    return t.status === STATUS_DONE && t.doneAt && t.doneAt >= weekStart && t.doneAt < weekEnd;
  });
  out.push('');
  out.push('✅ ปิดงานสัปดาห์นี้ ' + closed.length + ' งาน');
  closed.slice(0, 10).forEach(function (t) {
    out.push('• #' + t.id + ' ' + t.text + (t.doneBy ? ' — ' + t.doneBy : ''));
  });

  const open = tasks.filter(function (t) { return t.status !== STATUS_DONE; });
  out.push('');
  out.push(formatTaskList_('⏳ งานค้าง', open, now, 15));

  const weekly = getWeekly_();
  if (weekly.length) {
    const notDone = weekly.filter(function (w) { return !isWeeklyDone_(w, now); });
    out.push('');
    out.push('🔁 งานประจำ ทำแล้ว ' + (weekly.length - notDone.length) + '/' + weekly.length);
    notDone.forEach(function (w) {
      out.push('⬜ #' + w.id + ' ' + w.text + (w.owner ? ' — ' + w.owner : ''));
    });
  }

  const top = safeSalesTop_();
  if (top) { out.push(''); out.push(top); }

  const nextWeek = getEvents_(weekEnd, addDays_(weekEnd, 7));
  out.push('');
  out.push(formatAgendaDays_('📅 นัดสัปดาห์หน้า', nextWeek, weekEnd, 7));

  out.push('');
  out.push(safeSalesShort_());
  return out.join('\n');
}
