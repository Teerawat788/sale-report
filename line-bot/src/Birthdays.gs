/**
 * แจ้งเตือนวันเกิดลูกค้า (เฉพาะวันเกิด ไม่มียอดขาย)
 *
 * ข้อมูล: Google Sheet ที่ Script Property BIRTHDAY_SHEET_ID (แท็บ "วันเกิด" หรือแท็บแรก)
 * คอลัมน์: เขต | รหัสลูกค้า | ชื่อลูกค้า | ชื่อเจ้าของ | วัน | เดือน | ปีเกิด (พ.ศ.) | วันเกิด | เบอร์โทร
 * (ถ้าช่อง วัน/เดือน ว่าง จะอ่านจากช่อง "วันเกิด" เช่น 23/11/2510, 3/ส.ค/2505, 24/10)
 *
 * ทุกเช้าบอทส่งรายการวันเกิดตั้งแต่วันนี้ไปอีก BIRTHDAY_DAYS_AHEAD วัน (ค่าเริ่มต้น 7)
 */

const BIRTHDAY_SHEET = 'วันเกิด';
const BIRTHDAY_DAYS_AHEAD = 7;

const TH_MONTH_ALIASES = {
  'มค': 1, 'มกราคม': 1, 'กพ': 2, 'กุมภาพันธ์': 2, 'มีค': 3, 'มีนาคม': 3, 'เมย': 4, 'เมษายน': 4,
  'พค': 5, 'พฤษภาคม': 5, 'มิย': 6, 'มิถุนายน': 6, 'กค': 7, 'กรกฎาคม': 7, 'สค': 8, 'สิงหาคม': 8,
  'กย': 9, 'กันยายน': 9, 'ตค': 10, 'ตุลาคม': 10, 'พย': 11, 'พฤศจิกายน': 11, 'ธค': 12, 'ธันวาคม': 12,
};

function thaiMonth_(s) {
  const k = String(s || '').replace(/[.\s]/g, '');
  return TH_MONTH_ALIASES[k] || null;
}

/** วันเกิดเป็น { day, month } — ใช้แค่วัน/เดือน */
function parseBirthday_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v.getTime === 'function') return isNaN(v.getTime()) ? null : { day: v.getDate(), month: v.getMonth() + 1 };
  const s = String(v).replace(/ /g, ' ').trim();
  let m = s.match(/^(\d{1,2})\s*[\/\-. ]\s*([^\d\/\-]+?)\s*(?:[\/\-. ]\s*\d{2,4})?$/);
  if (m) {
    const mo = thaiMonth_(m[2]);
    if (mo) return validBirthday_(Number(m[1]), mo);
  }
  m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*\d{2,4})?$/);
  if (m) return validBirthday_(Number(m[1]), Number(m[2]));
  return null;
}

function validBirthday_(day, month) {
  if (month < 1 || month > 12 || day < 1) return null;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= max ? { day: day, month: month } : null;
}

/** อ่านรายชื่อ → รวมลูกค้าหลายรหัสที่เป็นเจ้าของคนเดียวกัน วันเกิดเดียวกัน */
function readBirthdays_() {
  const id = prop_('BIRTHDAY_SHEET_ID', '');
  const ss = id ? SpreadsheetApp.openById(id) : birthdaySpreadsheet_();
  if (!ss) return [];
  const sh = ss.getSheetByName(BIRTHDAY_SHEET) || (id && ss.getSheets ? ss.getSheets()[0] : null);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const h = values[0].map(function (x) { return cleanText_(x); });
  const col = function (names) {
    for (let i = 0; i < names.length; i++) {
      const idx = h.indexOf(names[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const c = {
    zone: col(['เขต', 'ทีม']), customer: col(['ชื่อลูกค้า', 'Name', 'ลูกค้า']),
    owner: col(['ชื่อเจ้าของ', 'ชื่อ นามสกุลเจ้าของ']), day: col(['วัน']), month: col(['เดือน']),
    raw: col(['วันเกิด']), tel: col(['เบอร์โทร', 'Tel']),
  };
  const groups = {};
  const order = [];
  values.slice(1).forEach(function (v) {
    const get = function (k) { return c[k] >= 0 ? v[c[k]] : ''; };
    let bd = null;
    const d = Number(get('day'));
    const mo = Number(get('month'));
    if (d && mo) bd = validBirthday_(d, mo);
    if (!bd) bd = parseBirthday_(get('raw'));
    const customer = cleanText_(get('customer'));
    const owner = cleanText_(get('owner'));
    if (!bd || !customer) return;
    if (/non ?active|หยุดซื้อ/i.test(owner)) return;
    const key = (owner || customer) + '|' + bd.day + '/' + bd.month;
    if (!groups[key]) {
      groups[key] = { owner: owner, customers: [], zones: [], day: bd.day, month: bd.month, tel: cleanText_(get('tel')) };
      order.push(key);
    }
    const g = groups[key];
    if (g.customers.indexOf(customer) < 0) g.customers.push(customer);
    const z = normZone_(get('zone'));
    if (z && g.zones.indexOf(z) < 0) g.zones.push(z);
  });
  return order.map(function (k) { return groups[k]; });
}

function birthdaySpreadsheet_() {
  try { return spreadsheet_(); } catch (e) { return null; }
}

/** วันเกิดรอบถัดไป (ปีนี้ ถ้าผ่านไปแล้วเป็นปีหน้า) — 29 ก.พ. ปีที่ไม่มี = 28 ก.พ. */
function nextBirthday_(b, today) {
  const make = function (y) {
    let d = new Date(y, b.month - 1, b.day);
    if (d.getMonth() !== b.month - 1) d = new Date(y, b.month - 1, 28);
    return d;
  };
  let d = make(today.getFullYear());
  if (d < today) d = make(today.getFullYear() + 1);
  return d;
}

/** "วันจันทร์ที่ 23/11/69" */
function fmtBirthdayDate_(d) {
  return 'วัน' + TH_DAYS[d.getDay()] + 'ที่ ' + pad2_(d.getDate()) + '/' + pad2_(d.getMonth() + 1) + '/' +
    String(d.getFullYear() + 543).slice(-2);
}

// ---------------------------------------------------------------- การ์ดวันเกิด (แบบเดียวกับรายงานยอด)

const BIRTHDAYS_PER_CARD = 20;

/** วันนี้ / พรุ่งนี้ / อีก n วัน / ผ่านมาแล้ว */
function birthdayWhen_(diff) {
  if (diff === 0) return { t: '🎉 วันนี้', color: FX.red, bold: true };
  if (diff === 1) return { t: 'พรุ่งนี้', color: FX.amber, bold: true };
  if (diff < 0) return { t: 'ผ่านมาแล้ว', color: FX.muted };
  return { t: 'อีก ' + diff + ' วัน', color: FX.sub };
}

/** 1 แถว: [วันเกิด + อีกกี่วัน] [ลูกค้า + เจ้าของ] [เขต] — วันนี้ไฮไลต์สีชมพู */
function birthdayRow_(e, today) {
  const diff = dayDiff_(e.date, today);
  const when = birthdayWhen_(diff);
  const left = fxBox_('vertical', [
    fxText_(fmtDate_(e.date), { size: 'sm', weight: 'bold', color: FX.text, wrap: true }),
    fxText_(when.t, { size: 'xs', color: when.color, weight: when.bold ? 'bold' : undefined }),
  ], { flex: 5 });
  const mid = [fxText_(e.customers.join(', '), { size: 'sm', weight: 'bold', color: FX.text, wrap: true })];
  if (e.owner && e.customers.indexOf(e.owner) < 0) mid.push(fxText_('👤 ' + e.owner, { size: 'xs', color: FX.sub, wrap: true }));
  const today0 = diff === 0;
  return fxBox_('horizontal', [
    left,
    fxBox_('vertical', mid, { flex: 10 }),
    fxText_(e.zones.join(', ') || '-', { size: 'xs', color: FX.sub, flex: 2, align: 'end' }),
  ], { spacing: 'md', margin: 'md', paddingAll: today0 ? 'sm' : undefined,
    backgroundColor: today0 ? '#FFF1F2' : undefined, cornerRadius: today0 ? 'md' : undefined });
}

/**
 * การ์ดวันเกิด เรียงตามวัน แยกหัวข้อตามเดือน (การ์ดละ 20 ราย)
 * คืน null ถ้าไม่มีรายการและไม่ได้ส่ง emptyText
 */
function formatBirthdays_(title, entries, today, emptyText, lines) {
  if (!entries.length) return emptyText === undefined ? null : title + '\n' + emptyText;
  entries.sort(function (a, b) { return a.date - b.date || a.customers[0].localeCompare(b.customers[0], 'th'); });
  const todays = entries.filter(function (e) { return dayDiff_(e.date, today) === 0; });
  const alt = title + ' (' + entries.length + ' ราย)' +
    (todays.length ? ' · วันนี้: ' + todays.map(function (e) { return e.owner || e.customers[0]; }).join(', ') : '');
  const cards = [];
  for (let i = 0; i < entries.length && cards.length < 5; i += BIRTHDAYS_PER_CARD) {
    const part = entries.slice(i, i + BIRTHDAYS_PER_CARD);
    const body = [fxBox_('horizontal', [
      fxText_('วันเกิด', { size: 'xxs', color: FX.muted, weight: 'bold', flex: 5 }),
      fxText_('ลูกค้า · เจ้าของ', { size: 'xxs', color: FX.muted, weight: 'bold', flex: 10 }),
      fxText_('เขต', { size: 'xxs', color: FX.muted, weight: 'bold', flex: 2, align: 'end' }),
    ], { spacing: 'md' })];
    let month = -1;
    part.forEach(function (e) {
      if (e.date.getMonth() !== month) {
        month = e.date.getMonth();
        body.push(fxText_('📅 เดือน ' + TH_MONTHS_SHORT[month] + ' ' + String(e.date.getFullYear() + 543).slice(-2),
          { size: 'sm', weight: 'bold', color: FX.text, margin: 'lg' }));
        body.push(fxSep_('sm'));
      } else {
        body.push(fxSep_('md'));
      }
      body.push(birthdayRow_(e, today));
    });
    const more = entries.length - (i + part.length);
    const isLast = i + BIRTHDAYS_PER_CARD >= entries.length || cards.length === 4;
    cards.push(fxMessage_(alt, fxBubble_({
      title: title + (i ? ' (ต่อ)' : ''),
      lines: i ? ['ลำดับ ' + (i + 1) + '–' + (i + part.length) + ' จาก ' + entries.length]
        : [entries.length + ' ราย' + (lines && lines.length ? ' · ' + lines.join(' · ') : '')],
      body: body,
      footer: isLast ? (more > 0 ? '…และอีก ' + more + ' ราย'
        : 'พิมพ์ "วันเกิด" ดู 30 วันข้างหน้า · "วันเกิด ' + TH_MONTHS_SHORT[(today.getMonth() + 1) % 12] + '" ดูทั้งเดือน') : undefined,
    })));
  }
  return cards.length === 1 ? cards[0] : cards;
}

function upcomingBirthdays_(list, today, days) {
  const end = addDays_(today, days);
  return list.map(function (b) { return Object.assign({ date: nextBirthday_(b, today) }, b); })
    .filter(function (e) { return e.date < end; });
}

/** ข้อความแจ้งเตือนตอนเช้า (null = ไม่มีใครเกิดในช่วงนี้) */
function buildBirthdayAlert_(now) {
  const today = startOfDay_(now);
  const days = Number(prop_('BIRTHDAY_DAYS_AHEAD', BIRTHDAY_DAYS_AHEAD));
  const list = upcomingBirthdays_(readBirthdays_(), today, days);
  return formatBirthdays_('🎂 วันเกิดลูกค้า ' + days + ' วันข้างหน้า', list, today, undefined,
    [fmtDate_(today) + ' – ' + fmtDate_(addDays_(today, days - 1))]);
}

/** "พ.ย.", "พฤศจิกายน", "11", "เดือนนี้", "เดือนหน้า" → 1..12 */
function parseMonthArg_(s, now) {
  const t = String(s || '').trim();
  if (!t || t === 'เดือนนี้') return now.getMonth() + 1;
  if (t === 'เดือนหน้า') return (now.getMonth() + 1) % 12 + 1;
  if (/^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= 12) return Number(t);
  return thaiMonth_(t.replace(/^เดือน/, ''));
}

/** คำสั่ง "วันเกิด" (30 วันข้างหน้า) / "วันเกิด ธ.ค." (ทั้งเดือน) */
function birthdayCommand_(arg, now) {
  const today = startOfDay_(now);
  const all = readBirthdays_();
  if (!all.length) return 'ยังไม่มีข้อมูลวันเกิดลูกค้าค่ะ';
  if (!arg) {
    return formatBirthdays_('🎂 วันเกิดลูกค้า 30 วันข้างหน้า', upcomingBirthdays_(all, today, 30), today, 'ไม่มีลูกค้าเกิดใน 30 วันนี้ค่ะ',
      [fmtDate_(today) + ' – ' + fmtDate_(addDays_(today, 29))]);
  }
  const month = parseMonthArg_(arg, now);
  if (!month) return null;
  // ทั้งเดือน (ปีนี้ ถ้าเดือนผ่านไปแล้วเป็นปีหน้า)
  const year = month - 1 < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear();
  const entries = all.filter(function (b) { return b.month === month; }).map(function (b) {
    let d = new Date(year, b.month - 1, b.day);
    if (d.getMonth() !== b.month - 1) d = new Date(year, b.month - 1, 28);
    return Object.assign({ date: d }, b);
  });
  return formatBirthdays_('🎂 วันเกิดลูกค้า เดือน ' + TH_MONTHS_SHORT[month - 1], entries, today, 'ไม่มีลูกค้าเกิดในเดือนนี้ค่ะ');
}
