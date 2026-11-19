/** งานติดตามประจำสัปดาห์ (เช็กลิสต์ที่วนทุกสัปดาห์) */

function weeklyFromRow_(r) {
  const v = r.v;
  const dowRaw = v[2];
  return {
    row: r.row,
    id: Number(v[0]),
    text: String(v[1]),
    dow: dowRaw === '' || dowRaw === null ? '' : Number(dowRaw),
    owner: String(v[3] || ''),
    ownerIds: splitIds_(v[4]),
    active: String(v[5]).toUpperCase() !== 'FALSE' && v[5] !== false,
    doneWeek: String(v[6] || ''),
    doneBy: String(v[7] || ''),
  };
}

function getWeekly_() {
  return rows_(sheet_(WEEKLY_SHEET, WEEKLY_HEADERS)).map(weeklyFromRow_)
    .filter(function (w) { return w.active; });
}

function addWeekly_(text, dow, owners) {
  return withLock_(function () {
    const sh = sheet_(WEEKLY_SHEET, WEEKLY_HEADERS);
    const id = nextId_(sh);
    sh.appendRow([
      id, text, dow,
      owners.map(function (o) { return o.name; }).join(', '),
      owners.map(function (o) { return o.userId; }).filter(Boolean).join(','),
      true, '', '', '',
    ]);
    return id;
  });
}

function checkWeekly_(ids, byName) {
  return withLock_(function () {
    const sh = sheet_(WEEKLY_SHEET, WEEKLY_HEADERS);
    const items = rows_(sh).map(weeklyFromRow_);
    const week = isoWeekKey_(now_());
    const done = [];
    const missing = [];
    ids.forEach(function (id) {
      const w = items.find(function (x) { return x.id === id && x.active; });
      if (!w) { missing.push(id); return; }
      sh.getRange(w.row, 7).setValue(week);
      sh.getRange(w.row, 8).setValue(byName);
      sh.getRange(w.row, 9).setValue(now_());
      done.push(w);
    });
    return { done: done, missing: missing };
  });
}

function deleteWeekly_(id) {
  return withLock_(function () {
    const sh = sheet_(WEEKLY_SHEET, WEEKLY_HEADERS);
    const w = rows_(sh).map(weeklyFromRow_).find(function (x) { return x.id === id; });
    if (!w) return null;
    sh.deleteRow(w.row);
    return w;
  });
}

function weeklyDueLabel_(dow) {
  return dow === '' ? 'ภายในสัปดาห์' : 'ภายใน ' + TH_DAYS_SHORT[dow];
}

function isWeeklyDone_(w, now) {
  return w.doneWeek === isoWeekKey_(now);
}

/** งานประจำที่ยังไม่ทำ และถึง/เลยวันกำหนดของสัปดาห์นี้แล้ว */
function weeklyDueNow_(items, now) {
  const dayIdx = (now.getDay() + 6) % 7; // จ=0..อา=6
  return items.filter(function (w) {
    if (isWeeklyDone_(w, now) || w.dow === '') return false;
    return (w.dow + 6) % 7 <= dayIdx;
  });
}

function formatWeeklyList_(items, now) {
  const start = startOfWeek_(now);
  const head = '🔁 งานประจำสัปดาห์ (' + fmtDate_(start) + ' – ' + fmtDate_(addDays_(start, 6)) + ')';
  if (!items.length) return head + '\nยังไม่มีรายการ — เพิ่มด้วย "ประจำ+ จันทร์ ส่งรายงาน @ชื่อ"';
  const sorted = items.slice().sort(function (a, b) {
    const ka = a.dow === '' ? 99 : (a.dow + 6) % 7;
    const kb = b.dow === '' ? 99 : (b.dow + 6) % 7;
    return ka - kb || a.id - b.id;
  });
  const doneCount = items.filter(function (w) { return isWeeklyDone_(w, now); }).length;
  const lines = sorted.map(function (w) {
    const mark = isWeeklyDone_(w, now) ? '✅' : '⬜';
    return mark + ' #' + w.id + ' ' + w.text + (w.owner ? ' — ' + w.owner : '') + ' (' + weeklyDueLabel_(w.dow) + ')';
  });
  return head + ' ทำแล้ว ' + doneCount + '/' + items.length + '\n' + lines.join('\n') +
    '\nติ๊กว่าทำแล้ว: "เช็ค <เลข>"';
}
