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
const MTD_HEADERS = ['ข้อมูล ณ วันที่', 'เขต', 'เซลส์ (PIC_New)', 'รหัสลูกค้า', 'ลูกค้า', 'ตันสะสม (MTD)', 'บาทสะสม (MTD)'];

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
    const amount = map.amount !== undefined ? parseNumber_(r[map.amount]) : NaN;
    row.amount = isNaN(amount) ? null : amount;
    rows.push(row);
  });
  return { rows: rows, columns: map, header: header, mode: mode };
}

/** วันที่ของข้อมูลจากชื่อไฟล์: "data_18.xlsx" → วันที่ 18, "sales 2026-11-18.csv" → 18/11/2026 */
function asOfFromFileName_(name, ref) {
  const base = String(name).replace(/\.[^.]+$/, '');
  const today = startOfDay_(ref);
  let m = base.match(/(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (m) return parseSheetDate_(m[1] + '-' + m[2] + '-' + m[3], 'DMY');
  m = base.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{2,4})/);
  if (m) return parseSheetDate_(m[1] + '/' + m[2] + '/' + m[3], 'DMY');
  const nums = base.match(/(?:^|\D)(\d{1,2})(?!\d)/g);
  if (nums) {
    const day = Number(nums[nums.length - 1].replace(/\D/g, ''));
    if (day >= 1 && day <= 31) {
      let d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d > today || d.getDate() !== day) d = new Date(today.getFullYear(), today.getMonth() - 1, day);
      return d;
    }
  }
  return addDays_(today, -1); // ไม่มีวันที่ในชื่อ: ถือว่าเป็นข้อมูลถึงเมื่อวาน
}

/** เก็บยอดสะสม ณ วันที่ asOf (ทับของวันเดิมถ้านำเข้าซ้ำ) */
function replaceMtdSnapshot_(rows, asOf) {
  withLock_(function () {
    const sh = sheet_(MTD_SHEET, MTD_HEADERS);
    const values = sh.getDataRange().getValues();
    const keep = values.slice(1).filter(function (r) {
      if (r[0] === '' || r[0] === null) return false;
      const d = parseSheetDate_(r[0], 'DMY');
      return !d || d.getTime() !== asOf.getTime();
    });
    const out = [MTD_HEADERS].concat(keep, rows.map(function (r) {
      return [asOf, r.team, r.sales, r.custId, r.customer, r.ton, r.amount === null ? '' : r.amount];
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
    replaceMtdSnapshot_(parsed.rows, asOf);
    r = { mode: 'mtd', count: parsed.rows.length, from: asOf, to: asOf,
      total: parsed.rows.reduce(function (a, x) { return a + x.ton; }, 0) };
  } else {
    r = replaceSalesRows_(parsed.rows);
    r.mode = 'daily';
  }
  const need = parsed.mode === 'mtd' ? ['team', 'sales', 'customer'] : ['team', 'sales', 'customer', 'product'];
  r.missing = need.filter(function (k) { return parsed.columns[k] === undefined; });
  r.hasAmount = parsed.columns.amount !== undefined;
  clearCustomerIndex_();
  return r;
}

const MISSING_LABEL = { team: 'ทีม', sales: 'เซลส์', customer: 'ลูกค้า', product: 'สินค้า' };

function formatImportResult_(r, fileName) {
  if (r.mode === 'mtd') {
    let m = '✅ นำเข้ายอดสะสม ณ ' + fmtDateLong_(r.from) + '\n' + fmtNum_(r.count, 0) + ' แถว รวม ' + fmtNum_(r.total) + ' ตัน' +
      (fileName ? '\n📄 ' + fileName : '') +
      '\nถ้าวันที่ไม่ถูก พิมพ์ "อัปเดตยอด วว/ดด" เช่น อัปเดตยอด ' + r.from.getDate() + '/' + (r.from.getMonth() + 1);
    if (r.missing && r.missing.length) m += '\n⚠️ ไฟล์ไม่มีคอลัมน์: ' + r.missing.map(function (k) { return MISSING_LABEL[k]; }).join(', ');
    if (!r.hasAmount) m += '\nℹ️ ไฟล์ไม่มีคอลัมน์มูลค่า (บาท) — รายงานจะแสดงเฉพาะตัน';
    return m;
  }
  let s = '✅ นำเข้ายอดขาย ' + fmtNum_(r.count, 0) + ' แถว (' + fmtDate_(r.from) +
    (r.to - r.from ? ' – ' + fmtDate_(r.to) : '') + ')' + (fileName ? '\n📄 ' + fileName : '');
  if (r.missing && r.missing.length) {
    s += '\n⚠️ ไฟล์ไม่มีคอลัมน์: ' + r.missing.map(function (k) { return MISSING_LABEL[k]; }).join(', ');
  }
  return s;
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
  if (!latest) return { skipped: true, message: 'ยังไม่มีไฟล์ในโฟลเดอร์นำเข้า' };
  const key = latest.getId() + '@' + latest.getLastUpdated().getTime();
  if (!force && prop_('LAST_IMPORT_KEY', '') === key) {
    return { skipped: true, message: 'ไฟล์ล่าสุด (' + latest.getName() + ') นำเข้าไปแล้ว' };
  }
  const asOf = asOfOverride || asOfFromFileName_(latest.getName(), latest.getLastUpdated());
  const r = importTable_(readDriveTable_(latest), { asOf: asOf });
  setProp_('LAST_IMPORT_KEY', key);
  r.fileName = latest.getName();
  r.message = formatImportResult_(r, latest.getName());
  return r;
}

/** Trigger: ทุกชั่วโมง — มีไฟล์ใหม่ก็นำเข้า */
function importSalesHourly() {
  try {
    const r = importSalesFromDrive_(false);
    if (!r.skipped) console.log(r.message);
  } catch (e) {
    console.error('นำเข้ายอดไม่สำเร็จ: ' + (e && e.message || e));
  }
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
function mtdToDailyRows_(snaps, now) {
  const today = startOfDay_(now);
  const byDate = {};
  snaps.forEach(function (r) {
    if (r.date > today) return;
    (byDate[r.date.getTime()] = byDate[r.date.getTime()] || []).push(r);
  });
  const dates = Object.keys(byDate).map(Number).sort(function (a, b) { return a - b; });
  const out = [];
  const firstOfMonth = {};
  let prev = null;
  let prevHasAmt = false;
  let prevMonth = '';
  dates.forEach(function (t) {
    const d = new Date(t);
    const mk = monthKey_(d);
    if (mk !== prevMonth) { prev = null; prevMonth = mk; firstOfMonth[mk] = t; }
    const cur = {};
    const curHasAmt = byDate[t].some(function (r) { return !isNaN(r.amount); });
    byDate[t].forEach(function (r) {
      const k = [r.team, r.sales, r.custId || r.customer].join('|');
      const c = cur[k] || (cur[k] = { team: r.team, sales: r.sales, customer: r.customer, ton: 0, amount: 0 });
      c.ton += r.ton;
      c.amount += isNaN(r.amount) ? 0 : r.amount;
    });
    const keys = Object.keys(cur).concat(prev ? Object.keys(prev).filter(function (k) { return !(k in cur); }) : []);
    keys.forEach(function (k) {
      const c = cur[k] || { team: prev[k].team, sales: prev[k].sales, customer: prev[k].customer, ton: 0, amount: 0 };
      const p = prev && prev[k] ? prev[k] : { ton: 0, amount: 0 };
      const dt = c.ton - p.ton;
      const da = curHasAmt ? c.amount - p.amount : NaN;
      if (Math.abs(dt) < 1e-9 && !(Math.abs(da) > 1e-9)) return;
      // ไฟล์ก่อนหน้าไม่มีคอลัมน์มูลค่า: มูลค่าของวันนี้เป็นยอดสะสมก้อนเดียว ไม่ใช่ยอดรายวัน
      out.push({ date: d, team: c.team, sales: c.sales, customer: c.customer, product: '', ton: dt, amount: da,
        amtLump: !!(prev && curHasAmt && !prevHasAmt) });
    });
    prev = cur;
    prevHasAmt = curHasAmt;
  });
  out.meta = { asOf: dates.length ? new Date(dates[dates.length - 1]) : null, firstOfMonth: firstOfMonth,
    hasAmount: snaps.some(function (r) { return !isNaN(r.amount); }) };
  return out;
}

function readSalesRows_() {
  const mtd = spreadsheet_().getSheetByName(MTD_SHEET);
  if (mtd) {
    const snaps = [];
    mtd.getDataRange().getValues().slice(1).forEach(function (v) {
      const date = parseSheetDate_(v[0], 'DMY');
      const ton = parseNumber_(v[5]);
      if (!date || isNaN(ton)) return;
      snaps.push({ date: date, team: normZone_(v[1]), sales: cleanText_(v[2]), custId: cleanText_(v[3]),
        customer: cleanText_(v[4]), ton: ton, amount: parseNumber_(v[6]) });
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
    if (y < 100) y += 2000;
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
  const lastRows = monthRows.filter(function (r) { return r.date.getTime() === asOf.getTime(); });
  const targets = (targetsFn || readTargets_)(mKey);
  const wd = workingDays_(asOf);
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
      tgt(targets.sales, e.name, 'ton'), tgt(targets.sales, e.name, 'amt'), wd);
    m.team = salesTeam[e.name] || '';
    return m;
  });

  const teamRows = monthRows.filter(function (r) { return r.team; });
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
    .map(function (t) { return salesMetrics_(t, byTeam[t], byTeamAmt[t] || 0, teamTarget(t, 'ton'), teamTarget(t, 'amt'), wd); });

  const sumTarget = function (list, key) { return list.reduce(function (a, x) { return a + (x[key] || 0); }, 0); };
  const budgetTon = sumTarget(teams, 'budgetTon') || sumTarget(salesList, 'budgetTon') || null;
  const budgetAmt = sumTarget(teams, 'budgetAmt') || sumTarget(salesList, 'budgetAmt') || null;
  const total = salesMetrics_('รวมทุกเขต', sumField_(monthRows, 'ton'), sumField_(monthRows, 'amount'), budgetTon, budgetAmt, wd);

  const lastTeamRows = lastRows.filter(function (r) { return r.team; });
  const lastSalesRows = lastRows.filter(function (r) { return r.sales; });
  const lastCustRows = lastRows.filter(function (r) { return r.customer; });
  return {
    source: 'sheet',
    hasAmount: hasAmount,
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
      amtUnknown: lastRows.some(function (r) { return r.amtLump; }),
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

function fmtMillion_(n) {
  return n === null || n === undefined || isNaN(n) ? '-' : fmtNum_(n / 1e6, 2);
}

function forecastIcon_(m) {
  const p = m.forecastPct !== null && m.forecastPct !== undefined ? m.forecastPct : m.forecastPctAmt;
  if (p === null || p === undefined) return '';
  if (p >= 100) return ' 🟢';
  if (p >= 95) return ' 🟡';
  return ' 🔴';
}

function pctText_(p) {
  return p === null || p === undefined ? '' : ' (' + fmtNum_(p, 1) + '%)';
}

/** บล็อกตัวเลขของ รวม/เขต: ตัน + บาท, สปีดต่อวัน, คาดปิดเดือน, ต้องทำต่อวัน */
function metricsBlock_(m, hasAmount, detailed) {
  const lines = [];
  lines.push('ตัน: ' + fmtNum_(m.actualTon) + (m.budgetTon ? ' / ' + fmtNum_(m.budgetTon) : '') + pctText_(m.achievement));
  lines.push('   สปีด ' + fmtNum_(m.currentSpeed) + ' ตัน/วัน → ปิดเดือน ' + fmtNum_(m.forecastTon) + pctText_(m.forecastPct));
  if (detailed && m.requiredSpeed !== undefined) {
    const d = m.currentSpeed - m.requiredSpeed;
    lines.push('   ต้องทำ ' + fmtNum_(m.requiredSpeed) + ' ตัน/วัน ' + (d >= 0 ? '✅ เกิน +' + fmtNum_(d) : '⚠️ ขาด ' + fmtNum_(-d)));
  }
  if (hasAmount || m.budgetAmt) {
    lines.push('มูลค่า: ' + (m.budgetAmt ? fmtMillion_(m.actualAmt) + ' / ' + fmtMoney_(m.budgetAmt) : fmtMoney_(m.actualAmt)) +
      pctText_(m.achievementAmt));
    lines.push('   สปีด ' + fmtMoney_(m.speedAmt) + '/วัน → ปิดเดือน ' + fmtMoney_(m.forecastAmt) + pctText_(m.forecastPctAmt));
    if (detailed && m.requiredAmt !== undefined) {
      const d = m.speedAmt - m.requiredAmt;
      lines.push('   ต้องทำ ' + fmtMoney_(m.requiredAmt) + '/วัน ' + (d >= 0 ? '✅' : '⚠️ ขาด ' + fmtMoney_(-d) + '/วัน'));
    }
  }
  return lines;
}

/** ข้อความ "ยอด" จากข้อมูล Power BI: รวมทุกเขต + รายเขต (team = เขตเดียว) */
function formatSalesSheet_(snap, team) {
  const remain = snap.workingDaysTotal - snap.workingDaysPassed;
  const tg = timeGonePct_(snap);
  const ld = snap.lastDay;
  const out = ['📊 ยอดขายสะสม ถึง ' + fmtDateLong_(snap.asOf),
    '📆 วันทำงาน ' + snap.workingDaysPassed + '/' + snap.workingDaysTotal + ' วัน (เหลือ ' + remain + ') · Time gone ' + fmtNum_(tg, 1) + '%'];

  if (team) {
    const lt = ld.byTeam.find(function (e) { return e.name === team.name; });
    if (ld.unavailable) out.push(DAILY_PENDING_TEXT);
    else if (lt) out.push('📅 วันล่าสุด ' + fmtNum_(lt.ton) + ' ตัน' + (snap.hasAmount && !ld.amtUnknown ? ' · ' + fmtMoney_(lt.amt) : ''));
    out.push('━━━━━━━━━━');
    out.push('📍 ' + team.name + forecastIcon_(team));
    metricsBlock_(team, snap.hasAmount, true).forEach(function (l) { out.push(l); });
    const members = snap.salesList.filter(function (s) { return s.team === team.name; });
    if (members.length) {
      out.push('━━━━━━━━━━');
      out.push('👥 เซลส์ในเขต (ตัน · คาดปิด)');
      members.forEach(function (s, i) {
        out.push((i + 1) + '. ' + s.name + ' ' + fmtNum_(s.actualTon) + pctText_(s.achievement) +
          ' → ' + fmtNum_(s.forecastTon) + pctText_(s.forecastPct) + forecastIcon_(s));
      });
    }
    return out.join('\n');
  }

  out.push(ld.unavailable ? DAILY_PENDING_TEXT
    : '📅 วันล่าสุด ' + fmtNum_(ld.total) + ' ตัน' + (snap.hasAmount && !ld.amtUnknown ? ' · ' + fmtMoney_(ld.totalAmt) : ''));
  out.push('━━━━━━━━━━');
  out.push('🏢 รวมทุกเขต' + forecastIcon_(snap.total));
  metricsBlock_(snap.total, snap.hasAmount, true).forEach(function (l) { out.push(l); });
  snap.teams.forEach(function (t) {
    out.push('━━━━━━━━━━');
    out.push('📍 ' + t.name + forecastIcon_(t));
    metricsBlock_(t, snap.hasAmount, false).forEach(function (l) { out.push(l); });
  });
  out.push('━━━━━━━━━━');
  out.push('คาดปิดเดือน 🟢 ≥100% 🟡 95–99% 🔴 <95% ของเป้า');
  out.push('ดูเพิ่ม: ยอด F1 | ยอดเมื่อวาน | ยอดเซลส์ | ยอด <ชื่อเซลส์>');
  return out.join('\n');
}

function tonVsTarget_(actual, budget, achievement) {
  return fmtNum_(actual) + (budget ? ' / ' + fmtNum_(budget) + ' ตัน (' + fmtNum_(achievement, 1) + '%)' : ' ตัน');
}

function formatTopList_(entries, n, withRank) {
  return entries.slice(0, n).map(function (e, i) {
    return (withRank ? (i + 1) + '. ' : '• ') + e.name + ' — ' + fmtNum_(e.ton) + ' ตัน';
  }).join('\n');
}

function formatSalesRank_(snap) {
  if (!snap.salesList || !snap.salesList.length) return 'ข้อมูลยอดขายไม่มีคอลัมน์เซลส์';
  const tg = timeGonePct_(snap);
  const lines = ['🏆 อันดับเซลส์ เดือนนี้ (ถึง ' + fmtDate_(snap.asOf) + ')',
    'Time gone ' + fmtNum_(tg, 0) + '%  🟢 ทันเป้า 🟡 ตามไม่เกิน 10 pts 🔴 ตามเกิน'];
  const anyTarget = snap.salesList.some(function (s) { return s.budgetTon; });
  const list = anyTarget
    ? snap.salesList.slice().sort(function (a, b) { return (b.achievement || -1) - (a.achievement || -1) || b.actualTon - a.actualTon; })
    : snap.salesList;
  list.forEach(function (s, i) {
    lines.push((i + 1) + '. ' + s.name + (s.team ? ' (' + s.team + ')' : '') + ' — ' +
      tonVsTarget_(s.actualTon, s.budgetTon, s.achievement) + paceIcon_(s.achievement, tg));
  });
  return lines.join('\n');
}

const DAILY_PENDING_TEXT = '📅 ยอดรายวัน: จะเริ่มคำนวณเมื่อมีไฟล์ของวันถัดไป (ยอดวันนี้ = ไฟล์วันนี้ − ไฟล์เมื่อวาน)';

function formatLastDay_(snap) {
  const ld = snap.lastDay;
  if (ld.unavailable) {
    return DAILY_PENDING_TEXT + '\n\nสะสมเดือนนี้ ถึง ' + fmtDate_(ld.date) + ': ' +
      tonVsTarget_(snap.total.actualTon, snap.total.budgetTon, snap.total.achievement);
  }
  const lines = ['📅 ยอดขายวันที่ ' + fmtDate_(ld.date) + ': ' + fmtNum_(ld.total) + ' ตัน' +
    (snap.hasAmount && !ld.amtUnknown ? ' · ' + fmtMoney_(ld.totalAmt) : '')];
  if (ld.byTeam.length > 1 || (ld.byTeam[0] && ld.byTeam[0].name !== '(ไม่ระบุ)')) {
    ld.byTeam.slice().sort(function (a, b) { return zoneCompare_(a.name, b.name); }).forEach(function (t) {
      lines.push('• ' + t.name + ' ' + fmtNum_(t.ton) + ' ตัน' + (snap.hasAmount && !ld.amtUnknown ? ' · ' + fmtMoney_(t.amt) : ''));
    });
  }
  if (ld.bySales.length) { lines.push(''); lines.push('🏅 เซลส์'); lines.push(formatTopList_(ld.bySales, 10, true)); }
  if (ld.byCustomer.length) { lines.push(''); lines.push('👥 ลูกค้า'); lines.push(formatTopList_(ld.byCustomer, 5, true)); }
  lines.push('');
  lines.push('สะสมเดือนนี้ ' + tonVsTarget_(snap.total.actualTon, snap.total.budgetTon, snap.total.achievement) +
    (snap.hasAmount ? ' · ' + fmtMoney_(snap.total.actualAmt) + pctText_(snap.total.achievementAmt) : ''));
  return lines.join('\n');
}

function formatTopBy_(snap, key, title, n) {
  const rows = snap.monthRows.filter(function (r) { return r[key]; });
  if (!rows.length) return 'ข้อมูลยอดขายไม่มีคอลัมน์' + (key === 'customer' ? 'ลูกค้า' : 'สินค้า');
  const entries = sortedEntries_(sumBy_(rows, key));
  return title + ' เดือนนี้ (ถึง ' + fmtDate_(snap.asOf) + ') ทั้งหมด ' + entries.length + (key === 'customer' ? ' ราย' : ' รายการ') + '\n' +
    formatTopList_(entries, n || 10, true);
}

// ---------------------------------------------------------------- ลูกค้า

const CUSTOMER_INDEX_KEY = 'cust_index_v1';

function uniq_(arr) {
  const seen = {};
  return arr.filter(function (x) { if (!x || seen[x]) return false; seen[x] = true; return true; });
}

function customerNames_(snap) {
  return uniq_(snap.monthRows.map(function (r) { return r.customer; }));
}

/** รายชื่อลูกค้าเดือนล่าสุด (cache 6 ชม. ล้างทุกครั้งที่นำเข้าไฟล์) — ใช้เช็กข้อความในกลุ่มแบบเร็ว */
function customerIndex_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CUSTOMER_INDEX_KEY);
  if (hit) return JSON.parse(hit);
  let names = [];
  try {
    const rows = readSalesRows_();
    const snap = rows.length ? buildSalesSnapshot_(rows, now_(), function () { return { team: {}, sales: {}, salesTeam: {} }; }) : null;
    if (snap) names = customerNames_(snap);
  } catch (e) {
    console.error(e);
  }
  const json = JSON.stringify(names);
  if (json.length < 90000) cache.put(CUSTOMER_INDEX_KEY, json, names.length ? 21600 : 600);
  return names;
}

function clearCustomerIndex_() {
  CacheService.getScriptCache().remove(CUSTOMER_INDEX_KEY);
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

/** ยอดลูกค้ารายเดียว: ตัน + ล้านบาท, สปีด, คาดปิดเดือน, สัดส่วนในเขต, รายวันล่าสุด */
function formatCustomerSales_(snap, name) {
  if (snap.source !== 'sheet') return null;
  const rows = snap.monthRows.filter(function (r) { return r.customer === name; });
  if (!rows.length) return '👥 ' + name + '\nยังไม่มียอดเดือนนี้';
  const ton = sumField_(rows, 'ton');
  const amt = sumField_(rows, 'amount');
  const wd = { total: snap.workingDaysTotal, passed: snap.workingDaysPassed };
  const m = salesMetrics_(name, ton, amt, null, null, wd);
  const zones = uniq_(rows.map(function (r) { return r.team; }));
  const pics = sortedEntries_(sumBy_(rows.filter(function (r) { return r.sales; }), 'sales'))
    .filter(function (e) { return Math.abs(e.ton) > 1e-9; }).map(function (e) { return e.name; });
  const out = ['👥 ' + name,
    '📍 ' + (zones.join(', ') || '-') + (pics.length ? ' · 👤 ' + pics.join(', ') : ''),
    '📆 สะสมถึง ' + fmtDate_(snap.asOf) + ' · วันทำงาน ' + wd.passed + '/' + wd.total,
    '━━━━━━━━━━',
    'ตัน: ' + fmtNum_(ton),
    '   สปีด ' + fmtNum_(m.currentSpeed) + ' ตัน/วัน → ปิดเดือน ' + fmtNum_(m.forecastTon)];
  if (snap.hasAmount) {
    out.push('มูลค่า: ' + fmtMoney_(amt));
    out.push('   สปีด ' + fmtMoney_(m.speedAmt) + '/วัน → ปิดเดือน ' + fmtMoney_(m.forecastAmt));
  }
  if (zones.length === 1) {
    const z = snap.teams.find(function (t) { return t.name === zones[0]; });
    if (z && z.actualTon) out.push('คิดเป็น ' + fmtNum_(ton / z.actualTon * 100, 1) + '% ของเขต ' + z.name);
  }
  // รายวัน (จากผลต่างยอดสะสม)
  const byDay = {};
  rows.forEach(function (r) {
    const k = r.date.getTime();
    const d = byDay[k] || (byDay[k] = { ton: 0, amt: 0, amtKnown: false });
    d.ton += r.ton;
    if (typeof r.amount === 'number' && !isNaN(r.amount) && !r.amtLump) { d.amt += r.amount; d.amtKnown = true; }
  });
  const days = Object.keys(byDay).map(Number).sort(function (a, b) { return b - a; });
  const daily = days.filter(function (t) { return t !== snap.lastDay.firstSnapshot; });
  if (daily.length) {
    out.push('━━━━━━━━━━');
    out.push('📅 รายวันล่าสุด');
    daily.slice(0, 7).forEach(function (t) {
      const d = byDay[t];
      out.push('• ' + fmtDate_(new Date(t)) + ' ' + (d.ton >= 0 ? '+' : '') + fmtNum_(d.ton) + ' ตัน' +
        (snap.hasAmount && d.amtKnown ? ' · ' + fmtMoney_(d.amt) : ''));
    });
  }
  return out.join('\n');
}

function findSalesPerson_(snap, q) {
  const n = normName_(q);
  if (!n || !snap.salesList) return null;
  return snap.salesList.find(function (s) { return normName_(s.name) === n; }) ||
    snap.salesList.find(function (s) { return normName_(s.name).indexOf(n) >= 0; }) || null;
}

function formatPersonSales_(snap, person) {
  const tg = timeGonePct_(snap);
  const rows = snap.monthRows.filter(function (r) { return r.sales === person.name; });
  const last = rows.filter(function (r) { return r.date.getTime() === snap.asOf.getTime(); })
    .reduce(function (a, r) { return a + r.ton; }, 0);
  const lines = ['👤 ' + person.name + (person.team ? ' (' + person.team + ')' : '') + ' — ถึง ' + fmtDate_(snap.asOf),
    'เดือนนี้: ' + tonVsTarget_(person.actualTon, person.budgetTon, person.achievement) + paceIcon_(person.achievement, tg),
    snap.lastDay.unavailable ? 'วันล่าสุด: -' : 'วันล่าสุด: ' + fmtNum_(last) + ' ตัน'];
  const remain = snap.workingDaysTotal - snap.workingDaysPassed;
  if (person.budgetTon && remain > 0 && person.actualTon < person.budgetTon) {
    lines.push('🎯 ต้องทำอีก ' + fmtNum_(person.budgetTon - person.actualTon) + ' ตัน ≈ ' +
      fmtNum_((person.budgetTon - person.actualTon) / remain) + ' ตัน/วัน');
  }
  const cust = sortedEntries_(sumBy_(rows.filter(function (r) { return r.customer; }), 'customer'));
  if (cust.length) { lines.push(''); lines.push('👥 ลูกค้า (' + cust.length + ')'); lines.push(formatTopList_(cust, 5, true)); }
  const prod = sortedEntries_(sumBy_(rows.filter(function (r) { return r.product; }), 'product'));
  if (prod.length) { lines.push(''); lines.push('📦 สินค้า'); lines.push(formatTopList_(prod, 5, true)); }
  return lines.join('\n');
}
