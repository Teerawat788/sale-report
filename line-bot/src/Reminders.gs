/**
 * ข้อความแจ้งเตือนตามวัน/เวลา (แก้ได้ในแท็บ "แจ้งเตือน" ของชีทบอท)
 *
 * คอลัมน์: วัน | เวลา | ข้อความ | ทุกกี่สัปดาห์ | เริ่มวันที่ | ใช้งาน | ส่งล่าสุด
 *  - วัน: จ อ พ พฤ ศ ส อา, หลายวันคั่นด้วย , (เช่น จ,พ,ศ), ช่วง จ-ส, หรือ ทุกวัน
 *  - เวลา: 16:00
 *  - ทุกกี่สัปดาห์: 1 = ทุกสัปดาห์, 2 = เว้นสัปดาห์ (นับจาก "เริ่มวันที่")
 *  - ใช้งาน: TRUE / FALSE
 * บอทเช็กทุก 5 นาที จึงส่งช้ากว่าเวลาที่ตั้งได้ไม่เกิน ~5 นาที และส่งวันละครั้งต่อแถว
 */

const REMINDER_SHEET = 'แจ้งเตือน';
const REMINDER_HEADERS = ['วัน', 'เวลา', 'ข้อความ', 'ทุกกี่สัปดาห์', 'เริ่มวันที่', 'ใช้งาน', 'ส่งล่าสุด'];
const REMINDER_PLACEHOLDER = '(ใส่ข้อความที่ต้องการให้บอทส่ง)';
const FRIDAY_MEETING_TEXT = '@All วันที่มีประชุม Perfomance ทีมขาย&วิชาการ มีใครนำเสนอ,อัพเดทอะไรบ้างครับ';
const REMINDER_DEFAULTS = [
  ['ส', '16:00', 'รบกวนทุกคนส่งแผนการทำงานในสัปดาห์หน้าด้วยครับ', 1, '', true, ''],
  ['ศ', '07:00', FRIDAY_MEETING_TEXT, 2, new Date(2026, 11, 4), true, ''],
];

function setupReminders() {
  const ss = spreadsheet_();
  if (!ss.getSheetByName(REMINDER_SHEET)) {
    const sh = sheet_(REMINDER_SHEET, REMINDER_HEADERS);
    REMINDER_DEFAULTS.forEach(function (r) { sh.appendRow(r); });
    return;
  }
  // แท็บที่สร้างไว้ก่อน: เติมข้อความวันศุกร์แทนข้อความตัวอย่าง
  const sh = ss.getSheetByName(REMINDER_SHEET);
  sh.getDataRange().getValues().forEach(function (v, i) {
    if (i > 0 && cleanText_(v[2]) === REMINDER_PLACEHOLDER) sh.getRange(i + 1, 3).setValue(FRIDAY_MEETING_TEXT);
  });
}

/** "@All ..." → ข้อความที่แท็กทุกคนในกลุ่มจริง (LINE textV2) */
function reminderMessage_(text) {
  if (!/@all\b/i.test(text)) return text;
  return {
    type: 'textV2',
    text: text.replace(/@all\b/ig, '{everyone}'),
    substitution: { everyone: { type: 'mention', mentionee: { type: 'all' } } },
  };
}

/** "จ-ส", "จ,พ,ศ", "ทุกวัน", "ศุกร์" → [1,3,5] */
function parseReminderDays_(v) {
  const s = cleanText_(v).replace(/\s/g, '');
  if (!s || s === 'ทุกวัน' || /^daily$/i.test(s)) return [0, 1, 2, 3, 4, 5, 6];
  const out = [];
  s.split(/[,،、]/).forEach(function (part) {
    const range = part.split('-');
    if (range.length === 2) {
      const a = parseDayName_(range[0], true);
      const b = parseDayName_(range[1], true);
      if (a && b) {
        for (let d = a.dow; ; d = (d + 1) % 7) { out.push(d); if (d === b.dow) break; }
      }
      return;
    }
    const d = parseDayName_(part, true);
    if (d) out.push(d.dow);
  });
  return out;
}

function parseClock_(v) {
  if (v && typeof v.getTime === 'function') return { h: v.getHours(), m: v.getMinutes() };
  const t = parseTimeToken_(String(v || '').trim());
  return t ? { h: t.h, m: t.m } : null;
}

/** ส่งแจ้งเตือนที่ถึงเวลา (ภายใน 1 ชม. หลังเวลาที่ตั้ง และยังไม่ส่งวันนี้) */
function runReminders_(now) {
  const groupId = prop_('GROUP_ID', '');
  const sh = groupId ? spreadsheet_().getSheetByName(REMINDER_SHEET) : null;
  if (!sh) return 0;
  const today = startOfDay_(now);
  const todayKey = 'ส่งแล้ว ' + fmtDate_(today) + ' ' + (today.getFullYear() + 543);
  const values = sh.getDataRange().getValues();
  const due = [];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    const text = cleanText_(v[2]);
    if (!text || text === REMINDER_PLACEHOLDER) continue;
    if (String(v[5]).toUpperCase() === 'FALSE' || v[5] === false) continue;
    if (parseReminderDays_(v[0]).indexOf(now.getDay()) < 0) continue;
    const clock = parseClock_(v[1]);
    if (!clock) continue;
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), clock.h, clock.m);
    if (now < at || now - at > 3600000) continue;
    const every = Math.max(1, Number(v[3]) || 1);
    const start = v[4] ? parseSheetDate_(v[4], 'DMY') : null;
    if (start && today < startOfDay_(start)) continue;
    if (every > 1) {
      const base = startOfWeek_(start || today);
      const weeks = Math.round((startOfWeek_(today) - base) / (7 * 86400000));
      if (weeks % every !== 0) continue;
    }
    if (cleanText_(v[6]) === todayKey) continue;
    sh.getRange(i + 1, 7).setValue(todayKey);
    due.push(text);
  }
  if (due.length) {
    const res = linePush_(groupId, due.map(reminderMessage_));
    // ถ้า LINE ไม่รับแบบแท็กทุกคน ส่งเป็นข้อความธรรมดาแทน
    if (res && res.code >= 300 && due.some(function (t) { return /@all\b/i.test(t); })) linePush_(groupId, due);
  }
  return due.length;
}
