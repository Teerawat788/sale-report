/** วันที่/เวลา และตัวช่วยจัดรูปแบบ (ไม่เรียก Google service — ทดสอบได้) */

const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const TH_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function toDate_(v) {
  if (!v) return null;
  if (typeof v.getTime === 'function') return new Date(v.getTime());
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays_(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n,
    d.getHours(), d.getMinutes(), d.getSeconds());
}

/** วันจันทร์ 00:00 ของสัปดาห์ที่ d อยู่ */
function startOfWeek_(d) {
  const s = startOfDay_(d);
  const offset = (s.getDay() + 6) % 7;
  return addDays_(s, -offset);
}

function dayDiff_(a, b) {
  return Math.round((startOfDay_(a).getTime() - startOfDay_(b).getTime()) / 86400000);
}

/** รหัสสัปดาห์แบบ ISO เช่น 2026-W47 ใช้ติ๊กงานประจำรายสัปดาห์ */
function isoWeekKey_(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + (week < 10 ? '0' : '') + week;
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function fmtTime_(d) {
  return pad2_(d.getHours()) + ':' + pad2_(d.getMinutes());
}

/** "พฤ. 19 พ.ย." */
function fmtDate_(d) {
  return TH_DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + TH_MONTHS_SHORT[d.getMonth()];
}

/** "พฤหัสบดี 19 พ.ย. 2569" */
function fmtDateLong_(d) {
  return TH_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + TH_MONTHS_SHORT[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

function fmtNum_(n, digits) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  const dg = digits === undefined ? 2 : digits;
  const parts = Number(n).toFixed(dg).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/** ป้ายกำหนดส่งเทียบกับวันนี้ */
function dueLabel_(due, now) {
  if (!due) return 'ไม่มีกำหนด';
  const diff = dayDiff_(due, now);
  if (diff < 0) return '🔴 เลยกำหนด ' + (-diff) + ' วัน';
  if (diff === 0) return '🟠 วันนี้';
  if (diff === 1) return '🟡 พรุ่งนี้';
  return fmtDate_(due);
}

function truncate_(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
