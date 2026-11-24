/**
 * ยอดขายรายวันจาก Power BI
 *
 * ทางเข้าข้อมูล: Power BI → Export data (.csv หรือ .xlsx) → วางไฟล์ในโฟลเดอร์ Google Drive
 * (Script Property IMPORT_FOLDER_ID) → importSalesHourly() ดึงไฟล์ล่าสุดเข้าแท็บ SalesData
 * หรือจะวาง/คัดลอกข้อมูลลงแท็บ SalesData เองก็ได้
 *
 * แท็บ Targets: เป้ารายเดือน (ตัน) รายทีม และ/หรือ รายเซลส์
 */

const SALES_SHEET = 'SalesData';
const SALES_HEADERS = ['วันที่', 'ทีม', 'เซลส์', 'ลูกค้า', 'สินค้า', 'ตัน', 'ยอดเงิน'];
const TARGET_SHEET = 'Targets';
const TARGET_HEADERS = ['เดือน (yyyy-mm)', 'ทีม/เขต', 'เซลส์ (ว่าง = เป้าทั้งเขต)', 'เป้า (ตัน)', 'เป้า (ล้านบาท)'];

/** ชื่อคอลัมน์ที่ยอมรับจากไฟล์ export (ไม่สนตัวพิมพ์/ช่องว่าง/วงเล็บ) */
const MTD_SHEET = 'SalesMTD';
const MTD_HEADERS = ['ข้อมูล ณ วันที่', 'เขต', 'เซลส์ (PIC_New)', 'รหัสลูกค้า', 'ลูกค้า', 'ตันสะสม (MTD)', 'บาทสะสม (MTD)',
  'เป้า (ตัน)', 'เป้า (บาท)', 'Challenge (ตัน)', 'Challenge (บาท)', 'ปีก่อน (ตัน)', 'ปีก่อน (บาท)'];

/** คอลัมน์ในไฟล์รายเขต → ชื่อฟิลด์ (ตามลำดับ MTD_HEADERS ช่อง 8–13) */
const EXTRA_FIELDS = ['budgetTon', 'budgetAmt', 'challengeTon', 'challengeAmt', 'lastTon', 'lastAmt'];

const COLUMN_ALIASES = {
  custid: ['soldtopartyid', 'customerid', 'customercode', 'custid', 'รหัสลูกค้า', 'soldtoid', 'soldtocode'],
  date: ['วันที่', 'date', 'วันที่ขาย', 'วันที่เอกสาร', 'invoicedate', 'billingdate', 'docdate', 'documentdate', 'postingdate', 'salesdate', 'day'],
  team: ['areanew', 'ทีม', 'team', 'salesteam', 'เขต', 'zone', 'region', 'area', 'ภาค', 'division', 'salesgroup', 'salesoffice'],
  sales: ['picnew', 'pic', 'personincharge', 'เซลส์', 'sales', 'salesname', 'salesman', 'salesperson', 'salesrep', 'rep', 'พนักงานขาย', 'ผู้แทนขาย', 'ชื่อเซลส์', 'ชื่อพนักงานขาย', 'employee'],
  customer: ['soldtoparty', 'ลูกค้า', 'customer', 'customername', 'ชื่อลูกค้า', 'soldto', 'soldtoname', 'ร้าน', 'ฟาร์ม', 'dealer', 'shipto', 'shiptoname'],
  product: ['สินค้า', 'product', 'productname', 'material', 'materialdescription', 'materialname', 'item', 'itemname', 'sku', 'ชื่อสินค้า', 'brand'],
  ton: ['actualvolumethisyyton', 'actualvolumeton', 'actualvolume', 'ตัน', 'ton', 'tons', 'tonnage', 'qtyton', 'quantityton', 'sumofton', 'ปริมาณตัน', 'ยอดตัน', 'volume', 'kg', 'กก', 'กิโลกรัม', 'qty', 'quantity', 'ปริมาณ'],
  amount: ['actualvaluethisyybaht', 'actualvaluethisyy', 'actualvalue', 'actualamount', 'salesvalue', 'ยอดเงิน', 'amount', 'salesamount', 'netamount', 'netsales', 'revenue', 'value', 'บาท', 'มูลค่า', 'ยอดขายบาท'],
};

function normHeader_(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase().replace(/[\s_\-().\/:\[\]]/g, '');
}

/** หาว่าคอลัมน์ไหนคืออะไร → { date: 0, ton: 5, ... } */
function mapColumns_(header) {
  const h = header.map(normHeader_);
  const map = {};
  const used = {};
  const keys = ['custid', 'date', 'ton', 'amount', 'customer', 'product', 'team', 'sales'];
  // รอบ 1: ตรงทั้งคำ (ตามลำดับความสำคัญของชื่อ เช่น PIC_New มาก่อน PIC)  รอบ 2: มีคำนั้นอยู่ในชื่อคอลัมน์
  keys.forEach(function (key) {
    const aliases = COLUMN_ALIASES[key].map(normHeader_);
    for (let a = 0; a < aliases.length; a++) {
      const idx = h.findIndex(function (x, i) { return !used[i] && x === aliases[a]; });
      if (idx >= 0) { map[key] = idx; used[idx] = true; return; }
    }
  });
  keys.forEach(function (key) {
    if (map[key] !== undefined || key === 'custid') return;
    const aliases = COLUMN_ALIASES[key].map(normHeader_);
    const idx = h.findIndex(function (x, i) {
      return !used[i] && x && aliases.some(function (a) { return a.length >= 3 && x.indexOf(a) >= 0; });
    });
    if (idx >= 0) { map[key] = idx; used[idx] = true; }
  });
  return map;
}

/**
 * ไฟล์รายเขตแบบ "Actual 26 (฿) | Budget 26 (฿) | Challenge 26 (฿) | Actual 25 (฿) | ... (Ton)"
 * → { ton, amount, budgetTon, budgetAmt, challengeTon, challengeAmt, lastTon, lastAmt } (index คอลัมน์)
 * ปีที่มากกว่า = ปีนี้, ปีที่น้อยกว่า = ปีก่อน
 */
function detectMetricColumns_(header) {
  const found = [];
  header.forEach(function (h, i) {
    const m = String(h || '').match(/^\s*(actual|budget|challenge)\s*(\d{2,4})?\s*\(\s*(ton|tons|ตัน|฿|baht|thb|บาท)\s*\)/i);
    if (m) found.push({ kind: m[1].toLowerCase(), year: Number(m[2] || 0), unit: /ton|ตัน/i.test(m[3]) ? 'ton' : 'amt', idx: i });
  });
  const actualYears = found.filter(function (f) { return f.kind === 'actual'; }).map(function (f) { return f.year; });
  if (!actualYears.length) return null;
  const cur = Math.max.apply(null, actualYears);
  const out = {};
  const pick = function (key, kind, unit, year) {
    const f = found.find(function (x) { return x.kind === kind && x.unit === unit && (year === undefined || x.year === year); });
    if (f) out[key] = f.idx;
  };
  pick('ton', 'actual', 'ton', cur);
  pick('amount', 'actual', 'amt', cur);
  pick('budgetTon', 'budget', 'ton');
  pick('budgetAmt', 'budget', 'amt');
  pick('challengeTon', 'challenge', 'ton');
  pick('challengeAmt', 'challenge', 'amt');
  const prevYears = actualYears.filter(function (y) { return y < cur; });
  if (prevYears.length) {
    const ly = Math.max.apply(null, prevYears);
    pick('lastTon', 'actual', 'ton', ly);
    pick('lastAmt', 'actual', 'amt', ly);
  }
  return out.ton !== undefined || out.amount !== undefined ? out : null;
}

function parseNumber_(v) {
  if (typeof v === 'number') return v;
  let s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[(),\s฿]/g, '').replace(/^-/, '');
  const n = Number(s);
  return isNaN(n) ? NaN : (neg ? -n : n);
}

/** เดาว่าวันที่ในไฟล์เป็น วัน/เดือน หรือ เดือน/วัน */
function detectDateOrder_(values) {
  let dmy = 0;
  let mdy = 0;
  values.forEach(function (v) {
    if (typeof v !== 'string') return;
    const m = v.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.]\d{2,4}/);
    if (!m) return;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  });
  if (mdy > dmy) return 'MDY';
  if (dmy > mdy) return 'DMY';
  return String(prop_('DATE_ORDER', 'DMY')).toUpperCase();
}

function parseSheetDate_(v, order) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v.getTime === 'function') return isNaN(v.getTime()) ? null : startOfDay_(v);
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // Excel serial
    return startOfDay_(new Date(1899, 11, 30 + Math.floor(v)));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  let y;
  let mo;
  let d;
  if (m) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); }
  else {
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) return null;
    y = Number(m[3]);
    if (order === 'MDY') { mo = Number(m[1]); d = Number(m[2]); } else { d = Number(m[1]); mo = Number(m[2]); }
  }
  if (y < 100) y += y >= 50 ? 2500 : 2000;
  if (y > 2400) y -= 543;
  const out = new Date(y, mo - 1, d);
  return out.getMonth() === mo - 1 && out.getDate() === d ? out : null;
}

function cleanText_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/[\s\u00a0]+/g, ' ').trim();
}

const OTHER_ZONE = 'อื่นๆ';

/** "TFM Fish3 East" / "Fish 3" / "f3" → "F3"; เขต TFM อื่น (Shrimp, Export ฯลฯ) → "อื่นๆ" (ไม่นำมาคิดยอด) */
function normZone_(v) {
  const s = cleanText_(v);
  const m = s.match(/(?:fish|^f|^เขต|^zone)\s*(\d+)/i);
  if (m) return 'F' + Number(m[1]);
  if (/^tfm\b/i.test(s)) return 'อื่นๆ';
  return s;
}

/** F1..F5 ก่อน แล้วค่อยเขตอื่น / อื่นๆ ท้ายสุด */
function zoneCompare_(a, b) {
  const rank = function (z) { return /^F\d+$/.test(z) ? 0 : z === 'อื่นๆ' ? 2 : 1; };
  return rank(a) - rank(b) || a.localeCompare(b, 'th', { numeric: true });
}

/** Power BI แสดงค่าว่างเป็น "#" */
function normPic_(v) {
  const s = cleanText_(v);
  return s === '#' || s === '(Blank)' || s === '(ว่าง)' ? '(ไม่ระบุ PIC)' : s;
}

function isTotalRow_(r) {
  const first = r.map(cleanText_).find(function (x) { return x; }) || '';
  return /^(total|grand ?total|รวม|รวมทั้งหมด|ผลรวม)$/i.test(first);
}

/**
 * ตาราง 2 มิติ (มีหัวตาราง) → { rows, columns, header, mode }
 * mode 'daily' = มีคอลัมน์วันที่ (ยอดรายวัน) / 'mtd' = ไม่มีวันที่ (ยอดสะสมทั้งเดือนรายลูกค้า)
 */
function rowsFromTable_(table) {
  let headerIdx = -1;
  let map = null;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const m = mapColumns_(table[i]);
    if (m.ton !== undefined && (m.date !== undefined || m.team !== undefined || m.sales !== undefined)) {
      headerIdx = i; map = m; break;
    }
  }
  if (headerIdx < 0) {
    const seen = (table[0] || []).filter(function (x) { return x !== ''; }).join(', ');
    throw new Error('ไม่พบคอลัมน์ยอด (ตัน) และเขต/เซลส์/วันที่ในไฟล์ (คอลัมน์ที่เจอ: ' + truncate_(seen, 200) + ')');
  }
  const mode = map.date !== undefined ? 'daily' : 'mtd';
  const header = table[headerIdx];
  const metrics = detectMetricColumns_(header);
  if (metrics) {
    if (metrics.ton !== undefined) map.ton = metrics.ton;
    if (metrics.amount !== undefined) map.amount = metrics.amount;
  }
  const tonHeader = normHeader_(header[map.ton]);
  const divisor = /kg|กก|กิโล/.test(tonHeader) ? 1000 : 1;
  const body = table.slice(headerIdx + 1);
  const order = mode === 'daily' ? detectDateOrder_(body.map(function (r) { return r[map.date]; })) : 'DMY';
  const col = function (r, k) { return map[k] !== undefined ? cleanText_(r[map[k]]) : ''; };
  const rows = [];
  body.forEach(function (r) {
    const ton = parseNumber_(r[map.ton]);
    if (isNaN(ton) || isTotalRow_(r)) return;
    const date = mode === 'daily' ? parseSheetDate_(r[map.date], order) : null;
    if (mode === 'daily' && !date) return;
    const row = {
      date: date,
      team: normZone_(col(r, 'team')),
      sales: normPic_(col(r, 'sales')),
      custId: col(r, 'custid'),
      customer: col(r, 'customer'),
      product: col(r, 'product'),
      ton: ton / divisor,
      amount: null,
    };
    if (mode === 'mtd' && !row.team && !row.sales && !row.customer) return; // แถวสรุป/หมายเหตุ
    if (row.team === OTHER_ZONE) return; // เอาเฉพาะ F1–F5
    if (/^(total|รวม)$/i.test(row.sales)) row.sales = ''; // ไฟล์รายเขต: PIC = Total
    const amount = map.amount !== undefined ? parseNumber_(r[map.amount]) : NaN;
    row.amount = isNaN(amount) ? null : amount;
    if (metrics) {
      EXTRA_FIELDS.forEach(function (f) {
        if (metrics[f] === undefined) return;
        const v = parseNumber_(r[metrics[f]]);
        if (!isNaN(v)) row[f] = v;
      });
    }
    rows.push(row);
  });
  return { rows: rows, columns: map, header: header, mode: mode, zoneLevel: !!metrics && map.customer === undefined };
}

/** วันที่ของข้อมูลจากชื่อไฟล์: "data_18.xlsx" → วันที่ 18, "sales 2026-11-18.csv" → 18/11/2026 */
/**
 * วันที่ของข้อมูล = วันที่ส่ง/อัปโหลดไฟล์ − FILE_DATE_LAG_DAYS (ค่าเริ่มต้น 1 = ยอดถึงเมื่อวาน)
 * ถ้าชื่อไฟล์มีวันที่เต็ม เช่น "sales 2026-11-22.xlsx" หรือ "ยอด 22-11-2569.xlsx" ใช้วันที่นั้น
 * เลขอื่นในชื่อไฟล์ เช่น "data (19).xlsx" เป็นเลขดาวน์โหลดซ้ำ — ไม่ใช้
 */
function asOfFromFileName_(name, ref) {
  const base = String(name).replace(/\.[^.]+$/, '');
  const lag = Math.max(0, Number(prop_('FILE_DATE_LAG_DAYS', '1')) || 0);
  let m = base.match(/(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(T\d)?/);
  if (m) {
    const d = parseSheetDate_(m[1] + '-' + m[2] + '-' + m[3], 'DMY');
    // "data - 2026-11-24T053547" = เวลาที่กด export (ยอดถึงเมื่อวาน) ไม่ใช่วันที่ของยอด
    if (d) return m[4] ? addDays_(d, -lag) : d;
  }
  m = base.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{4}|\d{2}(?!\d))/);
  if (m) { const d = parseSheetDate_(m[1] + '/' + m[2] + '/' + m[3], 'DMY'); if (d) return d; }
  return addDays_(startOfDay_(ref), -lag);
}

/**
 * รันจากหน้า Apps Script ครั้งเดียว เพื่อกดอนุญาตสิทธิ์ Google Drive
 * (บอทใช้ Drive เก็บไฟล์ยอดที่ส่งเข้ากลุ่ม) — สร้าง/ผูกโฟลเดอร์ให้ด้วย
 */
function authorizeDrive() {
  const folder = importFolder_();
  console.log('✅ ใช้ Google Drive ได้แล้ว — โฟลเดอร์: ' + folder.getName() + ' (' + folder.getId() + ')');
}

/** โฟลเดอร์เก็บไฟล์ยอด — ยังไม่ได้ตั้ง IMPORT_FOLDER_ID ก็สร้างให้เอง */
function importFolder_() {
  const id = prop_('IMPORT_FOLDER_ID', '');
  if (id) return DriveApp.getFolderById(id);
  const folder = DriveApp.createFolder('Sales Bot - ไฟล์ยอด');
  setProp_('IMPORT_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * เก็บยอดสะสม ณ วันที่ asOf — ทับเฉพาะไฟล์ชนิดเดียวกันของวันเดิม
 * (ไฟล์รายเขต กับ ไฟล์รายลูกค้า ของวันเดียวกันเก็บไว้ทั้งคู่)
 */
function replaceMtdSnapshot_(rows, asOf, zoneLevel) {
  withLock_(function () {
    const sh = sheet_(MTD_SHEET, MTD_HEADERS);
    const values = sh.getDataRange().getValues();
    const width = MTD_HEADERS.length;
    const today = startOfDay_(now_());
    const pad = function (r) { const x = r.slice(0, width); while (x.length < width) x.push(''); return x; };
    const keep = values.slice(1).filter(function (r) {
      if (r[0] === '' || r[0] === null) return false;
      const d = parseSheetDate_(r[0], 'DMY');
      const rowZoneLevel = !cleanText_(r[4]);
      if (d && d >= today && d > asOf) return false; // ยอดลงวันที่วันนี้/อนาคต (นำเข้าวันที่ผิดเมื่อก่อน) — ลบทิ้ง
      return !d || d.getTime() !== asOf.getTime() || rowZoneLevel !== !!zoneLevel;
    }).map(pad);
    const out = [MTD_HEADERS].concat(keep, rows.map(function (r) {
      return [asOf, r.team, r.sales, r.custId, r.customer, r.ton, r.amount === null ? '' : r.amount]
        .concat(EXTRA_FIELDS.map(function (f) { return r[f] === undefined ? '' : r[f]; }));
    }));
    sh.clearContents();
    sh.getRange(1, 1, out.length, MTD_HEADERS.length).setValues(out);
  });
}

/** เขียนแถวใหม่ทับช่วงวันที่เดียวกันในแท็บ SalesData (นำเข้าซ้ำได้ไม่ซ้ำซ้อน) */
function replaceSalesRows_(rows) {
  if (!rows.length) return { count: 0 };
  let from = rows[0].date;
  let to = rows[0].date;
  rows.forEach(function (r) { if (r.date < from) from = r.date; if (r.date > to) to = r.date; });
  withLock_(function () {
    const sh = sheet_(SALES_SHEET, SALES_HEADERS);
    const values = sh.getDataRange().getValues();
    const keep = values.slice(1).filter(function (r) {
      if (r[0] === '' || r[0] === null) return false;
      const d = parseSheetDate_(r[0], 'DMY');
      return !d || d < from || d > to;
    });
    const out = [SALES_HEADERS].concat(keep, rows.map(function (r) {
      return [r.date, r.team, r.sales, r.customer, r.product, r.ton, r.amount === null ? '' : r.amount];
    }));
    sh.clearContents();
    sh.getRange(1, 1, out.length, SALES_HEADERS.length).setValues(out);
  });
  return { count: rows.length, from: from, to: to };
}

function importTable_(table, opts) {
  const parsed = rowsFromTable_(table);
  if (!parsed.rows.length) throw new Error('ไฟล์ไม่มีแถวยอดขายที่อ่านได้');
  let r;
  if (parsed.mode === 'mtd') {
    const asOf = (opts && opts.asOf) || addDays_(startOfDay_(now_()), -1);
    replaceMtdSnapshot_(parsed.rows, asOf, parsed.zoneLevel);
    r = { mode: 'mtd', count: parsed.rows.length, from: asOf, to: asOf,
      total: parsed.rows.reduce(function (a, x) { return a + x.ton; }, 0) };
  } else {
    r = replaceSalesRows_(parsed.rows);
    r.mode = 'daily';
  }
  const need = parsed.zoneLevel ? ['team'] : parsed.mode === 'mtd' ? ['team', 'sales', 'customer'] : ['team', 'sales', 'customer', 'product'];
  r.zoneLevel = parsed.zoneLevel;
  r.missing = need.filter(function (k) { return parsed.columns[k] === undefined; });
  r.hasAmount = parsed.columns.amount !== undefined;
  clearCustomerIndex_();
  return r;
}

const MISSING_LABEL = { team: 'ทีม', sales: 'เซลส์', customer: 'ลูกค้า', product: 'สินค้า' };

function formatImportResult_(r, fileName) {
  const missing = r.missing && r.missing.length
    ? '\n⚠️ ไฟล์ไม่มีคอลัมน์: ' + r.missing.map(function (k) { return MISSING_LABEL[k]; }).join(', ') : '';
  if (r.mode === 'mtd') {
    const d = r.from;
    return '✅ นำเข้าไฟล์ยอดแล้วค่ะ' +
      (fileName ? '\n📄 ' + fileName : '') +
      '\n📋 ' + (r.zoneLevel ? 'ไฟล์รายเขต' : 'ไฟล์รายลูกค้า') + ' · ' + fmtNum_(r.count, 0) + ' แถว · ' + fmtTon_(r.total) + ' ตัน' +
      '\n📆 ยอดสะสมถึง ' + fmtDateShortYear_(d) +
      '\n→ ' + (r.zoneLevel ? 'ใช้เป็นยอดรวม + เป้าของแต่ละเขต' : 'ใช้ดูยอดลูกค้าและเซลส์ (ยอดรวมใช้ไฟล์รายเขต)') +
      missing +
      '\n\nวันที่ไม่ถูก? พิมพ์: อัปเดตยอด ' + d.getDate() + '/' + (d.getMonth() + 1);
  }
  return '✅ นำเข้ายอดขายแล้วค่ะ' + (fileName ? '\n📄 ' + fileName : '') +
    '\n📋 ' + fmtNum_(r.count, 0) + ' แถว · ' + fmtDate_(r.from) + (r.to - r.from ? ' – ' + fmtDate_(r.to) : '') + missing;
}

/** อ่านไฟล์ใน Drive เป็นตาราง 2 มิติ: CSV, Google Sheet, Excel */
function readDriveTable_(file) {
  const mime = file.getMimeType();
  const name = file.getName();
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    return SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues();
  }
  if (/\.csv$/i.test(name) || /csv|text\/plain/.test(mime)) {
    const text = file.getBlob().getDataAsString('UTF-8').replace(/^﻿/, '');
    return Utilities.parseCsv(text);
  }
  if (/\.xlsx?$/i.test(name) || /spreadsheetml|ms-excel/.test(mime)) {
    // แปลง Excel เป็น Google Sheet ชั่วคราว แล้วลบทิ้ง
    const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + file.getId() + '/copy', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ name: '_import_tmp_' + name, mimeType: 'application/vnd.google-apps.spreadsheet' }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) throw new Error('แปลงไฟล์ Excel ไม่ได้: ' + res.getContentText());
    const tmpId = JSON.parse(res.getContentText()).id;
    try {
      return SpreadsheetApp.openById(tmpId).getSheets()[0].getDataRange().getValues();
    } finally {
      DriveApp.getFileById(tmpId).setTrashed(true);
    }
  }
  throw new Error('ไม่รองรับไฟล์ ' + name + ' (ใช้ .csv หรือ .xlsx)');
}

/** นำเข้าไฟล์ล่าสุดในโฟลเดอร์ IMPORT_FOLDER_ID (ข้ามถ้าไฟล์เดิมเคยนำเข้าแล้ว เว้นแต่ force) */
function importSalesFromDrive_(force, asOfOverride) {
  const folderId = prop_('IMPORT_FOLDER_ID', '');
  if (!folderId) return { skipped: true, message: 'ยังไม่ได้ตั้ง IMPORT_FOLDER_ID (โฟลเดอร์ Google Drive ที่วางไฟล์จาก Power BI)' };
  const it = DriveApp.getFolderById(folderId).getFiles();
  let latest = null;
  while (it.hasNext()) {
    const f = it.next();
    if (/^_import_tmp_/.test(f.getName())) continue;
    if (!latest || f.getLastUpdated() > latest.getLastUpdated()) latest = f;
  }
  if (!latest) return { skipped: true, message: 'ยังไม่มีไฟล์ในโฟลเดอร์นำเข้าค่ะ' };
  const key = latest.getId() + '@' + latest.getLastUpdated().getTime();
  if (!force && prop_('LAST_IMPORT_KEY', '') === key) {
    return { skipped: true, message: 'ไฟล์ล่าสุด (' + latest.getName() + ') นำเข้าไปแล้วค่ะ' };
  }
  return importDriveFile_(latest, asOfOverride);
}

function importDriveFile_(file, asOfOverride) {
  const asOf = asOfOverride || asOfFromFileName_(file.getName(), file.getLastUpdated());
  const r = importTable_(readDriveTable_(file), { asOf: asOf });
  setProp_('LAST_IMPORT_KEY', file.getId() + '@' + file.getLastUpdated().getTime());
  r.fileName = file.getName();
  r.message = formatImportResult_(r, file.getName());
  return r;
}

/**
 * ไฟล์ Excel/CSV ที่ส่งเข้ากลุ่ม LINE → เก็บลงโฟลเดอร์นำเข้า แล้วนำเข้าทันที
 * คืน null ถ้าไม่ใช่ไฟล์ยอดขาย (ลบไฟล์ทิ้ง บอทไม่ตอบ)
 */
function importLineFile_(messageId, fileName) {
  const blob = lineContent_(messageId).setName(fileName);
  const file = importFolder_().createFile(blob);
  try {
    return importDriveFile_(file);
  } catch (e) {
    if (/ไม่พบคอลัมน์|ไม่มีแถวยอดขาย/.test(String(e && e.message))) {
      file.setTrashed(true);
      return null;
    }
    throw e;
  }
}

/** Trigger: ทุกชั่วโมง — มีไฟล์ใหม่ก็นำเข้า */
function importSalesHourly() {
  importSalesQuietly_(true);
}

/** report: true = มีไฟล์ใหม่แล้วส่งรายงานเข้ากลุ่ม (สรุปเช้าใช้ false เพราะมียอดอยู่แล้ว) */
function importSalesQuietly_(report) {
  try {
    const r = importSalesFromDrive_(false);
    if (!r.skipped) {
      console.log(r.message);
      if (report) autoReportSales_();
    }
  } catch (e) {
    console.error('นำเข้ายอดไม่สำเร็จ: ' + (e && e.message || e));
  }
}

/** มีไฟล์ยอดใหม่เข้ามา → ส่งรายงาน (+ บทวิเคราะห์ AI ถ้ามีคีย์) เข้ากลุ่มเอง */
function autoReportSales_() {
  const groupId = prop_('GROUP_ID', '');
  if (!groupId || !flag_('AUTO_REPORT', false)) return;
  const snap = getSalesSnapshot_();
  if (snap.source !== 'sheet') return;
  const messages = salesMessages_(snap, null);
  const ai = aiSalesComment_(snap);
  if (ai) messages.push(ai);
  linePush_(groupId, messages);
}

/** สร้างแท็บ SalesData / Targets (รันจาก editor ได้) */
function setupSalesSheets() {
  sheet_(SALES_SHEET, SALES_HEADERS);
  sheet_(MTD_SHEET, MTD_HEADERS);
  const t = sheet_(TARGET_SHEET, TARGET_HEADERS);
  // แท็บเก่าที่ยังไม่มีคอลัมน์เป้าบาท
  const head = t.getDataRange().getValues()[0] || [];
  if (head.length < TARGET_HEADERS.length || head[4] === '' || head[4] === undefined) {
    t.getRange(1, 5).setValue(TARGET_HEADERS[4]);
  }
}

// ---------------------------------------------------------------- อ่าน + คำนวณ

/**
 * ยอดสะสม (MTD) หลายวัน → แถวรายวัน = ยอดสะสมวันนี้ − ยอดสะสมไฟล์ก่อนหน้า (เดือนเดียวกัน)
 * ไฟล์แรกของเดือนจะเป็นยอดก้อนเดียว (ยังคำนวณยอดรายวันไม่ได้)
 */
/**
 * ยอดสะสม (หลายวัน) → ยอดรายวัน แยก 2 ชุด
 *  • ชุดเขต (team อย่างเดียว): ใช้คิดยอดรวม/รายเขต — วันไหนมีไฟล์รายเขตใช้ไฟล์นั้น (ครบทุกโรงงาน)
 *    ไม่มีก็รวมจากไฟล์รายลูกค้า
 *  • ชุดลูกค้า (detailOnly): ใช้ดูยอดรายลูกค้า/เซลส์ จากไฟล์รายลูกค้าเท่านั้น ไม่นับซ้ำในยอดรวม
 */
function mtdToDailyRows_(snaps, now) {
  const today = startOfDay_(now);
  const zoneBy = {};
  const detBy = {};
  snaps.forEach(function (r) {
    if (r.date > today) return;
    const t = r.date.getTime();
    if (r.customer) (detBy[t] = detBy[t] || []).push(r);
    else (zoneBy[t] = zoneBy[t] || []).push(r);
  });
  const dates = uniq_(Object.keys(zoneBy).concat(Object.keys(detBy))).map(Number).sort(function (a, b) { return a - b; });
  const hasAmt = function (rows) { return rows.some(function (r) { return !isNaN(r.amount); }); };
  const sumRows = function (rows, keyFn, zoneOnly) {
    const m = {};
    rows.forEach(function (r) {
      const k = keyFn(r);
      const c = m[k] || (m[k] = { team: r.team, sales: zoneOnly ? '' : r.sales || '', customer: zoneOnly ? '' : r.customer || '', ton: 0, amount: 0 });
      c.ton += r.ton;
      c.amount += isNaN(r.amount) ? 0 : r.amount;
    });
    return m;
  };
  const out = [];
  const firstOfMonth = {};
  // series: [{ t, map, hasAmt }] ตามวันที่ → ผลต่างจากวันก่อนหน้าในเดือนเดียวกัน
  const emit = function (series, extra) {
    let prev = null;
    let prevHasAmt = false;
    let prevMonth = '';
    series.forEach(function (x) {
      const d = new Date(x.t);
      const mk = monthKey_(d);
      if (mk !== prevMonth) { prev = null; prevMonth = mk; }
      const cur = x.map;
      const keys = Object.keys(cur).concat(prev ? Object.keys(prev).filter(function (k) { return !(k in cur); }) : []);
      keys.forEach(function (k) {
        const c = cur[k] || { team: prev[k].team, sales: prev[k].sales, customer: prev[k].customer, ton: 0, amount: 0 };
        const p = prev && prev[k] ? prev[k] : { ton: 0, amount: 0 };
        const dt = c.ton - p.ton;
        const da = x.hasAmt ? c.amount - p.amount : NaN;
        if (Math.abs(dt) < 1e-9 && !(Math.abs(da) > 1e-9)) return;
        // ไฟล์ก่อนหน้าไม่มีคอลัมน์มูลค่า: มูลค่าของวันนี้เป็นยอดสะสมก้อนเดียว ไม่ใช่ยอดรายวัน
        out.push(Object.assign({ date: d, team: c.team, sales: c.sales, customer: c.customer, product: '', ton: dt, amount: da,
          amtLump: !!(prev && x.hasAmt && !prevHasAmt), firstSnap: !prev }, extra));
      });
      prev = cur;
      prevHasAmt = x.hasAmt;
    });
  };
  const zoneSeries = dates.map(function (t) {
    const rows = zoneBy[t] || detBy[t];
    const mk = monthKey_(new Date(t));
    if (!(mk in firstOfMonth)) firstOfMonth[mk] = t;
    return { t: t, hasAmt: hasAmt(rows), map: sumRows(rows, function (r) { return r.team; }, true) };
  });
  emit(zoneSeries, {});
  const detDates = dates.filter(function (t) { return detBy[t]; });
  emit(detDates.map(function (t) {
    return { t: t, hasAmt: hasAmt(detBy[t]),
      map: sumRows(detBy[t], function (r) { return [r.team, r.sales, r.custId || r.customer].join('|'); }) };
  }), { detailOnly: true });

  const last = dates.length ? dates[dates.length - 1] : null;
  const lastDetailed = detDates.length ? detDates[detDates.length - 1] : null;
  // เป้า/ปีก่อน: จากไฟล์รายเขตล่าสุดของเดือน
  const zoneDates = dates.filter(function (t) { return zoneBy[t]; });
  const infoDate = zoneDates.length && last && monthKey_(new Date(zoneDates[zoneDates.length - 1])) === monthKey_(new Date(last))
    ? zoneDates[zoneDates.length - 1] : null;
  const since = dates.length > 1 && monthKey_(new Date(dates[dates.length - 2])) === monthKey_(new Date(last)) ? dates[dates.length - 2] : null;
  out.meta = { asOf: last ? new Date(last) : null, firstOfMonth: firstOfMonth,
    hasAmount: snaps.some(function (r) { return !isNaN(r.amount); }),
    zoneInfo: infoDate ? zoneInfoOf_(zoneBy[infoDate]) : {},
    since: since ? new Date(since) : null,
    detailAsOf: lastDetailed && lastDetailed !== last ? new Date(lastDetailed) : null };
  return out;
}

/** เป้า / Challenge / ปีก่อน รายเขต จากไฟล์ล่าสุด */
function zoneInfoOf_(rows) {
  const info = {};
  rows.forEach(function (r) {
    EXTRA_FIELDS.forEach(function (f) {
      if (typeof r[f] !== 'number' || isNaN(r[f])) return;
      const z = info[r.team] || (info[r.team] = {});
      z[f] = (z[f] || 0) + r[f];
    });
  });
  return info;
}

function readSalesRows_() {
  const mtd = spreadsheet_().getSheetByName(MTD_SHEET);
  if (mtd) {
    const snaps = [];
    mtd.getDataRange().getValues().slice(1).forEach(function (v) {
      const date = parseSheetDate_(v[0], 'DMY');
      const ton = parseNumber_(v[5]);
      if (!date || isNaN(ton)) return;
      const row = { date: date, team: normZone_(v[1]), sales: cleanText_(v[2]), custId: cleanText_(v[3]),
        customer: cleanText_(v[4]), ton: ton, amount: parseNumber_(v[6]) };
      EXTRA_FIELDS.forEach(function (f, i) { row[f] = parseNumber_(v[7 + i]); });
      snaps.push(row);
    });
    const fishOnly = snaps.filter(function (r) { return r.team !== OTHER_ZONE; });
    if (fishOnly.length) return mtdToDailyRows_(fishOnly, now_());
  }
  const ss = spreadsheet_();
  const sh = ss.getSheetByName(SALES_SHEET);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    const date = parseSheetDate_(v[0], 'DMY');
    const ton = parseNumber_(v[5]);
    if (!date || isNaN(ton)) continue;
    out.push({ date: date, team: cleanText_(v[1]), sales: cleanText_(v[2]), customer: cleanText_(v[3]),
      product: cleanText_(v[4]), ton: ton, amount: parseNumber_(v[6]) });
  }
  return out;
}

function monthKey_(d) {
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1);
}

function normMonthKey_(v) {
  if (v && typeof v.getTime === 'function') return monthKey_(v);
  const s = cleanText_(v);
  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(Number(m[2]));
  m = s.match(/^(\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    let y = Number(m[2]);
    if (y > 2400) y -= 543;
    return y + '-' + pad2_(Number(m[1]));
  }
  return s;
}

/** { team: {ทีม: {ton, amt}}, sales: {เซลส์: {ton, amt}}, salesTeam: {เซลส์: ทีม} } ของเดือนนั้น */
function readTargets_(mKey) {
  const out = { team: {}, sales: {}, salesTeam: {} };
  const sh = spreadsheet_().getSheetByName(TARGET_SHEET);
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(function (v) {
    if (normMonthKey_(v[0]) !== mKey) return;
    const ton = parseNumber_(v[3]);
    let amt = parseNumber_(v[4]);
    if (!isNaN(amt) && Math.abs(amt) < 1e5) amt *= 1e6; // กรอกเป็นล้านบาท เช่น 10.5
    if (isNaN(ton) && isNaN(amt)) return;
    const team = normZone_(v[1]);
    const sales = cleanText_(v[2]);
    const bucket = sales ? out.sales : out.team;
    const key = sales || team;
    if (!key) return;
    const cur = bucket[key] || (bucket[key] = { ton: 0, amt: 0 });
    if (!isNaN(ton)) cur.ton += ton;
    if (!isNaN(amt)) cur.amt += amt;
    if (sales && team) out.salesTeam[sales] = team;
  });
  return out;
}

function parseHolidays_(year) {
  return String(prop_('HOLIDAYS', '')).split(',').map(function (s) {
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (!m) return null;
    let y = m[3] ? Number(m[3]) : year;
    if (y < 100) y += y >= 50 ? 2500 : 2000; // 69 → 2569 (พ.ศ.), 26 → 2026
    if (y > 2400) y -= 543;
    return new Date(y, Number(m[2]) - 1, Number(m[1])).getTime();
  }).filter(Boolean);
}

/** วันทำงานทั้งเดือน และที่ผ่านไปถึง asOf (นับรวม asOf) */
function workingDays_(asOf) {
  const days = String(prop_('WORK_DAYS', CONFIG.WORK_DAYS)).split(',').map(Number);
  const holidays = parseHolidays_(asOf.getFullYear());
  const first = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  let total = 0;
  let passed = 0;
  for (let d = first; d.getMonth() === asOf.getMonth(); d = addDays_(d, 1)) {
    if (days.indexOf(d.getDay()) < 0 || holidays.indexOf(d.getTime()) >= 0) continue;
    total++;
    if (d <= asOf) passed++;
  }
  return { total: total, passed: Math.max(passed, 1) };
}

function sumBy_(rows, key, field) {
  const f = field || 'ton';
  const m = {};
  rows.forEach(function (r) {
    const k = r[key] || '(ไม่ระบุ)';
    const v = r[f];
    m[k] = (m[k] || 0) + (typeof v === 'number' && !isNaN(v) ? v : 0);
  });
  return m;
}

function sortedEntries_(m, amtMap) {
  return Object.keys(m).map(function (k) { return { name: k, ton: m[k], amt: amtMap ? amtMap[k] || 0 : null }; })
    .sort(function (a, b) { return b.ton - a.ton; });
}

function pctOrNull_(a, b) {
  return b ? (a / b) * 100 : null;
}

function sumField_(rows, f) {
  return rows.reduce(function (a, r) { return a + (typeof r[f] === 'number' && !isNaN(r[f]) ? r[f] : 0); }, 0);
}

/** Challenge และยอดปีก่อน (ถ้าไฟล์มี) */
function addZoneExtras_(m, zi) {
  if (!zi) return m;
  m.challengeTon = zi.challengeTon || null;
  m.challengeAmt = zi.challengeAmt || null;
  m.lastTon = zi.lastTon || null;
  m.lastAmt = zi.lastAmt || null;
  m.challengePct = pctOrNull_(m.forecastTon, m.challengeTon);
  m.challengePctAmt = pctOrNull_(m.forecastAmt, m.challengeAmt);
  return m;
}

/** ตัวเลขชุดเดียวกันสำหรับ รวม / เขต / เซลส์ */
function salesMetrics_(name, actualTon, actualAmt, budgetTon, budgetAmt, wd) {
  const remain = wd.total - wd.passed;
  const m = {
    name: name,
    actualTon: actualTon,
    budgetTon: budgetTon || null,
    achievement: pctOrNull_(actualTon, budgetTon),
    currentSpeed: actualTon / wd.passed,
    forecastTon: actualTon / wd.passed * wd.total,
    actualAmt: actualAmt,
    budgetAmt: budgetAmt || null,
    achievementAmt: pctOrNull_(actualAmt, budgetAmt),
    speedAmt: actualAmt / wd.passed,
    forecastAmt: actualAmt / wd.passed * wd.total,
  };
  m.forecastPct = pctOrNull_(m.forecastTon, budgetTon);
  m.forecastPctAmt = pctOrNull_(m.forecastAmt, budgetAmt);
  m.gapTon = budgetTon ? m.forecastTon - budgetTon : undefined;
  m.requiredSpeed = budgetTon ? (remain > 0 ? Math.max(0, (budgetTon - actualTon) / remain) : 0) : undefined;
  m.requiredAmt = budgetAmt ? (remain > 0 ? Math.max(0, (budgetAmt - actualAmt) / remain) : 0) : undefined;
  return m;
}

/** สร้าง snapshot (รวม + รายเขต + รายเซลส์) จากแถวยอดขาย */
function buildSalesSnapshot_(rows, now, targetsFn) {
  const today = startOfDay_(now);
  const meta = rows.meta || {};
  const usable = rows.filter(function (r) { return r.date <= today; });
  if (!usable.length && !meta.asOf) return null;
  const asOf = meta.asOf || usable.reduce(function (m, r) { return r.date > m ? r.date : m; }, usable[0].date);
  const mKey = monthKey_(asOf);
  const monthRows = usable.filter(function (r) { return monthKey_(r.date) === mKey; });
  // ยอดรวม/รายเขต ไม่นับแถวรายลูกค้าที่แยกเก็บไว้ (detailOnly) ซ้ำ
  const zoneRows = monthRows.filter(function (r) { return !r.detailOnly; });
  const lastAll = monthRows.filter(function (r) { return r.date.getTime() === asOf.getTime(); });
  const lastRows = lastAll.filter(function (r) { return !r.detailOnly; });
  const targets = (targetsFn || readTargets_)(mKey);
  // เป้าจากไฟล์รายเขต (Budget) ใช้เมื่อแท็บ Targets ไม่ได้กรอกเขตนั้น
  const zoneInfo = meta.zoneInfo || {};
  Object.keys(zoneInfo).forEach(function (z) {
    const zi = zoneInfo[z];
    if (!targets.team[z] && (zi.budgetTon || zi.budgetAmt)) targets.team[z] = { ton: zi.budgetTon || 0, amt: zi.budgetAmt || 0 };
  });
  const wd = workingDays_(asOf);
  const detailAsOf = meta.detailAsOf && monthKey_(meta.detailAsOf) === mKey ? meta.detailAsOf : null;
  const wdDetail = detailAsOf ? workingDays_(detailAsOf) : wd;
  const hasAmount = meta.hasAmount !== undefined ? meta.hasAmount
    : monthRows.some(function (r) { return typeof r.amount === 'number' && !isNaN(r.amount); });
  const tgt = function (o, k, f) { return o[k] && o[k][f] ? o[k][f] : null; };

  // ทีมของเซลส์: จากข้อมูลยอด ไม่มีก็จากแท็บ Targets
  const salesTeam = {};
  monthRows.forEach(function (r) { if (r.sales && r.team) salesTeam[r.sales] = r.team; });
  Object.keys(targets.salesTeam).forEach(function (s) { if (!salesTeam[s]) salesTeam[s] = targets.salesTeam[s]; });

  const salesRows = monthRows.filter(function (r) { return r.sales; });
  const bySales = sumBy_(salesRows, 'sales');
  const bySalesAmt = sumBy_(salesRows, 'sales', 'amount');
  Object.keys(targets.sales).forEach(function (s) { if (!(s in bySales)) { bySales[s] = 0; bySalesAmt[s] = 0; } });
  const salesList = sortedEntries_(bySales).map(function (e) {
    const m = salesMetrics_(e.name, e.ton, bySalesAmt[e.name] || 0,
      tgt(targets.sales, e.name, 'ton'), tgt(targets.sales, e.name, 'amt'), wdDetail);
    m.team = salesTeam[e.name] || '';
    return m;
  });

  const teamRows = zoneRows.filter(function (r) { return r.team; });
  const byTeam = sumBy_(teamRows, 'team');
  const byTeamAmt = sumBy_(teamRows, 'team', 'amount');
  Object.keys(targets.team).forEach(function (t) { if (!(t in byTeam)) { byTeam[t] = 0; byTeamAmt[t] = 0; } });
  const teamTarget = function (t, f) {
    const direct = tgt(targets.team, t, f);
    if (direct) return direct;
    const key = f === 'ton' ? 'budgetTon' : 'budgetAmt';
    return salesList.filter(function (s) { return s.team === t; })
      .reduce(function (a, s) { return a + (s[key] || 0); }, 0) || null;
  };
  const teams = Object.keys(byTeam)
    .sort(zoneCompare_)
    .map(function (t) {
      const m = salesMetrics_(t, byTeam[t], byTeamAmt[t] || 0, teamTarget(t, 'ton'), teamTarget(t, 'amt'), wd);
      return addZoneExtras_(m, zoneInfo[t]);
    });

  const sumTarget = function (list, key) { return list.reduce(function (a, x) { return a + (x[key] || 0); }, 0); };
  const budgetTon = sumTarget(teams, 'budgetTon') || sumTarget(salesList, 'budgetTon') || null;
  const budgetAmt = sumTarget(teams, 'budgetAmt') || sumTarget(salesList, 'budgetAmt') || null;
  const total = addZoneExtras_(
    salesMetrics_('รวมทุกเขต', sumField_(zoneRows, 'ton'), sumField_(zoneRows, 'amount'), budgetTon, budgetAmt, wd),
    Object.keys(zoneInfo).reduce(function (acc, z) {
      EXTRA_FIELDS.forEach(function (f) { if (zoneInfo[z][f]) acc[f] = (acc[f] || 0) + zoneInfo[z][f]; });
      return acc;
    }, {}));

  const lastTeamRows = lastRows.filter(function (r) { return r.team; });
  // ไฟล์รายลูกค้าไฟล์แรกของเดือน = ยอดสะสมทั้งก้อน ไม่ใช่ยอดของวันนั้น → ไม่นับเป็นยอดวันล่าสุด
  const lastDetail = lastAll.filter(function (r) { return !r.firstSnap; });
  const lastSalesRows = lastDetail.filter(function (r) { return r.sales; });
  const lastCustRows = lastDetail.filter(function (r) { return r.customer; });
  return {
    source: 'sheet',
    hasAmount: hasAmount,
    // ไฟล์ล่าสุดเป็นรายเขต: ข้อมูลลูกค้า/เซลส์ล่าสุดมาจากไฟล์รายลูกค้าวันที่นี้
    detailAsOf: detailAsOf,
    detailWd: wdDetail,
    date: pad2_(asOf.getDate()) + '/' + pad2_(asOf.getMonth() + 1) + '/' + asOf.getFullYear(),
    asOf: asOf,
    monthKey: mKey,
    workingDaysPassed: wd.passed,
    workingDaysTotal: wd.total,
    total: total,
    teams: teams,
    salesList: salesList,
    monthRows: monthRows,
    lastDay: {
      date: asOf,
      // ไฟล์ยอดสะสมไฟล์แรกของเดือน: ยังไม่มีไฟล์ก่อนหน้าให้หักลบ
      unavailable: !!(meta.firstOfMonth && meta.firstOfMonth[mKey] === asOf.getTime()),
      firstSnapshot: meta.firstOfMonth ? meta.firstOfMonth[mKey] || null : null,
      since: meta.since && monthKey_(meta.since) === mKey ? meta.since : null,
      amtUnknown: lastRows.some(function (r) { return r.amtLump || typeof r.amount !== 'number' || isNaN(r.amount); }),
      total: sumField_(lastRows, 'ton'),
      totalAmt: sumField_(lastRows, 'amount'),
      byTeam: sortedEntries_(sumBy_(lastTeamRows, 'team'), sumBy_(lastTeamRows, 'team', 'amount')),
      bySales: sortedEntries_(sumBy_(lastSalesRows, 'sales'), sumBy_(lastSalesRows, 'sales', 'amount')),
      byCustomer: sortedEntries_(sumBy_(lastCustRows, 'customer'), sumBy_(lastCustRows, 'customer', 'amount')),
    },
  };
}

// ---------------------------------------------------------------- ข้อความ

function timeGonePct_(snap) {
  return snap.workingDaysTotal ? (snap.workingDaysPassed / snap.workingDaysTotal) * 100 : null;
}

function paceIcon_(achievement, timeGone) {
  if (achievement === null || achievement === undefined || timeGone === null) return '';
  if (achievement >= timeGone) return ' 🟢';
  if (achievement >= timeGone - 10) return ' 🟡';
  return ' 🔴';
}

/** 45,600,000 → "45.60 ล้านบาท" (มูลค่าแสดงเป็นล้านบาทเสมอ) */
function fmtMoney_(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return fmtNum_(n / 1e6, 2) + ' ล้านบาท';
}



function pctText_(p) {
  return p === null || p === undefined ? '' : ' (' + fmtNum_(p, 1) + '%)';
}


/** "อา. 22 พ.ย. 69" */
function fmtDateShortYear_(d) {
  return fmtDate_(d) + ' ' + String(d.getFullYear() + 543).slice(-2);
}





/**
 * รายงานยอดจากไฟล์ — การ์ด (Flex)
 *  ไม่ระบุเขต: [ภาพรวมทุกเขต, ตารางรายเขต F1–F5]   ระบุเขต: [รายละเอียดเขตนั้น]
 *  opt.greeting = วันที่ (ข้อความเช้า)
 */
function salesSheetMessages_(snap, team, opt) {
  if (team) return [zoneDetailCard_(snap, team)];
  return [overviewCard_(snap, opt), zonesCard_(snap)];
}

/** รวมเป็นข้อความเดียว (ใช้ในที่ที่ต้องการ string) */
function formatSalesSheet_(snap, team) {
  return salesSheetMessages_(snap, team).map(function (m) { return m.type === 'flex' ? flexToText_(m.contents) : m.text || m; }).join('\n\n');
}

function tonVsTarget_(actual, budget, achievement) {
  return fmtNum_(actual) + (budget ? ' / ' + fmtNum_(budget) + ' ตัน (' + fmtNum_(achievement, 1) + '%)' : ' ตัน');
}


function formatSalesRank_(snap) {
  return rankCards_(snap);
}

/** "วันล่าสุด" หรือ "19–24 พ.ย." เมื่อไฟล์ก่อนหน้าห่างเกิน 1 วัน */
function lastDayLabel_(ld) {
  if (ld.since && dayDiff_(ld.date, ld.since) > 1) {
    return 'ยอด ' + addDays_(ld.since, 1).getDate() + '–' + fmtDate_(ld.date).replace(/^\S+ /, '');
  }
  return 'วันล่าสุด';
}


function formatLastDay_(snap) {
  return lastDayCard_(snap);
}

function formatTopBy_(snap, key, title, n) {
  return topCard_(snap, key, n);
}

// ---------------------------------------------------------------- ลูกค้า

const CUSTOMER_INDEX_KEY = 'cust_index_v1';
const SALES_INDEX_KEY = 'sales_index_v1';

/** ลูกค้าทุกรายในเขต เรียงตามตัน */
function formatZoneCustomers_(snap, zone) {
  return zoneCustomerCards_(snap, zone);
}

function uniq_(arr) {
  const seen = {};
  return arr.filter(function (x) { if (!x || seen[x]) return false; seen[x] = true; return true; });
}

function customerNames_(snap) {
  return uniq_(snap.monthRows.map(function (r) { return r.customer; }));
}

/** รายชื่อลูกค้าเดือนล่าสุด (cache 6 ชม. ล้างทุกครั้งที่นำเข้าไฟล์) — ใช้เช็กข้อความในกลุ่มแบบเร็ว */
function customerIndex_(force) {
  const cache = CacheService.getScriptCache();
  const hit = force ? null : cache.get(CUSTOMER_INDEX_KEY);
  if (hit) return JSON.parse(hit);
  let names = [];
  let sales = [];
  try {
    const rows = readSalesRows_();
    const snap = rows.length ? buildSalesSnapshot_(rows, now_(), function () { return { team: {}, sales: {}, salesTeam: {} }; }) : null;
    if (snap) {
      names = customerNames_(snap);
      sales = uniq_(snap.monthRows.map(function (r) { return r.sales; }));
    }
  } catch (e) {
    console.error(e);
  }
  const json = JSON.stringify(names);
  if (json.length < 90000) cache.put(CUSTOMER_INDEX_KEY, json, names.length ? 21600 : 600);
  cache.put(SALES_INDEX_KEY, JSON.stringify(sales), sales.length ? 21600 : 600);
  return names;
}

/** รายชื่อเซลส์ (จากไฟล์รายลูกค้า) */
function salesIndex_() {
  const hit = CacheService.getScriptCache().get(SALES_INDEX_KEY);
  if (hit) return JSON.parse(hit);
  customerIndex_(true); // รายชื่อลูกค้ายังอยู่ใน cache แต่รายชื่อเซลส์ไม่มี → สร้างใหม่ทั้งคู่
  const again = CacheService.getScriptCache().get(SALES_INDEX_KEY);
  return again ? JSON.parse(again) : [];
}

/** พิมพ์ชื่อเซลส์เฉย ๆ: ตรงทั้งชื่อ-นามสกุล หรือตรงชื่อต้น (ไม่ค้นแบบบางส่วน กันชนแชทปกติ) */
function findSalesName_(names, q) {
  const n = normName_(q);
  if (!n || n.length < 2) return null;
  const full = names.filter(function (x) { return normName_(x) === n; });
  if (full.length === 1) return full[0];
  const first = names.filter(function (x) { return normName_(String(x).split(/\s+/)[0]) === n; });
  return first.length === 1 ? first[0] : null;
}

// ---------------------------------------------------------------- เดาชื่อที่พิมพ์ผิด

/** ตัดคำนำหน้า/ท้ายที่ไม่ใช่ชื่อจริง: ร้าน, บจก., หจก., (2006), /สนญ. ... */
function coreName_(s) {
  return normName_(String(s || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\/.*$/, '')
    .replace(/^(ร้าน|บจก\.?|หจก\.?|บริษัท|ห้างหุ้นส่วนจำกัด|คุณ|นางสาว|นาย|นาง|น\.ส\.)\s*/, '')
    .replace(/\s*(จำกัด|ฟาร์ม)$/, ''));
}

/** คีย์เทียบเสียง: ตัดวรรณยุกต์/การันต์ และรวมพยัญชนะที่ออกเสียงคล้ายกัน (สะกดผิดบ่อย) */
function soundKey_(s) {
  return String(s || '')
    .replace(/[ก-ฮ][ิุ]?์/g, '') // ตัวการันต์ไม่ออกเสียง: ศักดิ์ → ศัก, ฟาร์ม → ฟาม
    .replace(/[็-๎]/g, '')
    .replace(/[ดตฏฎทธฑฒถจชซศษส]/g, 'ด')
    .replace(/[นณญรลฬ]/g, 'น')
    .replace(/[กขคฆ]/g, 'ก')
    .replace(/[บปพภ]/g, 'บ');
}

function editDistance_(a, b) {
  a = Array.from(a); b = Array.from(b);
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * ชื่อที่ใกล้เคียงกับที่พิมพ์ (เซลส์ + ลูกค้า) เรียงจากใกล้สุด
 * คืน [{ name, kind: 'sales'|'customer', d, ratio }]
 */
function similarNames_(q, sales, customers, maxRatio) {
  const nq = soundKey_(coreName_(q) || normName_(q));
  if (Array.from(nq).length < 2) return [];
  const out = [];
  const consider = function (name, kind, keys) {
    let best = null;
    keys.forEach(function (k) {
      if (!k) return;
      k = soundKey_(k);
      const d = editDistance_(nq, k);
      const ratio = d / Math.max(Array.from(nq).length, Array.from(k).length);
      if (!best || ratio < best.ratio) best = { name: name, kind: kind, d: d, ratio: ratio };
    });
    if (best && best.ratio <= maxRatio) out.push(best);
  };
  (sales || []).forEach(function (n) { consider(n, 'sales', [normName_(n), normName_(String(n).split(/\s+/)[0])]); });
  (customers || []).forEach(function (n) { consider(n, 'customer', [normName_(n), coreName_(n)]); });
  return out.sort(function (a, b) { return a.ratio - b.ratio || a.d - b.d; });
}

/** ถาม AI ให้เดาว่าหมายถึงชื่อไหน (เลือกจากรายชื่อจริงเท่านั้น) */
function aiGuessNames_(q, names) {
  if (!aiEnabled_() || !names.length) return [];
  let text = null;
  try {
    text = callAi_('คุณช่วยเดาชื่อที่ผู้ใช้พิมพ์ผิด/สะกดไม่ถูก โดยเลือกจากรายชื่อที่ให้เท่านั้น ' +
      'ตอบเป็นชื่อจากรายชื่อ ตรงตามตัวอักษรทุกตัว บรรทัดละ 1 ชื่อ ไม่เกิน 3 ชื่อ ถ้าไม่มีชื่อที่ใกล้เคียงให้ตอบว่า ไม่มี',
      'รายชื่อ:\n' + names.join('\n') + '\n\nผู้ใช้พิมพ์: ' + q);
  } catch (e) { console.error('AI guess: ' + e); }
  if (!text) return [];
  const set = {};
  names.forEach(function (n) { set[normName_(n)] = n; });
  return uniq_(String(text).split('\n').map(function (l) {
    return set[normName_(l.replace(/^[\s•\-*\d.)]+/, ''))];
  })).slice(0, 3);
}

/** ข้อความเมื่อหาชื่อไม่เจอ: บอกให้สะกดให้ถูก + ชื่อที่น่าจะใช่ */
function spellingHelpText_(q, guesses) {
  const lines = ['🔎 ไม่พบชื่อ "' + q + '" ค่ะ', 'ช่วยสะกดชื่อให้ถูกอีกครั้งนะคะ'];
  if (guesses.length) {
    lines.push('', 'หมายถึงชื่อนี้หรือเปล่าคะ');
    guesses.forEach(function (g) { lines.push('• ' + g); });
    lines.push('', '(พิมพ์ชื่อที่ถูกได้เลยค่ะ)');
  }
  return lines.join('\n');
}

function clearCustomerIndex_() {
  CacheService.getScriptCache().remove(CUSTOMER_INDEX_KEY);
  CacheService.getScriptCache().remove(SALES_INDEX_KEY);
}

/** exact: ชื่อตรงทั้งชื่อ (ไม่สนช่องว่าง/ตัวพิมพ์)  ไม่ exact: มีคำค้นอยู่ในชื่อ (อย่างน้อย 3 ตัวอักษร) */
function findCustomers_(names, q, exactOnly) {
  const n = normName_(q);
  if (!n) return [];
  const exact = names.filter(function (x) { return normName_(x) === n; });
  if (exact.length || exactOnly) return exact;
  if (n.length < 3) return [];
  return names.filter(function (x) { return normName_(x).indexOf(n) >= 0; });
}

/** ยอดลูกค้ารายเดียว */
function formatCustomerSales_(snap, name) {
  if (!snap || snap.source !== 'sheet') return null;
  return customerCard_(snap, name);
}

function findSalesPerson_(snap, q) {
  const n = normName_(q);
  if (!n || !snap.salesList) return null;
  return snap.salesList.find(function (s) { return normName_(s.name) === n; }) ||
    snap.salesList.find(function (s) { return normName_(s.name).indexOf(n) >= 0; }) || null;
}

function formatPersonSales_(snap, person) {
  return personCards_(snap, person);
}
