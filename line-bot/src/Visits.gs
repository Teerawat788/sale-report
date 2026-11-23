/**
 * บันทึกการเยี่ยมลูกค้า (แท็บ "บันทึกเยี่ยม")
 *  - ในกลุ่ม พิมพ์: เยี่ยม <ลูกค้า> <รายละเอียด>   (หรือ เยี่ยมลูกค้า / บันทึกเยี่ยม)
 *  - แชร์ตำแหน่งภายใน 30 นาทีหลังบันทึก → แนบตำแหน่งให้รายการล่าสุดของคนนั้น
 *  - ดูเยี่ยม [ชื่อลูกค้า/เซลส์/F1–F5]   ไม่ได้เยี่ยม [F1–F5]
 */

const VISIT_SHEET = 'บันทึกเยี่ยม';
const VISIT_HEADERS = ['วันที่เวลา', 'เซลส์', 'userId', 'ลูกค้า', 'เขต', 'รายละเอียด', 'ละติจูด', 'ลองจิจูด', 'สถานที่', 'ประเภท'];
const VISIT_STOPWORDS = ['ด้วย', 'ต่อ', 'ให้', 'งาน', 'เรื่อง', 'มาก', 'มากๆ', 'มากเลย', 'เลย', 'จริง', 'จริงๆ', 'ครับ', 'ค่ะ', 'คะ', 'นะ', 'ไปเลย', 'สุด', 'สุดๆ', 'ที่สุด', 'มากมาก'];

/**
 * คำขึ้นต้นที่ใช้บันทึก (เรียงคำยาวก่อน) → ประเภท
 * strict = คำที่ใช้ในแชทปกติบ่อย (เช่น "ติดตาม", "เยี่ยม") ต้องตามด้วยชื่อลูกค้าที่รู้จัก หรือมีรายละเอียดต่อท้าย
 */
const VISIT_KEYWORDS = [
  { word: 'บันทึกเข้าพบ', type: 'เข้าพบ' }, { word: 'บันทึกติดตาม', type: 'ติดตาม' }, { word: 'บันทึกเยี่ยม', type: 'เยี่ยม' },
  { word: 'เข้าพบลูกค้า', type: 'เข้าพบ' }, { word: 'เข้าเยี่ยมลูกค้า', type: 'เยี่ยม' }, { word: 'ติดตามลูกค้า', type: 'ติดตาม' },
  { word: 'เยี่ยมลูกค้า', type: 'เยี่ยม' }, { word: 'พบลูกค้า', type: 'เข้าพบ' }, { word: 'เยี่ยมฟาร์ม', type: 'เยี่ยม' },
  { word: 'ลงพื้นที่', type: 'เยี่ยม' }, { word: 'เข้าเยี่ยม', type: 'เยี่ยม' }, { word: 'เข้าพบ', type: 'เข้าพบ' },
  { word: 'ติดตาม', type: 'ติดตาม', strict: true }, { word: 'เยี่ยม', type: 'เยี่ยม', strict: true },
];

/** คำต่อท้ายคำขึ้นต้นที่อนุญาต เช่น "ติดตามลูกค้าใหม่", "เข้าพบลูกค้าเก่า", "ติดตามผล" */
const VISIT_FILLERS = ['ลูกค้าใหม่', 'ลูกค้าเก่า', 'ลูกค้ารายใหม่', 'ลูกค้า', 'ผล', 'งาน'];

/**
 * "เยี่ยม กบทองฟาร์ม สนใจสูตรใหม่" → { customer, note, type, isNew }
 * ข้อความหลายบรรทัด: บรรทัดแรก = คำขึ้นต้น + ชื่อลูกค้า, บรรทัดต่อไป = รายละเอียด
 * คืน null ถ้าเป็นแชทปกติ ("เยี่ยมมาก", "ติดตาม งานนี้ด้วย")
 */
function parseVisitText_(text) {
  const full = String(text || '').trim();
  const nl = full.indexOf('\n');
  const firstLine = (nl >= 0 ? full.slice(0, nl) : full).trim();
  const body = nl >= 0 ? full.slice(nl + 1).trim() : '';
  let kw = null;
  let head = '';
  let filler = '';
  for (let k = 0; k < VISIT_KEYWORDS.length && !kw; k++) {
    const w = VISIT_KEYWORDS[k].word;
    if (firstLine.indexOf(w) !== 0) continue;
    let after = firstLine.slice(w.length);
    const f = VISIT_FILLERS.find(function (x) { return after.indexOf(x) === 0; });
    if (f) { filler = f; after = after.slice(f.length); }
    if (after && !/^\s/.test(after)) continue;
    kw = VISIT_KEYWORDS[k];
    head = after.trim();
  }
  if (!kw) return null;
  const isNew = /ใหม่/.test(filler) || /ใหม่/.test(kw.word);
  const type = kw.type + (isNew ? ' (ลูกค้าใหม่)' : '');
  if (!head) return null;
  const firstTok = head.split(/\s+/)[0];
  if (VISIT_STOPWORDS.indexOf(firstTok) >= 0) return null;
  // หาชื่อลูกค้าที่รู้จักที่ยาวที่สุดที่ขึ้นต้นบรรทัดแรก
  const known = knownCustomerNames_();
  const nHead = normName_(head);
  let best = '';
  known.forEach(function (name) {
    const n = normName_(name);
    if (n && nHead.indexOf(n) === 0 && n.length > normName_(best).length) best = name;
  });
  if (best) {
    let count = normName_(best).length;
    let i = 0;
    while (i < head.length && count > 0) { if (!/\s/.test(head[i])) count--; i++; }
    const rest = head.slice(i).trim();
    return { customer: best, note: [rest, body].filter(Boolean).join('\n'), type: type, isNew: isNew };
  }
  // มีรายละเอียดบรรทัดถัดไป → ทั้งบรรทัดแรกคือชื่อลูกค้า
  if (body) return { customer: head, note: body, type: type, isNew: isNew };
  const parts = head.split(/\s+/);
  // คำทั่วไป: ลูกค้าที่ไม่รู้จักต้องมีรายละเอียดต่อท้าย (กันแชทปกติ เช่น "ติดตาม ด้วย")
  if (kw.strict && !filler && parts.length < 2) return null;
  return { customer: parts[0], note: parts.slice(1).join(' '), type: type, isNew: isNew };
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
    sheet_(VISIT_SHEET, VISIT_HEADERS).appendRow([now, sender.name, sender.userId, visit.customer, zone, visit.note, '', '', '', visit.type || 'เยี่ยม']);
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
      note: cleanText_(v[5]), lat: v[6], lng: v[7], place: cleanText_(v[8]), type: cleanText_(v[9]) || 'เยี่ยม' };
  }).filter(function (x) { return x.at && x.customer; });
}

function visitLine_(x) {
  return '• ' + fmtDate_(x.at) + ' ' + fmtTime_(x.at) + ' ' + x.type + ' ' + x.customer + (x.zone ? ' [' + x.zone + ']' : '') +
    '\n   👤 ' + x.sales + (x.note ? ' — ' + truncate_(x.note.replace(/\n+/g, ' '), 120) : '') +
    (x.lat !== '' && x.lat !== undefined ? '\n   📍 ' + (x.place ? truncate_(x.place, 60) : 'แชร์ตำแหน่งแล้ว') : '');
}

/** ดูเยี่ยม [คำค้น] — ไม่มีคำค้น = 7 วันล่าสุดสรุปรายคน; มีคำค้น = ลูกค้า/เซลส์/เขต ย้อน 90 วัน */
function formatVisits_(query, now) {
  const all = readVisits_();
  if (!all.length) return 'ยังไม่มีบันทึกการเยี่ยม/ติดตามลูกค้าค่ะ\nพิมพ์ในกลุ่ม: เยี่ยม / เข้าพบ / ติดตาม <ลูกค้า> <รายละเอียด>';
  const q = normName_(query || '');
  if (!q) {
    const since = addDays_(startOfDay_(now), -6);
    const recent = all.filter(function (x) { return x.at >= since; }).sort(function (a, b) { return b.at - a.at; });
    if (!recent.length) return '📍 7 วันล่าสุดยังไม่มีบันทึกเยี่ยมค่ะ';
    const bySales = {};
    recent.forEach(function (x) { bySales[x.sales] = (bySales[x.sales] || 0) + 1; });
    const ranking = Object.keys(bySales).sort(function (a, b) { return bySales[b] - bySales[a]; })
      .map(function (s) { return '• ' + s + ' ' + bySales[s] + ' ราย'; });
    return '📍 เยี่ยม/เข้าพบ/ติดตามลูกค้า 7 วันล่าสุด (' + recent.length + ' ครั้ง)\n\n👤 รายคน\n' + ranking.join('\n') +
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
      return (i + 1) + '. ' + c.name + '\n   ' + c.team + ' · ' + fmtNum_(c.ton) + ' ตัน' +
        (lv ? ' · เยี่ยมล่าสุด ' + fmtDate_(lv) : '');
    }).join('\n') + (list.length > 25 ? '\n\n…และอีก ' + (list.length - 25) + ' ราย' : '');
}
