/**
 * บันทึกการเยี่ยมลูกค้า (แท็บ "บันทึกเยี่ยม")
 *  - ในกลุ่ม พิมพ์: เยี่ยม <ลูกค้า> <รายละเอียด>   (หรือ เยี่ยมลูกค้า / บันทึกเยี่ยม)
 *  - แชร์ตำแหน่งภายใน 30 นาทีหลังบันทึก → แนบตำแหน่งให้รายการล่าสุดของคนนั้น
 *  - ดูเยี่ยม [ชื่อลูกค้า/เซลส์/F1–F5]   ไม่ได้เยี่ยม [F1–F5]
 */

const VISIT_SHEET = 'บันทึกเยี่ยม';
const VISIT_HEADERS = ['วันที่เวลา', 'เซลส์', 'userId', 'ลูกค้า', 'เขต', 'รายละเอียด', 'ละติจูด', 'ลองจิจูด', 'สถานที่', 'ประเภท', 'ส่งรายงาน'];
const VISIT_STOPWORDS = ['ด้วย', 'ต่อ', 'ให้', 'งาน', 'เรื่อง', 'มาก', 'มากๆ', 'มากเลย', 'เลย', 'จริง', 'จริงๆ', 'ครับ', 'ค่ะ', 'คะ', 'นะ', 'ไปเลย', 'สุด', 'สุดๆ', 'ที่สุด', 'มากมาก'];

/**
 * คำขึ้นต้นที่ใช้บันทึก (เรียงคำยาวก่อน) → ประเภท
 * strict = คำที่ใช้ในแชทปกติบ่อย (เช่น "ติดตาม", "เยี่ยม") ต้องตามด้วยชื่อลูกค้าที่รู้จัก หรือมีรายละเอียดต่อท้าย
 */
const VISIT_KEYWORDS = [
  { word: 'บันทึกเข้าพบ', type: 'เข้าพบ' }, { word: 'บันทึกติดตาม', type: 'ติดตาม' }, { word: 'บันทึกเยี่ยม', type: 'เข้าพบ' },
  { word: 'เข้าพบลูกค้า', type: 'เข้าพบ' }, { word: 'เข้าเยี่ยมลูกค้า', type: 'เข้าพบ' }, { word: 'ติดตามลูกค้า', type: 'ติดตาม' },
  { word: 'เยี่ยมลูกค้า', type: 'เข้าพบ' }, { word: 'พบลูกค้า', type: 'เข้าพบ' }, { word: 'เยี่ยมฟาร์ม', type: 'เข้าพบ' },
  { word: 'ลงพื้นที่', type: 'เข้าพบ' }, { word: 'เข้าเยี่ยม', type: 'เข้าพบ' }, { word: 'เข้าพบ', type: 'เข้าพบ' },
  { word: 'ติดตาม', type: 'ติดตาม', strict: true }, { word: 'เยี่ยม', type: 'เข้าพบ', strict: true },
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
  // ระบุเขตต่อจากคำขึ้นต้นได้: "เข้าพบ F3 ร้าน…" / "เข้าพบ เขต 3 ร้าน…"
  let zoneTyped = '';
  const zm = head.match(/^(?:f|fish|เขต)\s*([1-5])(?=\s|$)\s*/i);
  if (zm) { zoneTyped = 'F' + zm[1]; head = head.slice(zm[0].length).trim(); }
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
    return { customer: best, note: [rest, body].filter(Boolean).join('\n'), type: type, isNew: isNew, zone: zoneTyped };
  }
  // มีรายละเอียดบรรทัดถัดไป → ทั้งบรรทัดแรกคือชื่อลูกค้า
  if (body) return { customer: head, note: body, type: type, isNew: isNew, zone: zoneTyped };
  const parts = head.split(/\s+/);
  // คำทั่วไป: ลูกค้าที่ไม่รู้จักต้องมีรายละเอียดต่อท้าย (กันแชทปกติ เช่น "ติดตาม ด้วย")
  if (kw.strict && !filler && parts.length < 2) return null;
  return { customer: parts[0], note: parts.slice(1).join(' '), type: type, isNew: isNew, zone: zoneTyped };
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
  // จากไฟล์ยอด: ชื่อที่พิมพ์ "บุญสว่าง" = ลูกค้า "ร้านบุญสว่าง (2006)"
  try {
    const snap = getSalesSnapshot_();
    if (snap && snap.source === 'sheet') {
      const k = visitKey_(name);
      const zones = uniq_(snap.monthRows.filter(function (r) { return r.customer && visitKey_(r.customer) === k; })
        .map(function (r) { return r.team; }));
      if (zones.length === 1) return zones[0];
    }
  } catch (e) { /* ignore */ }
  return '';
}

/** คีย์จับคู่ชื่อลูกค้าที่พิมพ์ตอนเยี่ยม กับชื่อในไฟล์ยอด (ตัด ร้าน/บจก./(2006)/ฟาร์ม) */
function visitKey_(name) {
  return coreName_(name) || normName_(name);
}

/**
 * บันทึก 1 รายการ — เขตหาจาก: พิมพ์ระบุเอง > ลูกค้าในไฟล์ยอด/วันเกิด > เขตประจำของคนบันทึก (บอทจำไว้)
 * ยังไม่รู้เขต → บอทถามเขต (ปุ่ม F1–F5) และยังไม่ส่งเข้ารายงานจนกว่าจะได้เขต (หรือครบ 30 นาที)
 */
function logVisit_(sender, visit, now) {
  const zone = visit.zone || customerZone_(visit.customer) || userZone_(sender.userId);
  withLock_(function () {
    sheet_(VISIT_SHEET, VISIT_HEADERS).appendRow([now, sender.name, sender.userId, visit.customer, zone, visit.note, '', '', '',
      visit.type || 'เข้าพบ', zone ? 'ส่งแล้ว' : 'รอเขต']);
  });
  if (zone) forwardVisit_(sender, visit, zone, now);
  if (visit.zone && sender.userId) rememberUserZone_(sender.userId, visit.zone);
  return zone;
}

/** เขตประจำของแต่ละคน (จำจากครั้งที่บอกเขต) */
function userZone_(userId) {
  if (!userId) return '';
  try { return JSON.parse(prop_('USER_ZONES', '{}'))[userId] || ''; } catch (e) { return ''; }
}

function rememberUserZone_(userId, zone) {
  let map = {};
  try { map = JSON.parse(prop_('USER_ZONES', '{}')); } catch (e) { map = {}; }
  if (map[userId] === zone) return;
  map[userId] = zone;
  setProp_('USER_ZONES', JSON.stringify(map));
}

/**
 * "เขต F3" หลังบันทึก → ใส่เขตให้รายการล่าสุดที่ยังไม่มีเขต (ภายใน 30 นาที), ส่งเข้ารายงาน และจำเป็นเขตประจำ
 * คืนข้อความตอบ หรือ null ถ้าไม่มีรายการรอเขต (= แชทปกติ ไม่ตอบ)
 */
function setVisitZone_(sender, zone, now) {
  const hit = withLock_(function () {
    const sh = spreadsheet_().getSheetByName(VISIT_SHEET);
    if (!sh) return null;
    const values = sh.getDataRange().getValues();
    for (let i = values.length - 1; i >= 1; i--) {
      const v = values[i];
      if (cleanText_(v[2]) !== sender.userId) continue;
      const at = toDate_(v[0]);
      if (!at || now - at > 30 * 60000) return null;
      if (cleanText_(v[4])) return null;
      sh.getRange(i + 1, 5).setValue(zone);
      sh.getRange(i + 1, 11).setValue('ส่งแล้ว');
      return { at: at, customer: cleanText_(v[3]), note: String(v[5] || '').trim(), type: cleanText_(v[9]) || 'เข้าพบ' };
    }
    return null;
  });
  if (!hit) return null;
  forwardVisit_(sender, { customer: hit.customer, note: hit.note, type: hit.type }, zone, hit.at);
  rememberUserZone_(sender.userId, zone);
  return '✅ ใส่เขต ' + zone + ' ให้ "' + hit.customer + '" แล้วค่ะ\n' +
    'ครั้งต่อไป ลูกค้าใหม่ที่คุณบันทึก น้องขุนศึกจะใส่ ' + zone + ' ให้อัตโนมัติ\n' +
    '(ถ้าเป็นเขตอื่น พิมพ์ระบุได้ เช่น เข้าพบ F2 ร้าน…)';
}

/** รายการที่รอเขตเกิน 30 นาที → ส่งเข้ารายงานโดยไม่มีเขต (เรียกจาก tick) */
function flushPendingVisits_(now) {
  const sh = spreadsheet_().getSheetByName(VISIT_SHEET);
  if (!sh) return 0;
  const values = sh.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (cleanText_(v[10]) !== 'รอเขต') continue;
    const at = toDate_(v[0]);
    if (!at || now - at <= 30 * 60000) continue;
    sh.getRange(i + 1, 11).setValue('ส่งแล้ว');
    forwardVisit_({ name: cleanText_(v[1]), userId: cleanText_(v[2]) },
      { customer: cleanText_(v[3]), note: String(v[5] || '').trim(), type: cleanText_(v[9]) || 'เข้าพบ' }, '', at);
    n++;
  }
  return n;
}

/**
 * ส่งบันทึกเยี่ยมไปที่อีเมล VISIT_EMAIL (ถ้าตั้งไว้) — Power Automate รับอีเมลแล้วเพิ่มแถวในไฟล์ Excel บน OneDrive
 * เนื้อหาอีเมลเป็น JSON 1 บรรทัด: date, time, zone, customer, activity, detail, reporter
 */
function forwardVisit_(sender, visit, zone, now) {
  const to = prop_('VISIT_EMAIL', '');
  if (!to) return false;
  const rec = {
    date: pad2_(now.getDate()) + '/' + pad2_(now.getMonth() + 1) + '/' + now.getFullYear(),
    time: fmtTime_(now),
    zone: zone || '-',
    customer: visit.customer,
    activity: visit.type || 'เข้าพบ',
    detail: String(visit.note || '').replace(/\s*\n+\s*/g, ' / '),
    reporter: sender.name,
  };
  try {
    MailApp.sendEmail(to, 'NKS-VISIT ' + rec.zone + ' ' + rec.customer, JSON.stringify(rec));
    return true;
  } catch (e) {
    console.error('ส่งบันทึกเยี่ยมไปอีเมลไม่สำเร็จ: ' + (e && e.message || e));
    return false;
  }
}

/** คำอธิบายวิธีบันทึกเยี่ยม สำหรับทีม (คำสั่ง "วิธีบันทึก" / ห้องสั่งการ "ส่งวิธีบันทึก") */
const VISIT_HELP_TEXT = [
  '🤝 วิธีบันทึกการเข้าพบลูกค้า',
  'พิมพ์ในกลุ่มนี้ได้เลย น้องขุนศึกจะบันทึกลงรายงานรวมทุกเขตให้ค่ะ',
  '',
  '✍️ รูปแบบ',
  'คำขึ้นต้น + (เขต) + ชื่อลูกค้า + รายละเอียด',
  '',
  '🔑 คำขึ้นต้น (ต้องอยู่ต้นข้อความ)',
  '• เข้าพบ / พบลูกค้า / ลงพื้นที่',
  '• ติดตาม / ติดตามผล',
  '• ลูกค้าใหม่ ใส่ต่อท้ายได้ เช่น เข้าพบลูกค้าใหม่',
  '',
  '📝 ตัวอย่าง 1 (บรรทัดเดียว)',
  'เข้าพบ กบทองฟาร์ม สนใจสูตรใหม่ จะสั่งเดือนหน้า',
  '',
  '📝 ตัวอย่าง 2 (หลายบรรทัด)',
  'ติดตามลูกค้าใหม่ ร้านกุ้งทอง 1',
  'สนใจอาหารปลานิล 2 ตัน',
  'นัดชิมสินค้าอาทิตย์หน้า',
  '→ บรรทัดแรก = ชื่อลูกค้า · บรรทัดต่อไป = รายละเอียด',
  '',
  '📍 ต้องใส่เขตไหม?',
  '• ลูกค้าเดิม (มีในไฟล์ยอด) ไม่ต้องใส่ น้องขุนศึกรู้เขตเอง',
  '• ลูกค้าใหม่ ใส่เขตต่อจากคำขึ้นต้น เช่น เข้าพบ F3 ร้านกุ้งทอง …',
  '• ลืมใส่ไม่เป็นไร น้องขุนศึกจะถามเขต ให้กดปุ่ม F1–F5',
  '  ครั้งต่อไปจะจำเขตของคุณไว้ให้อัตโนมัติค่ะ',
  '',
  '✅ บันทึกสำเร็จ น้องขุนศึกจะตอบ "บันทึกการเข้าพบ…แล้วค่ะ"',
  '📌 แชร์ตำแหน่งต่อได้ภายใน 30 นาที',
  '',
  '⚠️ ไม่บันทึกถ้า',
  '• คำขึ้นต้นไม่อยู่ต้นข้อความ (เช่น "วันนี้ไปเข้าพบ…")',
  '• ลูกค้าใหม่แต่ไม่มีรายละเอียดต่อท้าย',
  '',
  '🔎 ดูบันทึก: ดูการเข้าพบ · ดูการเข้าพบ F3 · ยังไม่ได้เข้าพบ F3',
  '📂 ไฟล์รวมทุกเขต: พิมพ์ ดูรายงาน',
].join('\n');

/** ลิงก์ไฟล์รวมรายงานเยี่ยม (OneDrive) — ตั้งที่ Script Property REPORT_LINK */
function reportLinkText_() {
  const link = prop_('REPORT_LINK', '');
  if (!link) return 'ยังไม่ได้ตั้งลิงก์ไฟล์รายงานค่ะ (ผู้ดูแลใส่ REPORT_LINK ใน Script Properties)';
  return '📂 ไฟล์รวมบันทึกการเข้าพบลูกค้า\nแยกชีทรายเขต F1–F5 + รวมทุกเขต (อัปเดตอัตโนมัติ)\n\n' + link;
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
      note: cleanText_(v[5]), lat: v[6], lng: v[7], place: cleanText_(v[8]), type: (cleanText_(v[9]) || 'เข้าพบ').replace(/^เยี่ยม/, 'เข้าพบ') };
  }).filter(function (x) { return x.at && x.customer; });
}

function visitLine_(x) {
  const icon = x.type.indexOf('ติดตาม') === 0 ? '📞' : '🤝';
  return icon + ' ' + x.customer + (x.zone ? ' [' + x.zone + ']' : '') +
    '\n   ' + fmtDate_(x.at) + ' ' + fmtTime_(x.at) + ' · ' + x.type + ' · 👤 ' + x.sales +
    (x.note ? '\n   🗒️ ' + truncate_(x.note.replace(/\n+/g, ' '), 140) : '') +
    (x.lat !== '' && x.lat !== undefined ? '\n   📌 ' + (x.place ? truncate_(x.place, 60) : 'แชร์ตำแหน่งแล้ว') : '');
}

/** ดูเยี่ยม [คำค้น] — ไม่มีคำค้น = 7 วันล่าสุดสรุปรายคน; มีคำค้น = ลูกค้า/เซลส์/เขต ย้อน 90 วัน */
function formatVisits_(query, now) {
  const all = readVisits_();
  if (!all.length) return 'ยังไม่มีบันทึกการเข้าพบลูกค้าค่ะ\nพิมพ์ในกลุ่ม: เข้าพบ / ติดตาม <ลูกค้า> <รายละเอียด>\nดูวิธีละเอียด พิมพ์: วิธีบันทึก';
  const q = normName_(query || '');
  if (!q) {
    const since = addDays_(startOfDay_(now), -6);
    const recent = all.filter(function (x) { return x.at >= since; }).sort(function (a, b) { return b.at - a.at; });
    if (!recent.length) return '🤝 7 วันล่าสุดยังไม่มีบันทึกการเข้าพบลูกค้าค่ะ';
    const bySales = {};
    recent.forEach(function (x) { bySales[x.sales] = (bySales[x.sales] || 0) + 1; });
    const ranking = Object.keys(bySales).sort(function (a, b) { return bySales[b] - bySales[a]; })
      .map(function (s) { return '• ' + s + ' — ' + bySales[s] + ' ครั้ง'; });
    return '🤝 บันทึกการเข้าพบลูกค้า 7 วันล่าสุด (' + recent.length + ' ครั้ง)\n\n👤 รายคน\n' + ranking.join('\n') +
      '\n\n🗒️ ล่าสุด\n\n' + recent.slice(0, 15).map(visitLine_).join('\n\n') +
      (recent.length > 15 ? '\n\n…และอีก ' + (recent.length - 15) + ' ครั้ง' : '');
  }
  const since = addDays_(startOfDay_(now), -90);
  const zoneQ = /^(f|fish|เขต)\d$/.test(q) ? teamKey_(query).toUpperCase() : '';
  const hits = all.filter(function (x) {
    if (x.at < since) return false;
    if (zoneQ) return x.zone === zoneQ;
    if (normName_(x.customer).indexOf(q) >= 0 || normName_(x.sales).indexOf(q) >= 0) return true;
    // พิมพ์ชื่อเต็ม "ร้านบุญสว่าง (2006)" แต่บันทึกไว้ว่า "บุญสว่าง" (หรือกลับกัน)
    const a = visitKey_(x.customer);
    const b = visitKey_(query);
    return a.length >= 3 && b.length >= 3 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0);
  }).sort(function (a, b) { return b.at - a.at; });
  if (!hits.length) return '🤝 ไม่พบบันทึกการเข้าพบลูกค้าของ "' + query + '" ใน 90 วันค่ะ';
  return '🤝 บันทึกการเข้าพบลูกค้า "' + query + '" (' + hits.length + ' ครั้ง ใน 90 วัน)\n\n' +
    hits.slice(0, 20).map(visitLine_).join('\n\n') + (hits.length > 20 ? '\n\n…และอีก ' + (hits.length - 20) + ' ครั้ง' : '');
}

/** ไม่ได้เยี่ยม [เขต] — ลูกค้าที่มียอดเดือนนี้ แต่ไม่ได้เยี่ยม 30 วันขึ้นไป */
function formatNotVisited_(zoneArg, now) {
  const snap = getSalesSnapshot_();
  if (snap.source !== 'sheet') return NO_SHEET_SALES_TEXT;
  const zone = zoneArg ? teamKey_(zoneArg).toUpperCase() : '';
  if (zone && !snap.teams.some(function (t) { return t.name === zone; })) {
    return /^F\d+$/.test(zone) ? 'ไม่มีเขต ' + zone + ' ค่ะ — มีเขต ' + snap.teams.map(function (t) { return t.name; }).join(', ') + ' นะคะ'
      : 'พิมพ์ "ยังไม่ได้เข้าพบ" หรือ "ยังไม่ได้เข้าพบ F3" นะคะ';
  }
  const last = {};
  readVisits_().forEach(function (x) {
    const k = visitKey_(x.customer);
    if (!last[k] || x.at > last[k]) last[k] = x.at;
  });
  const cust = {};
  snap.monthRows.forEach(function (r) {
    if (!r.customer || (zone && r.team !== zone)) return;
    const c = cust[r.customer] || (cust[r.customer] = { name: r.customer, team: r.team, ton: 0 });
    c.ton += r.ton;
  });
  if (!Object.keys(cust).length) return 'ยังไม่มีข้อมูลยอดรายลูกค้า' + (zone ? 'ของ ' + zone : '') + 'ค่ะ (ต้องใช้ไฟล์รายลูกค้า)';
  const cutoff = addDays_(startOfDay_(now), -30);
  const list = Object.keys(cust).map(function (k) { return cust[k]; })
    .filter(function (c) { const lv = last[visitKey_(c.name)]; return c.ton > 1e-9 && (!lv || lv < cutoff); })
    .sort(function (a, b) { return b.ton - a.ton; });
  if (!list.length) return '✅ ลูกค้าที่มียอดเดือนนี้' + (zone ? 'ของ ' + zone : '') + ' ได้เข้าพบครบใน 30 วันแล้วค่ะ';
  const SHOW = 30;
  const cols = [{ label: '#', flex: 1, align: 'end' }, { label: 'ลูกค้า', flex: 8, wrap: true }];
  if (!zone) cols.push({ label: 'เขต', flex: 2 });
  cols.push({ label: 'ตัน', flex: 3, align: 'end' }, { label: 'เข้าพบล่าสุด', flex: 4, align: 'end' });
  const rows = list.slice(0, SHOW).map(function (c, i) {
    const lv = last[visitKey_(c.name)];
    const r = [String(i + 1), c.name];
    if (!zone) r.push(c.team || '-');
    r.push(fmtTon_(c.ton), lv ? fmtDate_(lv).replace(/^\S+ /, '') : { t: 'ยังไม่เคย', color: FX.red });
    return r;
  });
  const title = '🤝 ยังไม่ได้เข้าพบ 30 วัน' + (zone ? ' · ' + zone : '');
  return fxMessage_(title + ' (' + list.length + ' ราย)', fxBubble_({
    title: title,
    lines: [list.length + ' ราย · เรียงตามยอดเดือนนี้ (ถึง ' + fmtDate_(snap.detailAsOf || snap.asOf) + ')'],
    body: [fxTable_(cols, rows, { margin: 'none' })],
    footer: (list.length > SHOW ? '…และอีก ' + (list.length - SHOW) + ' ราย · ' : '') + 'บันทึก: พิมพ์ เข้าพบ <ลูกค้า> <รายละเอียด>',
  }));
}
