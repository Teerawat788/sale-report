/** เก็บข้อมูลใน Google Sheet: แท็บ Tasks และ Weekly (สร้างให้อัตโนมัติ) */

const TASK_SHEET = 'Tasks';
const TASK_HEADERS = ['ID', 'งาน', 'ผู้รับผิดชอบ', 'userIds', 'กำหนดส่ง', 'สถานะ',
  'สร้างโดย', 'สร้างเมื่อ', 'เสร็จเมื่อ', 'ปิดโดย'];
const WEEKLY_SHEET = 'Weekly';
const WEEKLY_HEADERS = ['ID', 'รายการ', 'วันกำหนด (0=อา..6=ส, ว่าง=ภายในสัปดาห์)',
  'ผู้รับผิดชอบ', 'userIds', 'ใช้งาน', 'สัปดาห์ที่ทำแล้ว', 'ทำโดย', 'ทำเมื่อ'];

const STATUS_OPEN = 'ค้าง';
const STATUS_DONE = 'เสร็จ';

function spreadsheet_() {
  const id = prop_('SHEET_ID', '');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name, headers) {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** คืน [{row, v: [...]}] ไม่รวมหัวตาราง */
function rows_(sh) {
  const values = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) continue;
    out.push({ row: i + 1, v: values[i] });
  }
  return out;
}

function nextId_(sh) {
  return rows_(sh).reduce(function (max, r) { return Math.max(max, Number(r.v[0]) || 0); }, 0) + 1;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function splitIds_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

/** รวมผู้รับผิดชอบจาก @mention จริง + @ชื่อที่พิมพ์เอง; ไม่มีเลย = ผู้สั่ง */
function resolveOwners_(mentions, names, sender) {
  const owners = mentions.slice();
  names.forEach(function (n) {
    if (!owners.some(function (o) { return o.name === n; })) owners.push({ userId: '', name: n });
  });
  if (!owners.length && sender) owners.push(sender);
  return owners;
}
