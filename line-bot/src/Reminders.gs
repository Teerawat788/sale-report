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
const FRIDAY_MEETING_TEXT = '@All วันที่มีประชุม Perfomance ทีมขาย&วิชาการ มีใครนำเสนอ,อัพเดทอะไรบ้างคะ';
const SATURDAY_PLAN_TEXT = 'รบกวนทุกคนส่งแผนการทำงานในสัปดาห์หน้าด้วยนะคะ';
/** ข้อความเดิม (เสียงผู้ชาย) → ข้อความใหม่ — แก้ให้เองตอนรัน setupTriggers */
const REMINDER_TEXT_UPDATES = {
  '@All วันที่มีประชุม Perfomance ทีมขาย&วิชาการ มีใครนำเสนอ,อัพเดทอะไรบ้างครับ': FRIDAY_MEETING_TEXT,
  'รบกวนทุกคนส่งแผนการทำงานในสัปดาห์หน้าด้วยครับ': SATURDAY_PLAN_TEXT,
};
const REMINDER_DEFAULTS = [
  ['ส', '16:00', SATURDAY_PLAN_TEXT, 1, '', true, ''],
  ['ศ', '07:00', FRIDAY_MEETING_TEXT, 2, new Date(2026, 11, 4), true, ''],
];

function setupReminders() {
  const ss = spreadsheet_();
  if (!ss.getSheetByName(REMINDER_SHEET)) {
    const sh = sheet_(REMINDER_SHEET, REMINDER_HEADERS);
    REMINDER_DEFAULTS.forEach(function (r) { sh.appendRow(r); });
    return;
  }
  // แท็บที่สร้างไว้ก่อน: เติมข้อความวันศุกร์แทนข้อความตัวอย่าง และเปลี่ยนข้อความเดิมเป็นเสียงผู้หญิง
  const sh = ss.getSheetByName(REMINDER_SHEET);
  sh.getDataRange().getValues().forEach(function (v, i) {
    if (i === 0) return;
    const t = cleanText_(v[2]);
    if (t === REMINDER_PLACEHOLDER) sh.getRange(i + 1, 3).setValue(FRIDAY_MEETING_TEXT);
    else if (REMINDER_TEXT_UPDATES[t]) sh.getRange(i + 1, 3).setValue(REMINDER_TEXT_UPDATES[t]);
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

// ---------------------------------------------------------------- แผนงาน (กิจวัตร) จากห้องสั่งการ

const TH_DAY_SHORT_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function daysLabel_(days) {
  if (days.length === 7) return 'ทุกวัน';
  if (days.join(',') === '1,2,3,4,5,6') return 'จ-ส';
  if (days.join(',') === '1,2,3,4,5') return 'จ-ศ';
  return days.map(function (d) { return TH_DAY_SHORT_NAMES[d]; }).join(',');
}

/**
 * แปลงข้อความแผน 1 บรรทัด → แถวแจ้งเตือน
 * "ส 16:00 รบกวนส่งแผน..."  "จ-ส 07:45 ..."  "ศ 07:00 ทุก2สัปดาห์ เริ่ม 4/12 @All ..."
 */
function parsePlanLine_(line, now) {
  const tokens = cleanText_(line).replace(/^[-•*]\s*/, '').split(' ').filter(Boolean);
  if (tokens.length < 3) return null;
  let i = 0;
  let dayTok = tokens[i++].replace(/^วัน/, '');
  // "ทุก วัน" / "จันทร์ - เสาร์"
  if (tokens[i] === '-' && tokens[i + 1]) { dayTok += '-' + tokens[i + 1]; i += 2; }
  const days = parseReminderDays_(dayTok);
  if (!days.length || (dayTok !== 'ทุกวัน' && !parseDayName_(dayTok.split(/[-,]/)[0], true))) return null;
  const clock = parseClock_(tokens[i++]);
  if (!clock) return null;
  let every = 1;
  let start = '';
  for (;;) {
    const t = tokens[i] || '';
    let m = t.match(/^ทุก(\d+)สัปดาห์$/);
    if (m) { every = Number(m[1]); i++; continue; }
    if (t === 'ทุก' && /^\d+$/.test(tokens[i + 1] || '') && tokens[i + 2] === 'สัปดาห์') { every = Number(tokens[i + 1]); i += 3; continue; }
    if (t === 'เว้นสัปดาห์' || t === 'เว้นศุกร์' || t === 'สัปดาห์เว้นสัปดาห์') { every = 2; i++; continue; }
    m = t.match(/^เริ่ม(.+)$/);
    if (m) { start = parseDateToken_(m[1], now) || ''; i++; continue; }
    if (t === 'เริ่ม' && tokens[i + 1]) { start = parseDateToken_(tokens[i + 1], now) || ''; i += 2; continue; }
    break;
  }
  const text = tokens.slice(i).join(' ');
  if (!text) return null;
  return [daysLabel_(days), pad2_(clock.h) + ':' + pad2_(clock.m), text, every, start, true, ''];
}

/** แทนที่กิจวัตรทั้งหมดด้วยแผนใหม่ — คืน { rows, skipped } */
function replacePlan_(text, now) {
  const rows = [];
  const skipped = [];
  String(text || '').split(/\r?\n/).forEach(function (line) {
    if (!cleanText_(line)) return;
    const r = parsePlanLine_(line, now);
    if (r) rows.push(r); else skipped.push(cleanText_(line));
  });
  if (!rows.length) return { rows: rows, skipped: skipped };
  withLock_(function () {
    const sh = sheet_(REMINDER_SHEET, REMINDER_HEADERS);
    const out = [REMINDER_HEADERS].concat(rows);
    sh.clearContents();
    sh.getRange(1, 1, out.length, REMINDER_HEADERS.length).setValues(out);
  });
  return { rows: rows, skipped: skipped };
}

function clearPlan_() {
  withLock_(function () {
    const sh = sheet_(REMINDER_SHEET, REMINDER_HEADERS);
    sh.clearContents();
    sh.getRange(1, 1, 1, REMINDER_HEADERS.length).setValues([REMINDER_HEADERS]);
  });
}

function planRowLabel_(v) {
  const every = Number(v[3]) || 1;
  const start = v[4] ? toDate_(v[4]) : null;
  const on = !(String(v[5]).toUpperCase() === 'FALSE' || v[5] === false);
  const clock = parseClock_(v[1]);
  return (on ? '' : '⏸️ ') + cleanText_(v[0]) + ' ' + (clock ? pad2_(clock.h) + ':' + pad2_(clock.m) : cleanText_(v[1])) +
    (every > 1 ? ' (ทุก ' + every + ' สัปดาห์' + (start ? ' เริ่ม ' + fmtDate_(start) : '') + ')' : '') +
    '\n   ' + truncate_(cleanText_(v[2]), 120);
}

function formatPlan_() {
  const sh = spreadsheet_().getSheetByName(REMINDER_SHEET);
  const rows = sh ? sh.getDataRange().getValues().slice(1).filter(function (v) { return cleanText_(v[2]); }) : [];
  if (!rows.length) return '📋 ยังไม่มีแผนงาน (กิจวัตร) ค่ะ\n\n' + PLAN_HELP;
  return '📋 แผนงานที่บอทส่งเข้ากลุ่มหลักเป็นกิจวัตร (' + rows.length + ' รายการ)\n\n' +
    rows.map(function (v, i) { return (i + 1) + '. ' + planRowLabel_(v); }).join('\n\n') +
    '\n\nเปลี่ยน: ส่ง "แผน" ใหม่ทั้งชุด · ยกเลิกทั้งหมด: "ยกเลิกแผน"';
}

const PLAN_HELP = [
  'ตั้งแผนงาน: พิมพ์ "แผน" แล้วขึ้นบรรทัดละ 1 รายการ เช่น',
  'แผน',
  'ส 16:00 รบกวนทุกคนส่งแผนการทำงานในสัปดาห์หน้าด้วยนะคะ',
  'ศ 07:00 ทุก2สัปดาห์ เริ่ม 4/12 @All วันที่มีประชุม Perfomance...',
  'จ-ส 08:00 อย่าลืมส่งยอดเมื่อวานนะคะ',
  '',
  'วัน: จ อ พ พฤ ศ ส อา · จ-ส · จ,พ,ศ · ทุกวัน',
].join('\n');

/** ห้องสั่งการ: "แผน ..." / "แผน" / "ยกเลิกแผน" */
function handlePlanCommand_(raw, now) {
  const t = String(raw || '').trim();
  if (/^ยกเลิกแผน(งาน)?$/.test(t)) {
    clearPlan_();
    return '🗑️ ยกเลิกแผนงานทั้งหมดแล้วค่ะ บอทจะไม่ส่งแจ้งเตือนตามวันจนกว่าจะส่งแผนใหม่นะคะ';
  }
  const m = t.match(/^แผน(?:งาน)?\s*([\s\S]*)$/);
  if (!m) return null;
  if (!m[1].trim()) return formatPlan_();
  const r = replacePlan_(m[1], now);
  if (!r.rows.length) return '⚠️ อ่านแผนไม่ได้ค่ะ\n\n' + PLAN_HELP;
  let s = '✅ บันทึกแผนงานแล้วค่ะ (' + r.rows.length + ' รายการ) บอทจะส่งเข้ากลุ่มหลักตามเวลาทุกสัปดาห์\n\n' +
    r.rows.map(function (v, i) { return (i + 1) + '. ' + planRowLabel_(v); }).join('\n\n');
  if (r.skipped.length) s += '\n\n⚠️ บรรทัดที่อ่านไม่ได้ (ไม่ได้บันทึก):\n' + r.skipped.map(function (x) { return '• ' + x; }).join('\n');
  return s;
}
