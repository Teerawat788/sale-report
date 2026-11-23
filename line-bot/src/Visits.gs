/**
 * บันทึกการเยี่ยมลูกค้า (แท็บ "บันทึกเยี่ยม")
 *  - ในกลุ่ม พิมพ์: เยี่ยม <ลูกค้า> <รายละเอียด>   (หรือ เยี่ยมลูกค้า / บันทึกเยี่ยม)
 *  - แชร์ตำแหน่งภายใน 30 นาทีหลังบันทึก → แนบตำแหน่งให้รายการล่าสุดของคนนั้น
 *  - ดูเยี่ยม [ชื่อลูกค้า/เซลส์/F1–F5]   ไม่ได้เยี่ยม [F1–F5]
 */

const VISIT_SHEET = 'บันทึกเยี่ยม';
const VISIT_HEADERS = ['วันที่เวลา', 'เซลส์', 'userId', 'ลูกค้า', 'เขต', 'รายละเอียด', 'ละติจูด', 'ลองจิจูด', 'สถานที่'];
const VISIT_STOPWORDS = ['มาก', 'มากๆ', 'มากเลย', 'เลย', 'จริง', 'จริงๆ', 'ครับ', 'ค่ะ', 'คะ', 'นะ', 'ไปเลย', 'สุด', 'สุดๆ', 'ที่สุด', 'มากมาก'];

/** "เยี่ยม กบทองฟาร์ม สนใจสูตรใหม่" → { customer, note } หรือ null ถ้าเป็นคำชม ("เยี่ยมมาก") */
function parseVisitText_(text) {
  const m = String(text || '').trim().match(/^(?:เยี่ยมลูกค้า|บันทึกเยี่ยม|เยี่ยม)\s+([\s\S]+)$/);
  if (!m) return null;
  const rest = m[1].trim();
  const first = rest.split(/\s+/)[0];
  if (VISIT_STOPWORDS.indexOf(first) >= 0) return null;
  if (/^เยี่ยม\s/.test(text.trim()) && rest.split(/\s+/).length < 2) return null; // "เยี่ยม ครับ"
  // หาชื่อลูกค้าที่รู้จักที่ยาวที่สุดที่ขึ้นต้นข้อความ
  const known = knownCustomerNames_();
  const nRest = normName_(rest);
  let best = '';
  known.forEach(function (name) {
    const n = normName_(name);
    if (n && nRest.indexOf(n) === 0 && n.length > normName_(best).length) best = name;
  });
  if (best) {
    // ตัดชื่อออกจากข้อความโดยนับตัวอักษรที่ไม่ใช่ช่องว่าง
    let count = normName_(best).length;
    let i = 0;
    while (i < rest.length && count > 0) { if (!/\s/.test(rest[i])) count--; i++; }
    return { customer: best, note: rest.slice(i).trim() };
  }
  const parts = rest.split(/\s+/);
  return { customer: parts[0], note: parts.slice(1).join(' ') };
}

function knownCustomerNames_() {
  let names = [];
  try { names = names.concat(customerIndex_()); } catch (e) { /* ignore */ }
  try { readBirthdays_().forEach(function (b) { names = names.concat(b.customers); }); } catch (e) { /* ignore */ }
  return uniq_(names);
}

function customerZone_(name) {
  try {
    const b = readBirthdays_().find(function (x) { return x.customers.indexOf(name) >= 0; });
    if (b && b.zones.length) return b.zones[0];
  } catch (e) { /* ignore */ }
  return '';
}

function logVisit_(sender, visit, now) {
  const zone = customerZone_(visit.customer);
  withLock_(function () {
    sheet_(VISIT_SHEET, VISIT_HEADERS).appendRow([now, sender.name, sender.userId, visit.customer, zone, visit.note, '', '', '']);
  });
  return zone;
}

/** แชร์ตำแหน่ง → แนบกับรายการเยี่ยมล่าสุดของคนนั้น (ภายใน 30 นาที) */
function attachVisitLocation_(userId, loc, now) {
  if (!userId) return null;
  return withLock_(function () {
    const sh = spreadsheet_().getSheetByName(VISIT_SHEET);
    if (!sh) return null;
    const values = sh.getDataRange().getValues();
    for (let i = values.length - 1; i >= 1; i--) {
      const v = values[i];
      if (cleanText_(v[2]) !== userId) continue;
      const at = toDate_(v[0]);
      if (!at || now - at > 30 * 60000 || v[6] !== '') return null;
      sh.getRange(i + 1, 7).setValue(loc.latitude);
      sh.getRange(i + 1, 8).setValue(loc.longitude);
      sh.getRange(i + 1, 9).setValue(cleanText_(loc.address || loc.title || ''));
      return cleanText_(v[3]);
    }
    return null;
  });
}

function readVisits_() {
  const sh = spreadsheet_().getSheetByName(VISIT_SHEET);
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1).map(function (v) {
    return { at: toDate_(v[0]), sales: cleanText_(v[1]), customer: cleanText_(v[3]), zone: cleanText_(v[4]),
      note: cleanText_(v[5]), lat: v[6], lng: v[7], place: cleanText_(v[8]) };
  }).filter(function (x) { return x.at && x.customer; });
}

function visitLine_(x) {
  return '• ' + fmtDate_(x.at) + ' ' + fmtTime_(x.at) + ' ' + x.customer + (x.zone ? ' [' + x.zone + ']' : '') +
    '\n   👤 ' + x.sales + (x.note ? ' — ' + truncate_(x.note, 120) : '') +
    (x.lat !== '' && x.lat !== undefined ? '\n   📍 ' + (x.place ? truncate_(x.place, 60) : 'แชร์ตำแหน่งแล้ว') : '');
}

/** ดูเยี่ยม [คำค้น] — ไม่มีคำค้น = 7 วันล่าสุดสรุปรายคน; มีคำค้น = ลูกค้า/เซลส์/เขต ย้อน 90 วัน */
function formatVisits_(query, now) {
  const all = readVisits_();
  if (!all.length) return 'ยังไม่มีบันทึกการเยี่ยมลูกค้าค่ะ\nพิมพ์ในกลุ่ม: เยี่ยม <ลูกค้า> <รายละเอียด>';
  const q = normName_(query || '');
  if (!q) {
    const since = addDays_(startOfDay_(now), -6);
    const recent = all.filter(function (x) { return x.at >= since; }).sort(function (a, b) { return b.at - a.at; });
    if (!recent.length) return '📍 7 วันล่าสุดยังไม่มีบันทึกเยี่ยมค่ะ';
    const bySales = {};
    recent.forEach(function (x) { bySales[x.sales] = (bySales[x.sales] || 0) + 1; });
    const ranking = Object.keys(bySales).sort(function (a, b) { return bySales[b] - bySales[a]; })
      .map(function (s) { return '• ' + s + ' ' + bySales[s] + ' ราย'; });
    return '📍 เยี่ยมลูกค้า 7 วันล่าสุด (' + recent.length + ' ครั้ง)\n\n👤 รายคน\n' + ranking.join('\n') +
      '\n\n🗒️ ล่าสุด\n' + recent.slice(0, 15).map(visitLine_).join('\n') +
      (recent.length > 15 ? '\n…และอีก ' + (recent.length - 15) + ' ครั้ง' : '');
  }
  const since = addDays_(startOfDay_(now), -90);
  const zoneQ = /^(f|fish|เขต)\d$/.test(q) ? teamKey_(query).toUpperCase() : '';
  const hits = all.filter(function (x) {
    if (x.at < since) return false;
    if (zoneQ) return x.zone === zoneQ;
    return normName_(x.customer).indexOf(q) >= 0 || normName_(x.sales).indexOf(q) >= 0;
  }).sort(function (a, b) { return b.at - a.at; });
  if (!hits.length) return '📍 ไม่พบบันทึกเยี่ยมของ "' + query + '" ใน 90 วันค่ะ';
  return '📍 บันทึกเยี่ยม "' + query + '" (' + hits.length + ' ครั้ง ใน 90 วัน)\n\n' +
    hits.slice(0, 20).map(visitLine_).join('\n') + (hits.length > 20 ? '\n…' : '');
}

/** ไม่ได้เยี่ยม [เขต] — ลูกค้าที่มียอดเดือนนี้ แต่ไม่ได้เยี่ยม 30 วันขึ้นไป */
function formatNotVisited_(zoneArg, now) {
  const snap = getSalesSnapshot_();
  if (snap.source !== 'sheet') return NO_SHEET_SALES_TEXT;
  const zone = zoneArg ? teamKey_(zoneArg).toUpperCase() : '';
  const last = {};
  readVisits_().forEach(function (x) {
    const k = normName_(x.customer);
    if (!last[k] || x.at > last[k]) last[k] = x.at;
  });
  const cust = {};
  snap.monthRows.forEach(function (r) {
    if (!r.customer || (zone && r.team !== zone)) return;
    const c = cust[r.customer] || (cust[r.customer] = { name: r.customer, team: r.team, ton: 0 });
    c.ton += r.ton;
  });
  const cutoff = addDays_(startOfDay_(now), -30);
  const list = Object.keys(cust).map(function (k) { return cust[k]; })
    .filter(function (c) { const lv = last[normName_(c.name)]; return !lv || lv < cutoff; })
    .sort(function (a, b) { return b.ton - a.ton; });
  if (!Object.keys(cust).length) return 'ยังไม่มีข้อมูลยอดรายลูกค้า' + (zone ? 'ของ ' + zone : '') + 'ค่ะ (ต้องใช้ไฟล์รายลูกค้า)';
  if (!list.length) return '✅ ลูกค้าที่มียอดเดือนนี้' + (zone ? 'ของ ' + zone : '') + ' ได้เยี่ยมครบใน 30 วันแล้วค่ะ';
  return '📍 ลูกค้าที่ยังไม่ได้เยี่ยม 30 วันขึ้นไป' + (zone ? ' — ' + zone : '') + ' (' + list.length + ' ราย)\nเรียงตามยอดเดือนนี้\n\n' +
    list.slice(0, 25).map(function (c, i) {
      const lv = last[normName_(c.name)];
      return (i + 1) + '. ' + c.name + ' [' + c.team + '] ' + fmtNum_(c.ton) + ' ตัน\n   ' +
        (lv ? 'เยี่ยมล่าสุด ' + fmtDate_(lv) : 'ยังไม่มีบันทึก');
    }).join('\n') + (list.length > 25 ? '\n…และอีก ' + (list.length - 25) + ' ราย' : '');
}
