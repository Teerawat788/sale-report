// ===== บอท LINE ผู้ช่วยทีมขาย — สร้างจาก line-bot/src ด้วย `npm run build` (อย่าแก้ไฟล์นี้โดยตรง) =====

// ---------- Config.gs ----------
/**
 * การตั้งค่าบอท — ค่าที่เป็นความลับ/เปลี่ยนบ่อยเก็บใน Script Properties
 * (Project Settings > Script Properties) ดูรายละเอียดใน README.md
 *
 *  LINE_CHANNEL_ACCESS_TOKEN  (จำเป็น) token ของ Messaging API channel
 *  BOT_USER_ID                (แนะนำ)  Bot user ID (Uxxxx) ใช้กรอง webhook ปลอม
 *  GROUP_ID                   ตั้งให้อัตโนมัติเมื่อพิมพ์ "ลงทะเบียน" ในกลุ่ม
 *  SHEET_ID                   ว่างได้ถ้าสคริปต์ผูกกับ Google Sheet
 *  CALENDAR_ID                ว่าง = ปฏิทินหลักของเจ้าของสคริปต์
 *  DASHBOARD_URL              URL ของ dashboard.json
 *  MORNING_HOUR               ชั่วโมงส่งสรุปเช้า (ค่าเริ่มต้น 7)
 *  WORK_DAYS                  วันทำงาน 0=อา..6=ส (ค่าเริ่มต้น 1,2,3,4,5,6)
 *  BRIEF_ENABLED / REVIEW_ENABLED / REMINDER_ENABLED  true|false
 *  REMIND_BEFORE_MIN          เตือนก่อนนัดกี่นาที (ค่าเริ่มต้น 30)
 *  IMPORT_FOLDER_ID           โฟลเดอร์ Google Drive ที่วางไฟล์ export จาก Power BI
 *  HOLIDAYS                   วันหยุดที่ไม่นับเป็นวันทำงาน เช่น 5/12,10/12,31/12
 *  DATE_ORDER                 DMY (ค่าเริ่มต้น) หรือ MDY ถ้าเดาจากไฟล์ไม่ได้
 */
const CONFIG = {
  DASHBOARD_URL: 'https://raw.githubusercontent.com/teerawat788/sale-report/main/dashboard.json',
  DASHBOARD_PAGE: 'https://teerawat788.github.io/sale-report/',
  EVENT_DEFAULT_MINUTES: 60,
  REMIND_BEFORE_MIN: 30,
  MORNING_HOUR: 7,
  REVIEW_DAY: 5,      // ศุกร์
  REVIEW_HOUR: 16,
  WORK_DAYS: '1,2,3,4,5,6',
};

function prop_(key, def) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === undefined || v === '' ? def : v;
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

function flag_(key, def) {
  return String(prop_(key, def === undefined ? 'true' : String(def))).toLowerCase() === 'true';
}

/** แยกไว้เป็นฟังก์ชันเพื่อให้ทดสอบโดยกำหนดเวลาได้ */
function now_() {
  return new Date();
}

// ---------- Util.gs ----------
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

// ---------- Parser.gs ----------
/** แปลงข้อความในกลุ่มเป็นคำสั่ง (ไม่เรียก Google service — ทดสอบได้) */

const COMMANDS = {
  help: ['เมนู', 'คำสั่ง', 'ช่วยเหลือ', 'help', '?'],
  register: ['ลงทะเบียน', 'register'],
  whoami: ['ไอดี', 'myid'],
  sales: ['ยอด', 'สรุปยอด', 'ยอดขาย', 'sales'],
  salesday: ['ยอดเมื่อวาน', 'ยอดล่าสุด', 'ยอดรายวัน'],
  salesrank: ['ยอดเซลส์', 'อันดับเซลส์', 'ranking'],
  salescust: ['ยอดลูกค้า', 'ลูกค้าท็อป'],
  salesprod: ['ยอดสินค้า', 'สินค้าท็อป'],
  importsales: ['อัปเดตยอด', 'ดึงยอด'],
  tasks: ['งาน', 'งานค้าง', 'tasks'],
  mytasks: ['งานฉัน', 'งานของฉัน', 'mytasks'],
  addtask: ['งาน+', '+งาน', 'เพิ่มงาน', 'task+'],
  done: ['เสร็จ', 'ปิดงาน', 'done'],
  deltask: ['ลบงาน'],
  movetask: ['เลื่อน', 'เลื่อนงาน'],
  today: ['วันนี้', 'นัด', 'นัดวันนี้', 'agenda'],
  tomorrow: ['พรุ่งนี้', 'นัดพรุ่งนี้'],
  week: ['สัปดาห์นี้', 'นัดสัปดาห์นี้', 'week'],
  addevent: ['นัด+', '+นัด', 'เพิ่มนัด'],
  weekly: ['ประจำ', 'งานประจำ', 'weekly'],
  addweekly: ['ประจำ+', '+ประจำ', 'เพิ่มประจำ'],
  weeklydone: ['เช็ค', 'เช็ก', 'ประจำเสร็จ'],
  delweekly: ['ลบประจำ'],
  brief: ['สรุปเช้า', 'สรุปวันนี้', 'brief'],
  review: ['สรุปสัปดาห์', 'review'],
};

/** คำสั่งที่ต้องพิมพ์โดด ๆ (กันบอทตอบแชทปกติ เช่น "วันนี้ ไปไหนกัน") */
const NO_ARG_COMMANDS = ['help', 'register', 'whoami', 'tasks', 'mytasks', 'today',
  'tomorrow', 'week', 'weekly', 'brief', 'review', 'salesday', 'salesrank', 'salescust',
  'salesprod', 'importsales'];

const ALIAS_TO_CMD = (function () {
  const m = {};
  Object.keys(COMMANDS).forEach(function (cmd) {
    COMMANDS[cmd].forEach(function (a) { m[a.toLowerCase()] = cmd; });
  });
  return m;
})();

/**
 * ตัด @mention ออกจากข้อความตามตำแหน่งที่ LINE ส่งมา
 * คืน { text, mentions: [{userId, name}] } (ไม่รวมการ mention ตัวบอทเอง)
 */
function stripMentions_(text, mention) {
  const list = (mention && mention.mentionees) ? mention.mentionees.slice() : [];
  list.sort(function (a, b) { return b.index - a.index; });
  const mentions = [];
  let out = text;
  list.forEach(function (m) {
    const raw = text.substr(m.index, m.length);
    out = out.slice(0, m.index) + ' ' + out.slice(m.index + m.length);
    if (m.isSelf || m.type === 'all') return;
    mentions.unshift({ userId: m.userId || '', name: raw.replace(/^@/, '').trim() });
  });
  return { text: out.replace(/\s+/g, ' ').trim(), mentions: mentions };
}

/** คืน { cmd, args: string[], argText } หรือ null ถ้าไม่ใช่คำสั่ง */
function parseCommand_(text) {
  let t = String(text || '').trim();
  if (!t) return null;
  t = t.replace(/^[\/!]/, '');
  let tokens = t.split(/\s+/);
  // รองรับ "งาน +", "นัด +", "ประจำ +"
  if (tokens.length > 1 && tokens[1] === '+' && ALIAS_TO_CMD[tokens[0] + '+']) {
    tokens = [tokens[0] + '+'].concat(tokens.slice(2));
  }
  const cmd = ALIAS_TO_CMD[tokens[0].toLowerCase()];
  if (!cmd) return null;
  const args = tokens.slice(1);
  if (NO_ARG_COMMANDS.indexOf(cmd) >= 0 && args.length) return null;
  // "ยอด <ทีม/ชื่อเซลส์>" — ถ้าหาไม่เจอบอทจะเงียบ (กันตอบแชทปกติ)
  if (cmd === 'sales' && args.length > 3) return null;
  if ((cmd === 'done' || cmd === 'deltask' || cmd === 'weeklydone' || cmd === 'delweekly') &&
      !(args.length && args.every(function (a) { return /^#?\d+$/.test(a); }))) return null;
  return { cmd: cmd, args: args, argText: args.join(' ') };
}

function parseIds_(args) {
  return args.map(function (a) { return Number(String(a).replace('#', '')); })
    .filter(function (n) { return n > 0; });
}

const DAY_ALIASES = {
  'อาทิตย์': 0, 'จันทร์': 1, 'อังคาร': 2, 'พุธ': 3, 'พฤหัส': 4, 'พฤหัสบดี': 4,
  'ศุกร์': 5, 'เสาร์': 6,
  'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
};
const DAY_SHORT_ALIASES = { 'อา': 0, 'จ': 1, 'อ': 2, 'พ': 3, 'พฤ': 4, 'ศ': 5, 'ส': 6 };

/** "จันทร์", "วันศุกร์หน้า", "พฤ." → { dow, nextWeek } */
function parseDayName_(tok, allowShort) {
  let t = String(tok).toLowerCase().replace(/\.$/, '');
  let nextWeek = false;
  t = t.replace(/^วัน(?=.)/, '');
  if (/หน้า$/.test(t)) { nextWeek = true; t = t.replace(/หน้า$/, ''); }
  t = t.replace(/นี้$/, '');
  if (DAY_ALIASES.hasOwnProperty(t)) return { dow: DAY_ALIASES[t], nextWeek: nextWeek };
  if (allowShort && DAY_SHORT_ALIASES.hasOwnProperty(t)) return { dow: DAY_SHORT_ALIASES[t], nextWeek: nextWeek };
  return null;
}

/** แปลงคำบอกวันเป็น Date (00:00) หรือ null */
function parseDateToken_(tok, now) {
  const t = String(tok).trim().toLowerCase();
  const today = startOfDay_(now);
  if (t === 'วันนี้' || t === 'today') return today;
  if (t === 'พรุ่งนี้' || t === 'tomorrow') return addDays_(today, 1);
  if (t === 'มะรืน' || t === 'มะรืนนี้') return addDays_(today, 2);

  const day = parseDayName_(t, false);
  if (day) {
    const diff = (day.dow - today.getDay() + 7) % 7;
    return addDays_(today, diff + (day.nextWeek ? 7 : 0));
  }

  const m = t.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    let yyyy;
    if (m[3]) {
      yyyy = Number(m[3]);
      if (yyyy < 100) yyyy += yyyy >= 50 ? 2500 : 2000; // 69 → 2569, 26 → 2026
      if (yyyy > 2400) yyyy -= 543;                    // พ.ศ. → ค.ศ.
    } else {
      yyyy = today.getFullYear();
    }
    let d = new Date(yyyy, mm, dd);
    if (d.getMonth() !== mm || d.getDate() !== dd) return null;
    if (!m[3] && dayDiff_(d, today) < -31) d = new Date(yyyy + 1, mm, dd);
    return d;
  }
  return null;
}

/** "14:00", "9.30น.", "14:00-15:30", "14น." → { h, m, endH?, endM? } */
function parseTimeToken_(tok) {
  const t = String(tok).trim().replace(/\s/g, '').replace(/น\.?$/, '');
  const hm = '(\\d{1,2})(?:[:.](\\d{2}))?';
  const m = t.match(new RegExp('^' + hm + '(?:-' + hm + ')?$'));
  if (!m) return null;
  // ตัวเลขโดด ๆ เช่น "3" ไม่ถือเป็นเวลา (ยกเว้นมี "น." หรือ ":")
  if (m[2] === undefined && m[3] === undefined && !/น\.?$/.test(String(tok).trim())) return null;
  const r = { h: Number(m[1]), m: Number(m[2] || 0) };
  if (m[3] !== undefined) { r.endH = Number(m[3]); r.endM = Number(m[4] || 0); }
  if (r.h > 23 || r.m > 59 || (r.endH !== undefined && (r.endH > 23 || r.endM > 59))) return null;
  return r;
}

/** "ส่งใบเสนอราคา ฟาร์ม A พรุ่งนี้ @สมชาย" → { text, due, names } */
function parseTaskInput_(argText, now) {
  const tokens = String(argText || '').split(/\s+/).filter(Boolean);
  let due = null;
  const words = [];
  const names = [];
  tokens.forEach(function (tok) {
    if (/^@\S+/.test(tok)) { names.push(tok.slice(1)); return; }
    if (!due) {
      const d = parseDateToken_(tok, now);
      if (d) { due = d; return; }
    }
    words.push(tok);
  });
  return { text: words.join(' '), due: due, names: names };
}

/** "25/11 14:00-15:00 เยี่ยมฟาร์มคุณสมชาย" → { title, start, end, allDay } */
function parseEventInput_(argText, now) {
  const tokens = String(argText || '').split(/\s+/).filter(Boolean);
  let date = null;
  let time = null;
  const words = [];
  tokens.forEach(function (tok) {
    if (!date) {
      const d = parseDateToken_(tok, now);
      if (d) { date = d; return; }
    }
    if (!time) {
      const t = parseTimeToken_(tok);
      if (t) { time = t; return; }
    }
    words.push(tok);
  });
  if (!words.length) return null;
  const day = date || startOfDay_(now);
  if (!time) return { title: words.join(' '), start: day, end: addDays_(day, 1), allDay: true };
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.h, time.m);
  let end = time.endH !== undefined
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.endH, time.endM)
    : new Date(start.getTime() + CONFIG.EVENT_DEFAULT_MINUTES * 60000);
  if (end <= start) end = new Date(start.getTime() + CONFIG.EVENT_DEFAULT_MINUTES * 60000);
  return { title: words.join(' '), start: start, end: end, allDay: false };
}

/** "จันทร์ ส่งรายงาน @สมชาย" → { dow ('' = ภายในสัปดาห์), text, names } */
function parseWeeklyInput_(argText) {
  const tokens = String(argText || '').split(/\s+/).filter(Boolean);
  let dow = '';
  if (tokens.length) {
    const d = parseDayName_(tokens[0], true);
    if (d) { dow = d.dow; tokens.shift(); }
    else if (tokens[0] === 'ทุกวัน' || tokens[0] === 'สัปดาห์' || tokens[0] === 'ทุกสัปดาห์') tokens.shift();
  }
  const names = [];
  const words = [];
  tokens.forEach(function (tok) {
    if (/^@\S+/.test(tok)) names.push(tok.slice(1)); else words.push(tok);
  });
  return { dow: dow, text: words.join(' '), names: names };
}

// ---------- Line.gs ----------
/** เรียก LINE Messaging API */

const LINE_API = 'https://api.line.me/v2/bot';
const LINE_TEXT_MAX = 4900;

function lineFetch_(path, method, payload) {
  const token = prop_('LINE_CHANNEL_ACCESS_TOKEN', '');
  if (!token) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน Script Properties');
  const opts = {
    method: method,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  };
  if (payload) {
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch(LINE_API + path, opts);
  const code = res.getResponseCode();
  if (code >= 300) console.error('LINE API ' + path + ' ' + code + ': ' + res.getContentText());
  return { code: code, body: res.getContentText() };
}

/** ข้อความยาวเกินจะถูกแบ่งเป็นหลายบับเบิล (สูงสุด 5) */
function toMessages_(input) {
  const items = Array.isArray(input) ? input : [input];
  const out = [];
  items.forEach(function (it) {
    if (typeof it !== 'string') { out.push(it); return; }
    let rest = it;
    while (rest.length > LINE_TEXT_MAX) {
      let cut = rest.lastIndexOf('\n', LINE_TEXT_MAX);
      if (cut < LINE_TEXT_MAX / 2) cut = LINE_TEXT_MAX;
      out.push({ type: 'text', text: rest.slice(0, cut) });
      rest = rest.slice(cut).replace(/^\n/, '');
    }
    if (rest) out.push({ type: 'text', text: rest });
  });
  return out.slice(0, 5);
}

/** ตอบกลับ (reply ไม่นับโควตาข้อความ) */
function lineReply_(replyToken, messages) {
  return lineFetch_('/message/reply', 'post', { replyToken: replyToken, messages: toMessages_(messages) });
}

/** ส่งหาแบบ push (นับโควตาข้อความของ LINE OA ตามจำนวนสมาชิกในกลุ่ม) */
function linePush_(to, messages) {
  if (!to) { console.warn('ไม่มีปลายทาง push — พิมพ์ "ลงทะเบียน" ในกลุ่มก่อน'); return null; }
  return lineFetch_('/message/push', 'post', { to: to, messages: toMessages_(messages) });
}

/** ชื่อที่แสดงของผู้ส่ง (cache 6 ชม.) */
function lineDisplayName_(source) {
  if (!source || !source.userId) return 'ไม่ทราบชื่อ';
  const cache = CacheService.getScriptCache();
  const key = 'name_' + source.userId;
  const hit = cache.get(key);
  if (hit) return hit;
  let path = '/profile/' + source.userId;
  if (source.type === 'group') path = '/group/' + source.groupId + '/member/' + source.userId;
  if (source.type === 'room') path = '/room/' + source.roomId + '/member/' + source.userId;
  const res = lineFetch_(path, 'get');
  let name = 'สมาชิก';
  if (res.code === 200) {
    try { name = JSON.parse(res.body).displayName || name; } catch (e) { /* ignore */ }
  }
  cache.put(key, name, 21600);
  return name;
}

/** ปุ่มลัดใต้ข้อความ */
function withQuickReply_(text, labels) {
  return {
    type: 'text',
    text: text,
    quickReply: {
      items: labels.map(function (l) {
        return { type: 'action', action: { type: 'message', label: l, text: l } };
      }),
    },
  };
}

/** รันจาก editor ครั้งเดียว: ดู Bot user ID แล้วบันทึกเป็น BOT_USER_ID ให้อัตโนมัติ */
function showBotInfo() {
  const res = lineFetch_('/info', 'get');
  console.log(res.body);
  if (res.code === 200) {
    const info = JSON.parse(res.body);
    setProp_('BOT_USER_ID', info.userId);
    console.log('บันทึก BOT_USER_ID = ' + info.userId + ' (' + info.displayName + ')');
  }
}

// ---------- Store.gs ----------
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

// ---------- Tasks.gs ----------
/** งานติดตาม (follow-up tasks) */

function taskFromRow_(r) {
  const v = r.v;
  return {
    row: r.row,
    id: Number(v[0]),
    text: String(v[1]),
    owner: String(v[2] || ''),
    ownerIds: splitIds_(v[3]),
    due: toDate_(v[4]),
    status: String(v[5] || STATUS_OPEN),
    createdBy: String(v[6] || ''),
    createdAt: toDate_(v[7]),
    doneAt: toDate_(v[8]),
    doneBy: String(v[9] || ''),
  };
}

function getTasks_() {
  return rows_(sheet_(TASK_SHEET, TASK_HEADERS)).map(taskFromRow_);
}

function openTasks_() {
  return getTasks_().filter(function (t) { return t.status !== STATUS_DONE; });
}

function addTask_(text, due, owners, createdBy) {
  return withLock_(function () {
    const sh = sheet_(TASK_SHEET, TASK_HEADERS);
    const id = nextId_(sh);
    sh.appendRow([
      id, text,
      owners.map(function (o) { return o.name; }).join(', '),
      owners.map(function (o) { return o.userId; }).filter(Boolean).join(','),
      due || '', STATUS_OPEN, createdBy, now_(), '', '',
    ]);
    return id;
  });
}

/** คืน { done: [task], missing: [id] } */
function completeTasks_(ids, byName) {
  return withLock_(function () {
    const sh = sheet_(TASK_SHEET, TASK_HEADERS);
    const tasks = rows_(sh).map(taskFromRow_);
    const done = [];
    const missing = [];
    ids.forEach(function (id) {
      const t = tasks.find(function (x) { return x.id === id; });
      if (!t || t.status === STATUS_DONE) { missing.push(id); return; }
      sh.getRange(t.row, 6).setValue(STATUS_DONE);
      sh.getRange(t.row, 9).setValue(now_());
      sh.getRange(t.row, 10).setValue(byName);
      done.push(t);
    });
    return { done: done, missing: missing };
  });
}

function deleteTask_(id) {
  return withLock_(function () {
    const sh = sheet_(TASK_SHEET, TASK_HEADERS);
    const t = rows_(sh).map(taskFromRow_).find(function (x) { return x.id === id; });
    if (!t) return null;
    sh.deleteRow(t.row);
    return t;
  });
}

function rescheduleTask_(id, due) {
  return withLock_(function () {
    const sh = sheet_(TASK_SHEET, TASK_HEADERS);
    const t = rows_(sh).map(taskFromRow_).find(function (x) { return x.id === id; });
    if (!t) return null;
    sh.getRange(t.row, 5).setValue(due);
    t.due = due;
    return t;
  });
}

function sortTasks_(tasks) {
  return tasks.slice().sort(function (a, b) {
    if (a.due && b.due) return a.due - b.due || a.id - b.id;
    if (a.due) return -1;
    if (b.due) return 1;
    return a.id - b.id;
  });
}

function formatTaskLine_(t, now) {
  return '#' + t.id + ' ' + t.text + (t.owner ? ' — ' + t.owner : '') + ' (' + dueLabel_(t.due, now) + ')';
}

function formatTaskList_(title, tasks, now, max) {
  if (!tasks.length) return title + '\nไม่มีงานค้าง 🎉';
  const limit = max || 30;
  const sorted = sortTasks_(tasks);
  const lines = sorted.slice(0, limit).map(function (t) { return '• ' + formatTaskLine_(t, now); });
  if (sorted.length > limit) lines.push('…และอีก ' + (sorted.length - limit) + ' งาน');
  const overdue = tasks.filter(function (t) { return t.due && dayDiff_(t.due, now) < 0; }).length;
  return title + ' ' + tasks.length + ' งาน' + (overdue ? ' (เลยกำหนด ' + overdue + ')' : '') + '\n' + lines.join('\n');
}

function isMine_(t, user) {
  if (user.userId && t.ownerIds.indexOf(user.userId) >= 0) return true;
  const names = t.owner.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  // เทียบชื่อเฉพาะงานที่มีผู้รับผิดชอบแบบพิมพ์ชื่อเอง (ไม่มี userId ครบทุกคน)
  if (t.ownerIds.length >= names.length) return false;
  return !!user.name && names.indexOf(user.name) >= 0;
}

// ---------- Weekly.gs ----------
/** งานติดตามประจำสัปดาห์ (เช็กลิสต์ที่วนทุกสัปดาห์) */

function weeklyFromRow_(r) {
  const v = r.v;
  const dowRaw = v[2];
  return {
    row: r.row,
    id: Number(v[0]),
    text: String(v[1]),
    dow: dowRaw === '' || dowRaw === null ? '' : Number(dowRaw),
    owner: String(v[3] || ''),
    ownerIds: splitIds_(v[4]),
    active: String(v[5]).toUpperCase() !== 'FALSE' && v[5] !== false,
    doneWeek: String(v[6] || ''),
    doneBy: String(v[7] || ''),
  };
}

function getWeekly_() {
  return rows_(sheet_(WEEKLY_SHEET, WEEKLY_HEADERS)).map(weeklyFromRow_)
    .filter(function (w) { return w.active; });
}

function addWeekly_(text, dow, owners) {
  return withLock_(function () {
    const sh = sheet_(WEEKLY_SHEET, WEEKLY_HEADERS);
    const id = nextId_(sh);
    sh.appendRow([
      id, text, dow,
      owners.map(function (o) { return o.name; }).join(', '),
      owners.map(function (o) { return o.userId; }).filter(Boolean).join(','),
      true, '', '', '',
    ]);
    return id;
  });
}

function checkWeekly_(ids, byName) {
  return withLock_(function () {
    const sh = sheet_(WEEKLY_SHEET, WEEKLY_HEADERS);
    const items = rows_(sh).map(weeklyFromRow_);
    const week = isoWeekKey_(now_());
    const done = [];
    const missing = [];
    ids.forEach(function (id) {
      const w = items.find(function (x) { return x.id === id && x.active; });
      if (!w) { missing.push(id); return; }
      sh.getRange(w.row, 7).setValue(week);
      sh.getRange(w.row, 8).setValue(byName);
      sh.getRange(w.row, 9).setValue(now_());
      done.push(w);
    });
    return { done: done, missing: missing };
  });
}

function deleteWeekly_(id) {
  return withLock_(function () {
    const sh = sheet_(WEEKLY_SHEET, WEEKLY_HEADERS);
    const w = rows_(sh).map(weeklyFromRow_).find(function (x) { return x.id === id; });
    if (!w) return null;
    sh.deleteRow(w.row);
    return w;
  });
}

function weeklyDueLabel_(dow) {
  return dow === '' ? 'ภายในสัปดาห์' : 'ภายใน ' + TH_DAYS_SHORT[dow];
}

function isWeeklyDone_(w, now) {
  return w.doneWeek === isoWeekKey_(now);
}

/** งานประจำที่ยังไม่ทำ และถึง/เลยวันกำหนดของสัปดาห์นี้แล้ว */
function weeklyDueNow_(items, now) {
  const dayIdx = (now.getDay() + 6) % 7; // จ=0..อา=6
  return items.filter(function (w) {
    if (isWeeklyDone_(w, now) || w.dow === '') return false;
    return (w.dow + 6) % 7 <= dayIdx;
  });
}

function formatWeeklyList_(items, now) {
  const start = startOfWeek_(now);
  const head = '🔁 งานประจำสัปดาห์ (' + fmtDate_(start) + ' – ' + fmtDate_(addDays_(start, 6)) + ')';
  if (!items.length) return head + '\nยังไม่มีรายการ — เพิ่มด้วย "ประจำ+ จันทร์ ส่งรายงาน @ชื่อ"';
  const sorted = items.slice().sort(function (a, b) {
    const ka = a.dow === '' ? 99 : (a.dow + 6) % 7;
    const kb = b.dow === '' ? 99 : (b.dow + 6) % 7;
    return ka - kb || a.id - b.id;
  });
  const doneCount = items.filter(function (w) { return isWeeklyDone_(w, now); }).length;
  const lines = sorted.map(function (w) {
    const mark = isWeeklyDone_(w, now) ? '✅' : '⬜';
    return mark + ' #' + w.id + ' ' + w.text + (w.owner ? ' — ' + w.owner : '') + ' (' + weeklyDueLabel_(w.dow) + ')';
  });
  return head + ' ทำแล้ว ' + doneCount + '/' + items.length + '\n' + lines.join('\n') +
    '\nติ๊กว่าทำแล้ว: "เช็ค <เลข>"';
}

// ---------- Calendar.gs ----------
/** ปฏิทิน / agenda — ใช้ Google Calendar */

function calendar_() {
  const id = prop_('CALENDAR_ID', '');
  const cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('ไม่พบปฏิทิน CALENDAR_ID=' + id);
  return cal;
}

function getEvents_(start, end) {
  return calendar_().getEvents(start, end).map(function (ev) {
    return {
      id: ev.getId(),
      title: ev.getTitle(),
      start: toDate_(ev.getStartTime()),
      end: toDate_(ev.getEndTime()),
      allDay: ev.isAllDayEvent(),
      location: ev.getLocation() || '',
    };
  }).sort(function (a, b) { return (b.allDay - a.allDay) || (a.start - b.start); });
}

function createEvent_(ev, attendees, createdBy) {
  const cal = calendar_();
  const desc = 'สร้างจาก LINE โดย ' + createdBy +
    (attendees.length ? '\nผู้เกี่ยวข้อง: ' + attendees.map(function (a) { return a.name; }).join(', ') : '');
  const created = ev.allDay
    ? cal.createAllDayEvent(ev.title, ev.start, { description: desc })
    : cal.createEvent(ev.title, ev.start, ev.end, { description: desc });
  return created.getId();
}

function formatEventLine_(e) {
  const when = e.allDay ? 'ทั้งวัน' : fmtTime_(e.start) + '–' + fmtTime_(e.end);
  return '• ' + when + ' ' + e.title + (e.location ? ' 📍' + e.location : '');
}

function formatAgenda_(title, events, emptyText) {
  if (!events.length) return title + '\n' + (emptyText || 'ไม่มีนัด');
  return title + ' (' + events.length + ')\n' + events.map(formatEventLine_).join('\n');
}

/** agenda หลายวัน จัดกลุ่มตามวัน */
function formatAgendaDays_(title, events, from, days) {
  if (!events.length) return title + '\nไม่มีนัด';
  const out = [title + ' (' + events.length + ')'];
  for (let i = 0; i < days; i++) {
    const day = addDays_(from, i);
    const evs = events.filter(function (e) {
      const s = startOfDay_(e.start);
      const lastDay = e.allDay ? addDays_(startOfDay_(e.end), -1) : startOfDay_(e.end);
      return s <= day && day <= lastDay;
    });
    if (!evs.length) continue;
    out.push('\n' + fmtDate_(day));
    evs.forEach(function (e) { out.push(formatEventLine_(e)); });
  }
  return out.join('\n');
}

// ---------- Sales.gs ----------
/** สรุปยอดขายจาก dashboard.json (ไฟล์เดียวกับหน้า Sales Command Center) */

function fetchDashboard_() {
  const url = prop_('DASHBOARD_URL', CONFIG.DASHBOARD_URL);
  const res = UrlFetchApp.fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + now_().getTime(),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('โหลด dashboard.json ไม่ได้ (' + res.getResponseCode() + ')');
  return JSON.parse(res.getContentText());
}

function pct_(a, b) {
  return b ? (a / b) * 100 : null;
}

/** ข้อมูลยอด: ใช้แท็บ SalesData (จาก Power BI) ถ้ามี ไม่งั้นใช้ dashboard.json */
function getSalesSnapshot_() {
  const rows = readSalesRows_();
  const snap = rows.length ? buildSalesSnapshot_(rows, now_()) : null;
  return snap || fetchDashboard_();
}

function normName_(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

function teamsOf_(d) {
  if (Array.isArray(d.teams)) return d.teams;
  const t = [];
  if (d.fish4) t.push(Object.assign({ name: 'Fish 4' }, d.fish4));
  if (d.fish5) t.push(Object.assign({ name: 'Fish 5' }, d.fish5));
  return t;
}

/** "fish4", "f4", "Fish 4" → ทีม */
function findTeam_(d, q) {
  let n = normName_(q);
  if (/^f\d+$/.test(n)) n = 'fish' + n.slice(1);
  return teamsOf_(d).find(function (t) { return normName_(t.name) === n; }) || null;
}

function teamLine_(t) {
  return '🐟 ' + t.name + ': ' + fmtNum_(t.actualTon) +
    (t.budgetTon ? ' / ' + fmtNum_(t.budgetTon) + ' ตัน (' + fmtNum_(t.achievement) + '%)' : ' ตัน');
}

/** team: null = ภาพรวม หรือ object ทีมจาก findTeam_ */
function formatSales_(d, team) {
  const total = d.total || {};
  const passed = Number(d.workingDaysPassed) || 0;
  const all = Number(d.workingDaysTotal) || 0;
  const timeGone = pct_(passed, all);
  const lines = ['📊 สรุปยอดขาย Fish — ข้อมูล ณ ' + (d.date || '-')];
  if (all) lines.push('วันทำงาน ' + passed + '/' + all + ' (Time gone ' + fmtNum_(timeGone, 0) + '%)');
  lines.push('━━━━━━━━━━');

  if (team) {
    lines.push(teamLine_(team));
    if (timeGone !== null && team.budgetTon) lines.push(gapVsTimeLine_(team.achievement, timeGone));
    const remainDays = all - passed;
    if (team.budgetTon && remainDays > 0) {
      lines.push('🎯 ต้องทำอีก ' + fmtNum_(team.budgetTon - team.actualTon) + ' ตัน ≈ ' +
        fmtNum_((team.budgetTon - team.actualTon) / remainDays) + ' ตัน/วัน');
    }
    if (d.salesList) {
      const members = d.salesList.filter(function (s) { return s.team === team.name; });
      if (members.length) {
        lines.push('');
        members.forEach(function (s, i) {
          lines.push((i + 1) + '. ' + s.name + ' — ' + tonVsTarget_(s.actualTon, s.budgetTon, s.achievement) +
            paceIcon_(s.achievement, timeGone));
        });
      }
    }
  } else {
    lines.push('รวม: ' + fmtNum_(total.actualTon) +
      (total.budgetTon ? ' / ' + fmtNum_(total.budgetTon) + ' ตัน (' + fmtNum_(total.achievement) + '%)' : ' ตัน'));
    if (timeGone !== null && total.budgetTon && total.achievement !== undefined) lines.push(gapVsTimeLine_(total.achievement, timeGone));
    if (total.forecastTon !== undefined) {
      lines.push('🔮 คาดการณ์สิ้นเดือน ' + fmtNum_(total.forecastTon) + ' ตัน' +
        (total.budgetTon ? ' (' + fmtNum_(pct_(total.forecastTon, total.budgetTon), 1) + '%)' : '') +
        (total.gapTon !== undefined ? ' | Gap ' + fmtNum_(total.gapTon) : ''));
    }
    if (total.currentSpeed !== undefined && total.requiredSpeed !== undefined) {
      const diff = total.currentSpeed - total.requiredSpeed;
      lines.push('🚀 สปีด ' + fmtNum_(total.currentSpeed) + ' ตัน/วัน | ต้องการ ' + fmtNum_(total.requiredSpeed));
      lines.push(diff >= 0 ? '✅ เร็วกว่าเป้า +' + fmtNum_(diff) + ' ตัน/วัน'
        : '⚠️ ต้องเร่งอีก ' + fmtNum_(-diff) + ' ตัน/วัน');
    } else if (total.currentSpeed !== undefined) {
      lines.push('🚀 สปีด ' + fmtNum_(total.currentSpeed) + ' ตัน/วัน');
    }
    const teams = teamsOf_(d);
    if (teams.length) {
      lines.push('━━━━━━━━━━');
      teams.forEach(function (t) { lines.push(teamLine_(t)); });
    }
    if (d.lastDay) lines.push('📅 วันล่าสุด (' + fmtDate_(d.lastDay.date) + ') ' + fmtNum_(d.lastDay.total) + ' ตัน');
    if (d.status) {
      lines.push('สถานะ: ' + Object.keys(d.status).map(function (k) { return k + ' ' + d.status[k]; }).join(' · '));
    }
    appendBullets_(lines, '💡 โอกาส', d.opportunity);
    appendBullets_(lines, '👀 ต้องระวัง', d.watchout);
    appendBullets_(lines, '📝 สรุป', d.summary);
  }
  if (d.source === 'sheet') {
    lines.push('ดูเพิ่ม: ยอดเมื่อวาน | ยอดเซลส์ | ยอดลูกค้า | ยอดสินค้า | ยอด <ชื่อเซลส์>');
  } else {
    lines.push('🔗 ' + CONFIG.DASHBOARD_PAGE);
  }
  return lines.join('\n');
}

function gapVsTimeLine_(achievement, timeGone) {
  const gap = achievement - timeGone;
  return (gap >= 0 ? '🟢 นำ Time gone +' : '🔴 ตาม Time gone ') + fmtNum_(gap, 1) + ' pts';
}

function appendBullets_(lines, title, list) {
  if (!Array.isArray(list) || !list.length) return;
  lines.push(title);
  list.slice(0, 5).forEach(function (x) { lines.push('• ' + x); });
}

/** บรรทัดสั้นสำหรับสรุปเช้า/สรุปสัปดาห์ */
function formatSalesShort_(d) {
  const t = d.total || {};
  const parts = ['📊 ยอด ' + fmtNum_(t.actualTon) + (t.budgetTon ? '/' + fmtNum_(t.budgetTon) + ' ตัน (' + fmtNum_(t.achievement) + '%)' : ' ตัน')];
  if (t.forecastTon !== undefined) parts.push('คาดการณ์ ' + fmtNum_(t.forecastTon));
  if (t.currentSpeed !== undefined && t.requiredSpeed !== undefined) {
    const diff = t.currentSpeed - t.requiredSpeed;
    parts.push(diff >= 0 ? 'สปีดผ่านเป้า ✅' : 'ต้องเร่ง +' + fmtNum_(-diff) + ' ตัน/วัน ⚠️');
  }
  let s = parts.join(' | ') + ' (ข้อมูล ' + (d.date || '-') + ')';
  if (d.lastDay) {
    s += '\n📅 ยอดวันที่ ' + fmtDate_(d.lastDay.date) + ' ' + fmtNum_(d.lastDay.total) + ' ตัน';
    if (d.lastDay.bySales.length) {
      s += ' · ท็อป: ' + d.lastDay.bySales.slice(0, 3).map(function (e) { return e.name + ' ' + fmtNum_(e.ton, 1); }).join(', ');
    }
  }
  return s;
}

function safeSalesShort_() {
  try { return formatSalesShort_(getSalesSnapshot_()); } catch (e) {
    console.error(e);
    return '📊 ยอด: โหลดข้อมูลไม่ได้';
  }
}

/** ใช้ในสรุปสัปดาห์: 5 อันดับเซลส์ */
function safeSalesTop_() {
  try {
    const snap = getSalesSnapshot_();
    if (!snap.salesList || !snap.salesList.length) return '';
    const tg = timeGonePct_(snap);
    return '🏆 ท็อปเซลส์เดือนนี้\n' + snap.salesList.slice(0, 5).map(function (s, i) {
      return (i + 1) + '. ' + s.name + ' — ' + tonVsTarget_(s.actualTon, s.budgetTon, s.achievement) + paceIcon_(s.achievement, tg);
    }).join('\n');
  } catch (e) {
    return '';
  }
}

// ---------- SalesData.gs ----------
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

// ---------- Schedule.gs ----------
/**
 * งานตั้งเวลา: สรุปเช้า, เตือนก่อนนัด, สรุปประจำสัปดาห์
 * รัน setupTriggers() ครั้งเดียวหลังติดตั้ง (หรือทุกครั้งที่เปลี่ยนเวลา)
 */

function setupTriggers() {
  const handlers = ['morningBrief', 'eventReminder', 'weeklyReview', 'importSalesHourly'];
  setupSalesSheets();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  const hour = Number(prop_('MORNING_HOUR', CONFIG.MORNING_HOUR));
  ScriptApp.newTrigger('morningBrief').timeBased().everyDays(1).atHour(hour).nearMinute(0).create();
  ScriptApp.newTrigger('weeklyReview').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(CONFIG.REVIEW_HOUR).create();
  ScriptApp.newTrigger('eventReminder').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('importSalesHourly').timeBased().everyHours(1).create();
  console.log('ตั้ง trigger แล้ว: สรุปเช้า ' + hour + ':00, สรุปสัปดาห์ ศุกร์ ' + CONFIG.REVIEW_HOUR + ':00, เตือนนัดทุก 10 นาที, นำเข้ายอด Power BI ทุกชั่วโมง');
}

function isWorkDay_(d) {
  return String(prop_('WORK_DAYS', CONFIG.WORK_DAYS)).split(',').map(Number).indexOf(d.getDay()) >= 0;
}

/** Trigger: ทุกเช้า (วันทำงาน) */
function morningBrief() {
  const now = now_();
  if (!flag_('BRIEF_ENABLED') || !isWorkDay_(now)) return;
  importSalesHourly(); // ให้สรุปเช้าใช้ไฟล์ล่าสุดเสมอ
  linePush_(prop_('GROUP_ID', ''), buildMorningBrief_(now));
}

/** Trigger: ทุกศุกร์บ่าย */
function weeklyReview() {
  if (!flag_('REVIEW_ENABLED')) return;
  linePush_(prop_('GROUP_ID', ''), buildWeeklyReview_(now_()));
}

/** Trigger: ทุก 10 นาที — เตือนนัดที่จะเริ่มภายใน REMIND_BEFORE_MIN นาที (ครั้งเดียวต่อนัด) */
function eventReminder() {
  const groupId = prop_('GROUP_ID', '');
  if (!flag_('REMINDER_ENABLED') || !groupId) return;
  const now = now_();
  const before = Number(prop_('REMIND_BEFORE_MIN', CONFIG.REMIND_BEFORE_MIN));
  const events = getEvents_(now, new Date(now.getTime() + before * 60000))
    .filter(function (e) { return !e.allDay && e.start >= now; });
  if (!events.length) return;
  const cache = CacheService.getScriptCache();
  const fresh = events.filter(function (e) {
    const key = 'rem_' + Utilities.base64EncodeWebSafe(e.id + '|' + e.start.getTime()).slice(0, 200);
    if (cache.get(key)) return false;
    cache.put(key, '1', 21600);
    return true;
  });
  if (!fresh.length) return;
  const lines = ['⏰ ใกล้ถึงเวลานัด'];
  fresh.forEach(function (e) {
    const mins = Math.max(0, Math.round((e.start - now) / 60000));
    lines.push(formatEventLine_(e) + ' (อีก ' + mins + ' นาที)');
  });
  linePush_(groupId, lines.join('\n'));
}

function buildMorningBrief_(now) {
  const today = startOfDay_(now);
  const out = ['☀️ สวัสดีตอนเช้าทีมขาย — ' + fmtDateLong_(now)];

  const weekly = getWeekly_();
  if (now.getDay() === 1) {
    out.push('');
    out.push('🗓️ แผนสัปดาห์นี้');
    out.push(formatWeeklyList_(weekly, now));
    const weekEvents = getEvents_(today, addDays_(today, 7));
    out.push('');
    out.push(formatAgendaDays_('📅 นัดสัปดาห์นี้', weekEvents, today, 7));
  } else {
    out.push('');
    out.push(formatAgenda_('📅 นัดวันนี้', getEvents_(today, addDays_(today, 1))));
  }

  const open = openTasks_();
  const dueSoon = open.filter(function (t) { return t.due && dayDiff_(t.due, now) <= 1; });
  out.push('');
  out.push(dueSoon.length ? formatTaskList_('📋 งานถึงกำหนด/เลยกำหนด', dueSoon, now, 15)
    : '📋 ไม่มีงานถึงกำหนดวันนี้ (งานค้างทั้งหมด ' + open.length + ')');

  if (now.getDay() !== 1) {
    const pending = weeklyDueNow_(weekly, now);
    if (pending.length) {
      out.push('');
      out.push('🔁 งานประจำที่ถึงกำหนดแล้วแต่ยังไม่ติ๊ก');
      pending.forEach(function (w) {
        out.push('⬜ #' + w.id + ' ' + w.text + (w.owner ? ' — ' + w.owner : '') + ' (' + weeklyDueLabel_(w.dow) + ')');
      });
    }
  }

  out.push('');
  out.push(safeSalesShort_());
  return out.join('\n');
}

function buildWeeklyReview_(now) {
  const weekStart = startOfWeek_(now);
  const weekEnd = addDays_(weekStart, 7);
  const out = ['📈 สรุปประจำสัปดาห์ ' + fmtDate_(weekStart) + ' – ' + fmtDate_(addDays_(weekStart, 6))];

  const tasks = getTasks_();
  const closed = tasks.filter(function (t) {
    return t.status === STATUS_DONE && t.doneAt && t.doneAt >= weekStart && t.doneAt < weekEnd;
  });
  out.push('');
  out.push('✅ ปิดงานสัปดาห์นี้ ' + closed.length + ' งาน');
  closed.slice(0, 10).forEach(function (t) {
    out.push('• #' + t.id + ' ' + t.text + (t.doneBy ? ' — ' + t.doneBy : ''));
  });

  const open = tasks.filter(function (t) { return t.status !== STATUS_DONE; });
  out.push('');
  out.push(formatTaskList_('⏳ งานค้าง', open, now, 15));

  const weekly = getWeekly_();
  if (weekly.length) {
    const notDone = weekly.filter(function (w) { return !isWeeklyDone_(w, now); });
    out.push('');
    out.push('🔁 งานประจำ ทำแล้ว ' + (weekly.length - notDone.length) + '/' + weekly.length);
    notDone.forEach(function (w) {
      out.push('⬜ #' + w.id + ' ' + w.text + (w.owner ? ' — ' + w.owner : ''));
    });
  }

  const top = safeSalesTop_();
  if (top) { out.push(''); out.push(top); }

  const nextWeek = getEvents_(weekEnd, addDays_(weekEnd, 7));
  out.push('');
  out.push(formatAgendaDays_('📅 นัดสัปดาห์หน้า', nextWeek, weekEnd, 7));

  out.push('');
  out.push(safeSalesShort_());
  return out.join('\n');
}

// ---------- Main.gs ----------
/** Webhook ของ LINE → แปลงคำสั่ง → ตอบกลับ */

function doGet() {
  return ContentService.createTextOutput('Sales LINE bot is running');
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const botId = prop_('BOT_USER_ID', '');
    // Apps Script อ่าน header X-Line-Signature ไม่ได้ จึงกรองด้วย destination แทน
    if (botId && body.destination !== botId) {
      console.warn('ข้าม webhook: destination ไม่ตรง ' + body.destination);
    } else {
      (body.events || []).forEach(function (ev) {
        try { handleEvent_(ev); } catch (err) {
          console.error(err && err.stack || err);
          if (ev.replyToken) lineReply_(ev.replyToken, '⚠️ เกิดข้อผิดพลาด: ' + (err && err.message || err));
        }
      });
    }
  } catch (err) {
    console.error(err && err.stack || err);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function chatId_(source) {
  return source.groupId || source.roomId || source.userId;
}

function handleEvent_(ev) {
  const source = ev.source || {};
  const registered = prop_('GROUP_ID', '');

  if (ev.type === 'join') {
    lineReply_(ev.replyToken, withQuickReply_(
      '👋 สวัสดีทีมขาย! ผมคือบอทผู้ช่วย\n' +
      (registered ? '' : 'พิมพ์ "ลงทะเบียน" เพื่อให้บอทส่งสรุปเช้า/เตือนนัดเข้ากลุ่มนี้\n') +
      'พิมพ์ "เมนู" เพื่อดูคำสั่งทั้งหมด', ['ลงทะเบียน', 'เมนู']));
    return;
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;

  const stripped = stripMentions_(ev.message.text, ev.message.mention);
  const parsed = parseCommand_(stripped.text);
  if (!parsed) return;

  // ล็อกให้ใช้ได้เฉพาะกลุ่มที่ลงทะเบียน (แชท 1:1 กับบอทใช้ได้เสมอ)
  const isGroupChat = source.type === 'group' || source.type === 'room';
  if (registered && isGroupChat && chatId_(source) !== registered &&
      parsed.cmd !== 'whoami' && parsed.cmd !== 'register') return;

  const ctx = {
    now: now_(),
    source: source,
    mentions: stripped.mentions,
    sender: null,
  };
  ctx.senderInfo = function () {
    if (!ctx.sender) ctx.sender = { userId: source.userId || '', name: lineDisplayName_(source) };
    return ctx.sender;
  };

  const reply = runCommand_(parsed, ctx);
  if (reply) lineReply_(ev.replyToken, reply);
}

function runCommand_(p, ctx) {
  const now = ctx.now;
  switch (p.cmd) {
    case 'help':
      return withQuickReply_(HELP_TEXT, ['ยอด', 'งาน', 'งานฉัน', 'วันนี้', 'สัปดาห์นี้', 'ประจำ']);

    case 'register': {
      const id = chatId_(ctx.source);
      const current = prop_('GROUP_ID', '');
      if (ctx.source.type !== 'group' && ctx.source.type !== 'room') return 'ใช้คำสั่งนี้ในกลุ่ม LINE ที่ต้องการให้บอทส่งแจ้งเตือน';
      if (current === id) return '✅ กลุ่มนี้ลงทะเบียนไว้แล้ว';
      if (current) return '⚠️ บอทลงทะเบียนกับกลุ่มอื่นอยู่แล้ว — ให้ผู้ดูแลลบ GROUP_ID ใน Script Properties ก่อน';
      setProp_('GROUP_ID', id);
      return '✅ ลงทะเบียนกลุ่มนี้แล้ว บอทจะส่งสรุปเช้า เตือนนัด และสรุปสัปดาห์เข้ากลุ่มนี้\nพิมพ์ "เมนู" เพื่อดูคำสั่ง';
    }

    case 'whoami':
      return 'chat: ' + chatId_(ctx.source) + '\nuser: ' + (ctx.source.userId || '-');

    case 'sales': {
      if (!p.argText) return formatSales_(getSalesSnapshot_(), null);
      let snap;
      try { snap = getSalesSnapshot_(); } catch (e) { return null; }
      const team = findTeam_(snap, p.argText);
      if (team) return formatSales_(snap, team);
      const person = findSalesPerson_(snap, p.argText);
      return person ? formatPersonSales_(snap, person) : null;
    }

    case 'salesday':
    case 'salesrank':
    case 'salescust':
    case 'salesprod': {
      const snap = getSalesSnapshot_();
      if (snap.source !== 'sheet') return NO_SHEET_SALES_TEXT;
      if (p.cmd === 'salesday') return formatLastDay_(snap);
      if (p.cmd === 'salesrank') return formatSalesRank_(snap);
      if (p.cmd === 'salescust') return formatTopBy_(snap, 'customer', '👥 ลูกค้าท็อป', 10);
      return formatTopBy_(snap, 'product', '📦 สินค้าท็อป', 10);
    }

    case 'importsales': {
      const r = importSalesFromDrive_(true);
      return r.skipped ? 'ℹ️ ' + r.message : r.message;
    }

    case 'tasks':
      return formatTaskList_('📋 งานค้าง', openTasks_(), now);

    case 'mytasks': {
      const me = ctx.senderInfo();
      return formatTaskList_('📋 งานของ ' + me.name, openTasks_().filter(function (t) { return isMine_(t, me); }), now);
    }

    case 'addtask': {
      const input = parseTaskInput_(p.argText, now);
      if (!input.text) return 'รูปแบบ: งาน+ <รายละเอียด> [วันที่] [@ผู้รับผิดชอบ]\nเช่น งาน+ ส่งใบเสนอราคาฟาร์ม A พรุ่งนี้ @สมชาย';
      const me = ctx.senderInfo();
      const owners = resolveOwners_(ctx.mentions, input.names, me);
      const id = addTask_(input.text, input.due, owners, me.name);
      return '➕ เพิ่มงาน #' + id + ' ' + input.text +
        '\n👤 ' + owners.map(function (o) { return o.name; }).join(', ') +
        '\n📆 ' + (input.due ? fmtDate_(input.due) : 'ไม่มีกำหนด') +
        '\nปิดงาน: "เสร็จ ' + id + '"';
    }

    case 'done': {
      const r = completeTasks_(parseIds_(p.args), ctx.senderInfo().name);
      const lines = r.done.map(function (t) { return '✅ ปิดงาน #' + t.id + ' ' + t.text; });
      if (r.missing.length) lines.push('ไม่พบงานค้าง #' + r.missing.join(', #'));
      return lines.join('\n');
    }

    case 'deltask': {
      const t = deleteTask_(parseIds_(p.args)[0]);
      return t ? '🗑️ ลบงาน #' + t.id + ' ' + t.text : 'ไม่พบงานนี้';
    }

    case 'movetask': {
      const id = parseIds_(p.args.slice(0, 1))[0];
      const due = p.args[1] ? parseDateToken_(p.args[1], now) : null;
      if (!id || !due) return 'รูปแบบ: เลื่อน <เลขงาน> <วันที่> เช่น เลื่อน 3 ศุกร์ หรือ เลื่อน 3 28/11';
      const t = rescheduleTask_(id, due);
      return t ? '↪️ เลื่อนงาน #' + t.id + ' ' + t.text + ' เป็น ' + fmtDate_(due) : 'ไม่พบงานนี้';
    }

    case 'today': {
      const d = startOfDay_(now);
      return formatAgenda_('📅 นัดวันนี้ ' + fmtDate_(d), getEvents_(d, addDays_(d, 1)));
    }

    case 'tomorrow': {
      const d = addDays_(startOfDay_(now), 1);
      return formatAgenda_('📅 นัดพรุ่งนี้ ' + fmtDate_(d), getEvents_(d, addDays_(d, 1)));
    }

    case 'week': {
      const s = startOfWeek_(now);
      return formatAgendaDays_('📅 นัดสัปดาห์นี้', getEvents_(s, addDays_(s, 7)), s, 7);
    }

    case 'addevent': {
      const ev = parseEventInput_(p.argText, now);
      if (!ev) return 'รูปแบบ: นัด+ <วันที่> [เวลา] <เรื่อง>\nเช่น นัด+ 25/11 14:00-15:00 เยี่ยมฟาร์มคุณสมชาย';
      createEvent_(ev, ctx.mentions, ctx.senderInfo().name);
      return '📅 บันทึกนัดแล้ว\n' + fmtDate_(ev.start) + ' ' +
        (ev.allDay ? 'ทั้งวัน' : fmtTime_(ev.start) + '–' + fmtTime_(ev.end)) + ' ' + ev.title +
        (ctx.mentions.length ? '\n👥 ' + ctx.mentions.map(function (m) { return m.name; }).join(', ') : '');
    }

    case 'weekly':
      return formatWeeklyList_(getWeekly_(), now);

    case 'addweekly': {
      const w = parseWeeklyInput_(p.argText);
      if (!w.text) return 'รูปแบบ: ประจำ+ [วัน] <รายการ> [@ผู้รับผิดชอบ]\nเช่น ประจำ+ จันทร์ ส่งรายงานลูกค้าใหม่ @สมชาย';
      const owners = resolveOwners_(ctx.mentions, w.names, null);
      const id = addWeekly_(w.text, w.dow, owners);
      return '🔁 เพิ่มงานประจำ #' + id + ' ' + w.text + ' (' + weeklyDueLabel_(w.dow) + ')' +
        (owners.length ? '\n👤 ' + owners.map(function (o) { return o.name; }).join(', ') : '');
    }

    case 'weeklydone': {
      const r = checkWeekly_(parseIds_(p.args), ctx.senderInfo().name);
      const lines = r.done.map(function (w) { return '✅ ' + w.text + ' (สัปดาห์นี้)'; });
      if (r.missing.length) lines.push('ไม่พบงานประจำ #' + r.missing.join(', #'));
      return lines.join('\n');
    }

    case 'delweekly': {
      const w = deleteWeekly_(parseIds_(p.args)[0]);
      return w ? '🗑️ ลบงานประจำ #' + w.id + ' ' + w.text : 'ไม่พบงานประจำนี้';
    }

    case 'brief':
      return buildMorningBrief_(now);

    case 'review':
      return buildWeeklyReview_(now);
  }
  return null;
}

const NO_SHEET_SALES_TEXT = 'ยังไม่มียอดรายวันจาก Power BI ในแท็บ SalesData\n' +
  'Export ข้อมูลจาก Power BI เป็น .csv แล้ววางในโฟลเดอร์ Google Drive ที่ตั้งไว้ จากนั้นพิมพ์ "อัปเดตยอด"';

const HELP_TEXT = [
  '🤖 คำสั่งบอททีมขาย',
  '',
  '📊 ยอดขาย',
  '• ยอด — สรุปยอดเดือนนี้ | ยอด fish4 | ยอด <ชื่อเซลส์>',
  '• ยอดเมื่อวาน | ยอดเซลส์ (อันดับ) | ยอดลูกค้า | ยอดสินค้า',
  '• อัปเดตยอด — ดึงไฟล์ Power BI ล่าสุดเข้าระบบ',
  '',
  '📋 งานติดตาม',
  '• งาน — งานค้างทั้งหมด | งานฉัน',
  '• งาน+ ส่งใบเสนอราคาฟาร์ม A พรุ่งนี้ @สมชาย',
  '• เสร็จ 3  (ปิดหลายงาน: เสร็จ 3 5)',
  '• เลื่อน 3 ศุกร์ | ลบงาน 3',
  '',
  '📅 นัด / ปฏิทิน',
  '• วันนี้ | พรุ่งนี้ | สัปดาห์นี้',
  '• นัด+ 25/11 14:00-15:00 เยี่ยมฟาร์มคุณสมชาย @ทีม',
  '',
  '🔁 งานประจำสัปดาห์',
  '• ประจำ — เช็กลิสต์สัปดาห์นี้',
  '• ประจำ+ จันทร์ ส่งรายงานลูกค้าใหม่ @สมชาย',
  '• เช็ค 2 — ติ๊กว่าทำแล้ว | ลบประจำ 2',
  '',
  '☀️ สรุปเช้า | 📈 สรุปสัปดาห์',
  '',
  'วันที่ใช้ได้: วันนี้ พรุ่งนี้ มะรืน จันทร์…อาทิตย์ ศุกร์หน้า 25/11 25/11/69',
].join('\n');
