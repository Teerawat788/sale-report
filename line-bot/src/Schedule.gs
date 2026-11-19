/**
 * งานตั้งเวลา: สรุปเช้า, เตือนก่อนนัด, สรุปประจำสัปดาห์
 * รัน setupTriggers() ครั้งเดียวหลังติดตั้ง (หรือทุกครั้งที่เปลี่ยนเวลา)
 */

function setupTriggers() {
  const handlers = ['morningBrief', 'eventReminder', 'weeklyReview'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  const hour = Number(prop_('MORNING_HOUR', CONFIG.MORNING_HOUR));
  ScriptApp.newTrigger('morningBrief').timeBased().everyDays(1).atHour(hour).nearMinute(0).create();
  ScriptApp.newTrigger('weeklyReview').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(CONFIG.REVIEW_HOUR).create();
  ScriptApp.newTrigger('eventReminder').timeBased().everyMinutes(10).create();
  console.log('ตั้ง trigger แล้ว: สรุปเช้า ' + hour + ':00, สรุปสัปดาห์ ศุกร์ ' + CONFIG.REVIEW_HOUR + ':00, เตือนนัดทุก 10 นาที');
}

function isWorkDay_(d) {
  return String(prop_('WORK_DAYS', CONFIG.WORK_DAYS)).split(',').map(Number).indexOf(d.getDay()) >= 0;
}

/** Trigger: ทุกเช้า (วันทำงาน) */
function morningBrief() {
  const now = now_();
  if (!flag_('BRIEF_ENABLED') || !isWorkDay_(now)) return;
  linePush_(prop_('GROUP_ID', ''), buildMorningBrief_(now));
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

  const nextWeek = getEvents_(weekEnd, addDays_(weekEnd, 7));
  out.push('');
  out.push(formatAgendaDays_('📅 นัดสัปดาห์หน้า', nextWeek, weekEnd, 7));

  out.push('');
  out.push(safeSalesShort_());
  return out.join('\n');
}
