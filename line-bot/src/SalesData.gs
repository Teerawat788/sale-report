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
const TARGET_HEADERS = ['เดือน (yyyy-mm)', 'ทีม', 'เซลส์ (ว่าง = เป้าทั้งทีม)', 'เป้า (ตัน)'];

/** ชื่อคอลัมน์ที่ยอมรับจากไฟล์ export (ไม่สนตัวพิมพ์/ช่องว่าง/วงเล็บ) */
const COLUMN_ALIASES = {
  date: ['วันที่', 'date', 'วันที่ขาย', 'วันที่เอกสาร', 'invoicedate', 'billingdate', 'docdate', 'documentdate', 'postingdate', 'salesdate', 'day'],
  team: ['ทีม', 'team', 'salesteam', 'เขต', 'zone', 'region', 'area', 'ภาค', 'division', 'salesgroup', 'salesoffice'],
  sales: ['เซลส์', 'sales', 'salesname', 'salesman', 'salesperson', 'salesrep', 'rep', 'พนักงานขาย', 'ผู้แทนขาย', 'ชื่อเซลส์', 'ชื่อพนักงานขาย', 'employee'],
  customer: ['ลูกค้า', 'customer', 'customername', 'ชื่อลูกค้า', 'soldto', 'soldtoname', 'ร้าน', 'ฟาร์ม', 'dealer', 'shipto', 'shiptoname'],
  product: ['สินค้า', 'product', 'productname', 'material', 'materialdescription', 'materialname', 'item', 'itemname', 'sku', 'ชื่อสินค้า', 'brand'],
  ton: ['ตัน', 'ton', 'tons', 'tonnage', 'qtyton', 'quantityton', 'sumofton', 'ปริมาณตัน', 'ยอดตัน', 'volume', 'kg', 'กก', 'กิโลกรัม', 'qty', 'quantity', 'ปริมาณ'],
  amount: ['ยอดเงิน', 'amount', 'salesamount', 'netamount', 'netsales', 'revenue', 'value', 'บาท', 'มูลค่า', 'ยอดขายบาท'],
};

function normHeader_(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase().replace(/[\s_\-().\/:\[\]]/g, '');
}

/** หาว่าคอลัมน์ไหนคืออะไร → { date: 0, ton: 5, ... } */
function mapColumns_(header) {
  const h = header.map(normHeader_);
  const map = {};
  const used = {};
  const keys = ['date', 'ton', 'amount', 'customer', 'product', 'team', 'sales'];
  // รอบ 1: ตรงทั้งคำ  รอบ 2: มีคำนั้นอยู่ในชื่อคอลัมน์
  [true, false].forEach(function (exact) {
    keys.forEach(function (key) {
      if (map[key] !== undefined) return;
      const aliases = COLUMN_ALIASES[key].map(normHeader_);
      const idx = h.findIndex(function (x, i) {
        if (used[i] || !x) return false;
        return exact ? aliases.indexOf(x) >= 0
          : aliases.some(function (a) { return a.length >= 3 && x.indexOf(a) >= 0; });
      });
      if (idx >= 0) { map[key] = idx; used[idx] = true; }
    });
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
  return String(v === null || v === undefined ? '' : v).trim();
}

/** ตาราง 2 มิติ (มีหัวตาราง) → { rows, columns, header } */
function rowsFromTable_(table) {
  let headerIdx = -1;
  let map = null;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const m = mapColumns_(table[i]);
    if (m.date !== undefined && m.ton !== undefined) { headerIdx = i; map = m; break; }
  }
  if (headerIdx < 0) {
    const seen = (table[0] || []).filter(function (x) { return x !== ''; }).join(', ');
    throw new Error('ไม่พบคอลัมน์ "วันที่" และ "ตัน" ในไฟล์ (คอลัมน์ที่เจอ: ' + truncate_(seen, 200) + ')');
  }
  const header = table[headerIdx];
  const tonHeader = normHeader_(header[map.ton]);
  const divisor = /kg|กก|กิโล/.test(tonHeader) ? 1000 : 1;
  const body = table.slice(headerIdx + 1);
  const order = detectDateOrder_(body.map(function (r) { return r[map.date]; }));
  const rows = [];
  body.forEach(function (r) {
    const date = parseSheetDate_(r[map.date], order);
    const ton = parseNumber_(r[map.ton]);
    if (!date || isNaN(ton)) return; // แถวรวม/แถวว่าง
    const amount = map.amount !== undefined ? parseNumber_(r[map.amount]) : NaN;
    rows.push({
      date: date,
      team: map.team !== undefined ? cleanText_(r[map.team]) : '',
      sales: map.sales !== undefined ? cleanText_(r[map.sales]) : '',
      customer: map.customer !== undefined ? cleanText_(r[map.customer]) : '',
      product: map.product !== undefined ? cleanText_(r[map.product]) : '',
      ton: ton / divisor,
      amount: isNaN(amount) ? null : amount,
    });
  });
  return { rows: rows, columns: map, header: header };
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

function importTable_(table) {
  const parsed = rowsFromTable_(table);
  if (!parsed.rows.length) throw new Error('ไฟล์ไม่มีแถวยอดขายที่อ่านได้');
  const r = replaceSalesRows_(parsed.rows);
  r.missing = ['team', 'sales', 'customer', 'product'].filter(function (k) { return parsed.columns[k] === undefined; });
  return r;
}

const MISSING_LABEL = { team: 'ทีม', sales: 'เซลส์', customer: 'ลูกค้า', product: 'สินค้า' };

function formatImportResult_(r, fileName) {
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
function importSalesFromDrive_(force) {
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
  const r = importTable_(readDriveTable_(latest));
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
  sheet_(TARGET_SHEET, TARGET_HEADERS);
}

// ---------------------------------------------------------------- อ่าน + คำนวณ

function readSalesRows_() {
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

/** { team: {ชื่อทีม: ตัน}, sales: {ชื่อเซลส์: ตัน}, salesTeam: {ชื่อเซลส์: ทีม} } ของเดือนนั้น */
function readTargets_(mKey) {
  const out = { team: {}, sales: {}, salesTeam: {} };
  const sh = spreadsheet_().getSheetByName(TARGET_SHEET);
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(function (v) {
    if (normMonthKey_(v[0]) !== mKey) return;
    const t = parseNumber_(v[3]);
    if (isNaN(t)) return;
    const team = cleanText_(v[1]);
    const sales = cleanText_(v[2]);
    if (sales) { out.sales[sales] = (out.sales[sales] || 0) + t; if (team) out.salesTeam[sales] = team; }
    else if (team) out.team[team] = (out.team[team] || 0) + t;
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

function sumBy_(rows, key) {
  const m = {};
  rows.forEach(function (r) {
    const k = r[key] || '(ไม่ระบุ)';
    m[k] = (m[k] || 0) + r.ton;
  });
  return m;
}

function sortedEntries_(m) {
  return Object.keys(m).map(function (k) { return { name: k, ton: m[k] }; })
    .sort(function (a, b) { return b.ton - a.ton; });
}

function pctOrNull_(a, b) {
  return b ? (a / b) * 100 : null;
}

/** สร้าง snapshot แบบเดียวกับ dashboard.json จากแถวยอดขาย */
function buildSalesSnapshot_(rows, now, targetsFn) {
  const today = startOfDay_(now);
  const usable = rows.filter(function (r) { return r.date <= today; });
  if (!usable.length) return null;
  const asOf = usable.reduce(function (m, r) { return r.date > m ? r.date : m; }, usable[0].date);
  const mKey = monthKey_(asOf);
  const monthRows = usable.filter(function (r) { return monthKey_(r.date) === mKey; });
  const lastRows = monthRows.filter(function (r) { return r.date.getTime() === asOf.getTime(); });
  const targets = (targetsFn || readTargets_)(mKey);
  const wd = workingDays_(asOf);

  // ทีมของเซลส์: จากข้อมูลยอด ไม่มีก็จากแท็บ Targets
  const salesTeam = {};
  monthRows.forEach(function (r) { if (r.sales && r.team) salesTeam[r.sales] = r.team; });
  Object.keys(targets.salesTeam).forEach(function (s) { if (!salesTeam[s]) salesTeam[s] = targets.salesTeam[s]; });

  const bySales = sumBy_(monthRows.filter(function (r) { return r.sales; }), 'sales');
  Object.keys(targets.sales).forEach(function (s) { if (!(s in bySales)) bySales[s] = 0; });
  const salesList = sortedEntries_(bySales).map(function (e) {
    const budget = targets.sales[e.name] || null;
    return { name: e.name, team: salesTeam[e.name] || '', actualTon: e.ton, budgetTon: budget, achievement: pctOrNull_(e.ton, budget) };
  });

  const byTeam = sumBy_(monthRows.filter(function (r) { return r.team; }), 'team');
  Object.keys(targets.team).forEach(function (t) { if (!(t in byTeam)) byTeam[t] = 0; });
  const teamBudget = {};
  Object.keys(byTeam).forEach(function (t) {
    if (targets.team[t]) { teamBudget[t] = targets.team[t]; return; }
    const sum = salesList.filter(function (s) { return s.team === t && s.budgetTon; })
      .reduce(function (a, s) { return a + s.budgetTon; }, 0);
    teamBudget[t] = sum || null;
  });
  const teams = Object.keys(byTeam).sort().map(function (t) {
    return { name: t, actualTon: byTeam[t], budgetTon: teamBudget[t], achievement: pctOrNull_(byTeam[t], teamBudget[t]) };
  });

  const actual = monthRows.reduce(function (a, r) { return a + r.ton; }, 0);
  let budget = teams.reduce(function (a, t) { return a + (t.budgetTon || 0); }, 0);
  if (!budget) budget = salesList.reduce(function (a, s) { return a + (s.budgetTon || 0); }, 0);
  budget = budget || null;
  const currentSpeed = actual / wd.passed;
  const remain = wd.total - wd.passed;
  const forecast = currentSpeed * wd.total;

  return {
    source: 'sheet',
    date: pad2_(asOf.getDate()) + '/' + pad2_(asOf.getMonth() + 1) + '/' + asOf.getFullYear(),
    asOf: asOf,
    monthKey: mKey,
    workingDaysPassed: wd.passed,
    workingDaysTotal: wd.total,
    total: {
      actualTon: actual,
      budgetTon: budget,
      achievement: pctOrNull_(actual, budget),
      forecastTon: forecast,
      gapTon: budget ? forecast - budget : undefined,
      currentSpeed: currentSpeed,
      requiredSpeed: budget ? (remain > 0 ? Math.max(0, (budget - actual) / remain) : 0) : undefined,
    },
    teams: teams,
    salesList: salesList,
    monthRows: monthRows,
    lastDay: {
      date: asOf,
      total: lastRows.reduce(function (a, r) { return a + r.ton; }, 0),
      byTeam: sortedEntries_(sumBy_(lastRows, 'team')),
      bySales: sortedEntries_(sumBy_(lastRows.filter(function (r) { return r.sales; }), 'sales')),
      byCustomer: sortedEntries_(sumBy_(lastRows.filter(function (r) { return r.customer; }), 'customer')),
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

function formatLastDay_(snap) {
  const ld = snap.lastDay;
  const lines = ['📅 ยอดขายวันที่ ' + fmtDate_(ld.date) + ': ' + fmtNum_(ld.total) + ' ตัน'];
  if (ld.byTeam.length > 1 || (ld.byTeam[0] && ld.byTeam[0].name !== '(ไม่ระบุ)')) {
    lines.push(ld.byTeam.map(function (t) { return t.name + ' ' + fmtNum_(t.ton); }).join(' | '));
  }
  if (ld.bySales.length) { lines.push(''); lines.push('🏅 เซลส์'); lines.push(formatTopList_(ld.bySales, 10, true)); }
  if (ld.byCustomer.length) { lines.push(''); lines.push('👥 ลูกค้า'); lines.push(formatTopList_(ld.byCustomer, 5, true)); }
  lines.push('');
  lines.push('สะสมเดือนนี้ ' + tonVsTarget_(snap.total.actualTon, snap.total.budgetTon, snap.total.achievement));
  return lines.join('\n');
}

function formatTopBy_(snap, key, title, n) {
  const rows = snap.monthRows.filter(function (r) { return r[key]; });
  if (!rows.length) return 'ข้อมูลยอดขายไม่มีคอลัมน์' + (key === 'customer' ? 'ลูกค้า' : 'สินค้า');
  const entries = sortedEntries_(sumBy_(rows, key));
  return title + ' เดือนนี้ (ถึง ' + fmtDate_(snap.asOf) + ') ทั้งหมด ' + entries.length + (key === 'customer' ? ' ราย' : ' รายการ') + '\n' +
    formatTopList_(entries, n || 10, true);
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
    'วันล่าสุด: ' + fmtNum_(last) + ' ตัน'];
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
