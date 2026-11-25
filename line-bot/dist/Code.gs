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
 *  BIRTHDAY_SHEET_ID          Google Sheet วันเกิดลูกค้า (แจ้งทุกเช้า)
 *  BIRTHDAY_DAYS_AHEAD        แจ้งล่วงหน้ากี่วัน (ค่าเริ่มต้น 7) / BIRTHDAY_ENABLED true|false
 *  MORNING_TIME / MORNING_DAYS ข้อความเช้า (ค่าเริ่มต้น 07:30 / 1,2,3,4,5,6 = จ.–ส.)
 *  UPLOAD_GROUP_ID            กลุ่มสำหรับส่งไฟล์ยอด (ตั้งด้วยคำสั่ง "กลุ่มอัปโหลด")
 *  AUTO_REPORT                true = มีไฟล์ใหม่ในโฟลเดอร์ Drive แล้วส่งรายงานเข้ากลุ่มหลักทันที (ค่าเริ่มต้น false)
 *  AI_ANALYSIS                (ไม่บังคับ) true = แนบบทวิเคราะห์ AI ท้ายรายงานยอด + คำสั่ง "วิเคราะห์" (ค่าเริ่มต้นปิด)
 *  LEGACY_COMMANDS            (ไม่บังคับ) true = เปิดคำสั่งงาน/นัด/งานประจำแบบเดิม (ค่าเริ่มต้นปิด กันคำทั่วไปทำให้บอทตอบ)
 *  REPORT_LINK                (ไม่บังคับ) ลิงก์แชร์ไฟล์ Excel รวมบันทึกเยี่ยมบน OneDrive (คำสั่ง "ไฟล์รายงาน")
 *  VISIT_EMAIL                (ไม่บังคับ) อีเมลที่รับบันทึกเยี่ยมทุกครั้ง → Power Automate เพิ่มแถวในไฟล์ Excel
 *  LOCK_GROUPS                (ไม่บังคับ) true = ตอบเฉพาะกลุ่มหลัก + ห้องสั่งการ (ค่าเริ่มต้น: ทุกกลุ่มที่มีบอทใช้คำสั่งทีมได้)
 *  GEMINI_API_KEY             (ไม่บังคับ) เปิด AI ด้วย Google Gemini (aistudio.google.com) / GEMINI_MODEL
 *  ANTHROPIC_API_KEY          (ไม่บังคับ) เปิด AI ด้วย Claude / AI_PROVIDER = gemini | claude
 *  FILE_DATE_LAG_DAYS         วันที่ข้อมูล = วันที่ส่งไฟล์ − N วัน (ค่าเริ่มต้น 1 = ยอดถึงเมื่อวาน)
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
  help: ['เมนู', 'คำสั่ง', 'ช่วยเหลือ', 'help'],
  register: ['ลงทะเบียน', 'register'],
  registerupload: ['กลุ่มอัปโหลด', 'ลงทะเบียนอัปโหลด'],
  whoami: ['ไอดี', 'myid'],
  sales: ['ยอด', 'สรุปยอด', 'ยอดขาย', 'sales'],
  salesday: ['ยอดเมื่อวาน', 'ยอดล่าสุด', 'ยอดรายวัน'],
  salesrank: ['ยอดเซลส์', 'อันดับเซลส์', 'ranking'],
  salescust: ['ยอดลูกค้า', 'ลูกค้าท็อป', 'ลูกค้า', 'ลูกค้าเขต'],
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
  brief: ['สรุปเช้า', 'brief'],
  birthday: ['วันเกิด', 'วันเกิดลูกค้า', 'hbd'],
  sendsales: ['ส่งยอด', 'ส่งยอดขาย'],
  visits: ['ดูเยี่ยม', 'ประวัติเยี่ยม', 'ดูติดตาม', 'ดูเข้าพบ', 'ประวัติติดตาม'],
  notvisited: ['ไม่ได้เยี่ยม', 'ยังไม่เยี่ยม'],
  reportlink: ['ไฟล์รายงาน', 'ลิงก์รายงาน', 'ลิงค์รายงาน', 'ไฟล์เยี่ยม'],
  sendbirthday: ['ส่งวันเกิด'],
  aisales: ['วิเคราะห์', 'วิเคราะห์ยอด'],
  review: ['สรุปสัปดาห์', 'review'],
};

/** คำสั่งที่ต้องพิมพ์โดด ๆ (กันบอทตอบแชทปกติ เช่น "วันนี้ ไปไหนกัน") */
const NO_ARG_COMMANDS = ['reportlink', 'help', 'register', 'whoami', 'tasks', 'mytasks', 'today',
  'tomorrow', 'week', 'weekly', 'brief', 'review', 'salesday', 'salesrank',
  'salesprod', 'aisales'];

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
  let botMentioned = false;
  list.forEach(function (m) {
    const raw = text.substr(m.index, m.length);
    out = out.slice(0, m.index) + ' ' + out.slice(m.index + m.length);
    if (m.isSelf) botMentioned = true;
    if (m.isSelf || m.type === 'all') return;
    mentions.unshift({ userId: m.userId || '', name: raw.replace(/^@/, '').trim() });
  });
  const multiline = out.split(/\r?\n/).map(function (l) { return l.replace(/[ \t\u00a0]+/g, ' ').trim(); })
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // ตัวเลขไทย / ตัวอักษรเต็มความกว้าง (ｆ３) → ตัวปกติ สำหรับจับคำสั่ง
  const plain = out.replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[๐-๙]/g, function (c) { return String(c.charCodeAt(0) - 0x0E50); });
  return { text: plain.replace(/\s+/g, ' ').trim(), multiline: multiline, mentions: mentions, botMentioned: botMentioned };
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
  if (cmd === 'sales' && args.length > 6) return null;
  if (cmd === 'registerupload' && args.length && args.join('') !== 'ยืนยัน') return null;
  if ((cmd === 'visits' || cmd === 'notvisited') && args.length > 4) return null;
  if ((cmd === 'birthday' || cmd === 'sendbirthday' || cmd === 'sendsales') && args.length > 1) return null;
  if (cmd === 'importsales' && (args.length > 1 || (args.length && !/^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?$/.test(args[0])))) return null;
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
  const items = (Array.isArray(input) ? input : [input]).reduce(function (acc, x) { return acc.concat(x); }, []);
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

/** การ์ด (Flex) → ข้อความธรรมดา (ใช้เมื่อ LINE ไม่รับการ์ด) */
function flexFallback_(m) {
  if (!m || m.type !== 'flex') return m;
  const t = { type: 'text', text: truncate_(flexToText_(m.contents), LINE_TEXT_MAX) };
  if (m.quickReply) t.quickReply = m.quickReply;
  return t;
}

/** ส่ง แล้วถ้า LINE ไม่รับการ์ด (400) ส่งซ้ำเป็นข้อความธรรมดา — รายงานต้องถึงกลุ่มเสมอ */
function lineSend_(path, body) {
  const res = lineFetch_(path, 'post', body);
  if (res.code === 400 && body.messages.some(function (m) { return m.type === 'flex'; })) {
    console.error('LINE ไม่รับการ์ด → ส่งเป็นข้อความแทน: ' + res.body);
    return lineFetch_(path, 'post', Object.assign({}, body, { messages: body.messages.map(flexFallback_) }));
  }
  return res;
}

/** ตอบกลับ (reply ไม่นับโควตาข้อความ) */
function lineReply_(replyToken, messages) {
  return lineSend_('/message/reply', { replyToken: replyToken, messages: toMessages_(messages) });
}

/** ส่งหาแบบ push (นับโควตาข้อความของ LINE OA ตามจำนวนสมาชิกในกลุ่ม) */
function linePush_(to, messages) {
  if (!to) { console.warn('ไม่มีปลายทาง push — พิมพ์ "ลงทะเบียน" ในกลุ่มก่อน'); return null; }
  return lineSend_('/message/push', { to: to, messages: toMessages_(messages) });
}

/** ไฟล์ที่ส่งในแชท (ดาวน์โหลดได้ภายในเวลาจำกัดหลังส่ง) */
function lineContent_(messageId) {
  const res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + messageId + '/content', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN', '') },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('ดาวน์โหลดไฟล์จาก LINE ไม่ได้ (' + res.getResponseCode() + ')');
  return res.getBlob();
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

// ---------- Flex.gs ----------
/**
 * Flex Message — การ์ด/ตารางที่อ่านง่ายบน LINE
 *  - คอลัมน์ตรงกัน ตัวเลขชิดขวา
 *  - ตัวเลขไม่กลายเป็นลิงก์เบอร์โทร (ข้อความธรรมดา LINE ขีดเส้นใต้ตัวเลขยาว ๆ)
 *  - ถ้า LINE ไม่รับการ์ด ระบบส่งเป็นข้อความธรรมดาแทนให้อัตโนมัติ (ดู Line.gs)
 */

const FX = {
  band: '#1E3A5F',    // แถบหัวการ์ด
  bandText: '#FFFFFF',
  bandSub: '#D6E2F0',
  text: '#1F2937',
  sub: '#6B7280',
  muted: '#9CA3AF',
  line: '#E5E7EB',
  green: '#15803D',
  amber: '#B45309',
  red: '#B91C1C',
};

/** ข้อความ 1 ช่อง — LINE ไม่รับข้อความว่าง จึงแทนด้วย "-" */
function fxText_(text, o) {
  const s = text === null || text === undefined ? '' : String(text);
  const t = { type: 'text', text: s.trim() ? s : '-' };
  if (o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') t[k] = o[k];
    });
  }
  return t;
}

function fxBox_(layout, contents, o) {
  const list = (contents || []).filter(Boolean);
  const b = { type: 'box', layout: layout, contents: list.length ? list : [fxText_('-', { size: 'xs', color: FX.muted })] };
  if (o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') b[k] = o[k];
    });
  }
  return b;
}

function fxSep_(margin) {
  return { type: 'separator', margin: margin || 'md', color: FX.line };
}

/** หัวข้อย่อยในการ์ด เช่น "⚖️ ตัน" */
function fxSection_(title) {
  return fxText_(title, { size: 'sm', weight: 'bold', color: FX.text, margin: 'lg' });
}

/** หมายเหตุตัวเล็กสีเทา */
function fxNote_(text, color) {
  return fxText_(text, { size: 'xs', color: color || FX.muted, wrap: true, margin: 'md' });
}

/** cell: "ข้อความ" หรือ { t, color, bold } */
function fxCell_(cell, col, rowBold) {
  const c = cell !== null && typeof cell === 'object' ? cell : { t: cell };
  return fxText_(c.t, {
    size: col.size || 'sm',
    flex: col.flex || 1,
    align: col.align === 'end' || col.align === 'center' ? col.align : undefined,
    color: c.color || col.color,
    weight: c.bold || rowBold ? 'bold' : undefined,
    wrap: col.wrap ? true : undefined,
  });
}

/**
 * ตาราง: cols = [{ label, flex, align: 'end', wrap }]
 *        rows = [[cell, ...]] หรือ { cells: [...], bold: true } หรือ 'sep' (เส้นคั่น)
 */
function fxTable_(cols, rows, o) {
  const opt = o || {};
  const out = [];
  if (!opt.noHead) {
    out.push(fxBox_('horizontal', cols.map(function (c) {
      return fxText_(c.label, { size: 'xxs', color: FX.muted, flex: c.flex || 1, weight: 'bold',
        align: c.align === 'end' || c.align === 'center' ? c.align : undefined });
    }), { spacing: 'sm' }));
    out.push(fxSep_('sm'));
  }
  rows.forEach(function (r) {
    if (r === 'sep') { out.push(fxSep_('sm')); return; }
    const cells = Array.isArray(r) ? r : r.cells;
    out.push(fxBox_('horizontal', cells.map(function (cell, j) { return fxCell_(cell, cols[j] || {}, !Array.isArray(r) && r.bold); }),
      { spacing: 'sm', margin: 'sm' }));
  });
  return fxBox_('vertical', out, { margin: opt.margin || 'md' });
}

/** รายการ ป้าย : ค่า (ค่าชิดขวา) — pairs = [[label, value, { color, bold }]] */
function fxKV_(pairs, o) {
  return fxBox_('vertical', pairs.filter(Boolean).map(function (p) {
    if (p === 'sep') return fxSep_('sm');
    const st = p[2] || {};
    return fxBox_('horizontal', [
      fxText_(p[0], { size: 'sm', color: FX.sub, flex: 5 }),
      fxText_(p[1], { size: 'sm', color: st.color || FX.text, flex: 6, align: 'end', weight: st.bold ? 'bold' : undefined }),
    ], { margin: 'sm' });
  }), { margin: (o && o.margin) || 'md' });
}

/**
 * การ์ด 1 ใบ: { title, lines: [บรรทัดรองในแถบหัว], body: [components], footer: 'หมายเหตุ' }
 */
function fxBubble_(o) {
  const head = [fxText_(o.title, { size: 'lg', weight: 'bold', color: FX.bandText, wrap: true })];
  (o.lines || []).forEach(function (l) {
    if (l) head.push(fxText_(l, { size: 'xs', color: FX.bandSub, wrap: true, margin: 'xs' }));
  });
  const bubble = {
    type: 'bubble',
    size: o.size || 'giga',
    header: fxBox_('vertical', head, { paddingAll: 'lg', backgroundColor: FX.band }),
    body: fxBox_('vertical', o.body, { paddingAll: 'lg', paddingTop: 'md' }),
  };
  if (o.footer) {
    bubble.footer = fxBox_('vertical', [fxText_(o.footer, { size: 'xs', color: FX.muted, wrap: true })],
      { paddingAll: 'lg', paddingTop: 'none' });
  }
  return bubble;
}

/** ข้อความ Flex — ใหญ่เกินที่ LINE รับ (bubble ≤ 30KB) จะส่งเป็นข้อความธรรมดาแทน */
function fxMessage_(altText, bubble) {
  const alt = truncate_(String(altText || 'รายงาน').replace(/\s+/g, ' ').trim(), 400);
  if (utf8Bytes_(JSON.stringify(bubble)) > FLEX_MAX_BYTES) {
    return { type: 'text', text: truncate_(flexToText_(bubble), 4900) };
  }
  return { type: 'flex', altText: alt, contents: bubble };
}

const FLEX_MAX_BYTES = 25000;

function utf8Bytes_(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** แปลงการ์ดเป็นข้อความธรรมดา (สำรองเมื่อ LINE ไม่รับ / ใช้ในการทดสอบ) */
function flexToText_(node) {
  if (!node) return '';
  if (node.type === 'flex') return flexToText_(node.contents);
  if (node.type === 'carousel') return node.contents.map(flexToText_).join('\n\n');
  if (node.type === 'bubble') {
    return ['header', 'body', 'footer'].map(function (k) { return node[k] ? flexToText_(node[k]) : ''; })
      .filter(Boolean).join('\n\n');
  }
  if (node.type === 'text') return node.text || '';
  if (node.type !== 'box') return '';
  if (node.layout === 'vertical') {
    const out = [];
    node.contents.forEach(function (c) {
      const s = flexToText_(c);
      if (!s) return;
      if (out.length && /^(lg|xl|xxl)$/.test(c.margin || '')) out.push('');
      out.push(s);
    });
    return out.join('\n');
  }
  const cells = node.contents.map(flexToText_).filter(Boolean).map(function (t) { return t.split('\n'); });
  const rows = Math.max.apply(null, cells.map(function (c) { return c.length; }).concat([0]));
  const out = [];
  for (let i = 0; i < rows; i++) {
    out.push(cells.map(function (c) { return c[i] || ''; }).filter(Boolean).join(' · '));
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- ตัวเลขในการ์ด

/** ตัน: ทศนิยม 1 ตำแหน่ง (น้อยกว่า 1 ตัน ใช้ 2 ตำแหน่ง) */
function fmtTon_(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return fmtNum_(n, Math.abs(n) < 1 && n !== 0 ? 2 : 1);
}

/** บาท → ล้านบาท ทศนิยม 2 ตำแหน่ง */
function fmtMB_(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return fmtNum_(n / 1e6, 2);
}

function fmtPct_(p, digits) {
  if (p === null || p === undefined || isNaN(p)) return '-';
  return fmtNum_(p, digits === undefined ? 0 : digits) + '%';
}

/** สัดส่วน: ไม่ถึง 1% แสดง "<1%" (ไม่ให้ดูเหมือน 0) */
function fmtShare_(p) {
  if (p === null || p === undefined || isNaN(p)) return '-';
  return p > 0 && p < 1 ? '<1%' : fmtPct_(p);
}

/** +12.3 / −4.5 */
function fmtSigned_(n, f) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return (n > 0 ? '+' : n < 0 ? '−' : '') + (f || fmtTon_)(Math.abs(n));
}

/** สีตาม % คาดปิด: ≥100 เขียว, 95–99 ส้ม, <95 แดง */
function pctColor_(p) {
  if (p === null || p === undefined || isNaN(p)) return FX.text;
  return p >= 100 ? FX.green : p >= 95 ? FX.amber : FX.red;
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

/**
 * ข้อมูลยอดจากไฟล์ที่นำเข้า — ยังไม่มีไฟล์จะคืน { source: 'none' }
 * (ใช้ dashboard.json เดิมได้ถ้าตั้ง USE_DASHBOARD_JSON = true)
 */
function getSalesSnapshot_() {
  const rows = readSalesRows_();
  const snap = rows.length ? buildSalesSnapshot_(rows, now_()) : null;
  if (snap) return snap;
  return flag_('USE_DASHBOARD_JSON', false) ? fetchDashboard_() : { source: 'none' };
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
function teamKey_(s) {
  const n = normName_(s);
  const m = n.match(/^(?:fish|f|เขต|zone|z)(\d+)$/);
  return m ? 'f' + Number(m[1]) : n;
}

/** "f4", "F4", "fish4", "Fish 4", "เขต4" → เขตเดียวกัน */
function findTeam_(d, q) {
  const k = teamKey_(q);
  return teamsOf_(d).find(function (t) { return teamKey_(t.name) === k; }) || null;
}

function teamLine_(t) {
  return '🐟 ' + t.name + ': ' + fmtNum_(t.actualTon) +
    (t.budgetTon ? ' / ' + fmtNum_(t.budgetTon) + ' ตัน (' + fmtNum_(t.achievement) + '%)' : ' ตัน');
}

/** team: null = ภาพรวม หรือ object ทีมจาก findTeam_ */
/** รายงานยอดเป็นหลายบับเบิล (ไฟล์ Power BI) หรือข้อความเดียว (dashboard.json) */
function salesMessages_(d, team, opt) {
  if (d.source === 'sheet') return salesSheetMessages_(d, team, opt);
  return [formatSales_(d, team)];
}

function formatSales_(d, team) {
  if (d.source === 'none') return NO_SHEET_SALES_TEXT;
  if (d.source === 'sheet') return formatSalesSheet_(d, team);
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

/** 🟢/🟡/🔴 ตาม % คาดปิด (ใช้ในข้อความแบบเดิม) */
function forecastIcon_(m) {
  const p = m.forecastPct !== null && m.forecastPct !== undefined ? m.forecastPct : m.forecastPctAmt;
  if (p === null || p === undefined) return '';
  return p >= 100 ? ' 🟢' : p >= 95 ? ' 🟡' : ' 🔴';
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
  if (d.source === 'sheet') {
    const lines = ['📊 ยอดถึง ' + fmtDate_(d.asOf) + ' (วันทำงาน ' + d.workingDaysPassed + '/' + d.workingDaysTotal + ')',
      'ตัน ' + fmtNum_(t.actualTon) + pctText_(t.achievement) + ' → ปิด ' + fmtNum_(t.forecastTon) + pctText_(t.forecastPct) + forecastIcon_(t)];
    if (d.hasAmount) lines.push('บาท ' + fmtMoney_(t.actualAmt) + pctText_(t.achievementAmt) + ' → ปิด ' + fmtMoney_(t.forecastAmt) + pctText_(t.forecastPctAmt));
    if (d.teams.length) {
      lines.push(d.teams.map(function (z) { return z.name + ' ' + fmtNum_(z.forecastPct !== null ? z.forecastPct : z.achievement, 0) + '%' + forecastIcon_(z); }).join(' · '));
    }
    let x = lines.join('\n');
    if (d.lastDay.unavailable) return x;
    x += '\n📅 วันที่ ' + fmtDate_(d.lastDay.date) + ' ' + fmtNum_(d.lastDay.total) + ' ตัน' + (d.hasAmount && !d.lastDay.amtUnknown ? ' · ' + fmtMoney_(d.lastDay.totalAmt) : '');
    if (d.lastDay.bySales.length) {
      x += ' · ท็อป: ' + d.lastDay.bySales.slice(0, 3).map(function (e) { return e.name + ' ' + fmtNum_(e.ton, 1); }).join(', ');
    }
    return x;
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

// ---------- Cards.gs ----------
/**
 * การ์ดรายงานยอดขาย (Flex) — ตารางคอลัมน์ตรง อ่านง่ายบนมือถือ
 * ตัวเลข: ตันทศนิยม 1 ตำแหน่ง · มูลค่าเป็นล้านบาท 2 ตำแหน่ง · สีคาดปิด เขียว ≥100% ส้ม 95–99% แดง <95%
 */

const ROWS_PER_CARD = 30;
const PCT_LEGEND = 'สี: เขียว ≥100% · ส้ม 95–99% · แดง <95%';

function cardWd_(snap, detail) {
  return detail && snap.detailWd ? snap.detailWd : { passed: snap.workingDaysPassed, total: snap.workingDaysTotal };
}

/** บรรทัดรองใต้หัวการ์ด: วันที่ข้อมูล + วันทำงาน + Time gone */
function cardDateLines_(snap, detail) {
  const asOf = detail && snap.detailAsOf ? snap.detailAsOf : snap.asOf;
  const wd = cardWd_(snap, detail);
  return ['ข้อมูลถึง ' + fmtDateShortYear_(asOf),
    'วันทำงาน ' + wd.passed + '/' + wd.total + ' · เหลือ ' + (wd.total - wd.passed) + ' วัน · Time gone ' + fmtPct_(wd.passed / wd.total * 100)];
}

/** ⚠️ ไฟล์ยอดเก่าเกิน 2 วัน (ลืมส่งไฟล์) */
function staleNote_(snap) {
  const age = Math.round((startOfDay_(now_()) - startOfDay_(snap.asOf)) / 86400000);
  return age > 2 ? fxText_('⚠️ ยอดยังไม่อัปเดต — ข้อมูลล่าสุด ' + age + ' วันก่อน', { size: 'sm', weight: 'bold', color: FX.red, wrap: true }) : null;
}

/** สถานะคาดปิดเดือน (ตัวใหญ่ มีสี) */
function statusRow_(m) {
  const p = m.forecastPct !== null && m.forecastPct !== undefined ? m.forecastPct : m.forecastPctAmt;
  if (p === null || p === undefined) return null;
  const word = p >= 100 ? 'ถึงเป้า' : p >= 95 ? 'ใกล้เป้า' : 'ต่ำกว่าเป้า';
  return fxBox_('horizontal', [
    fxText_('คาดปิดเดือน', { size: 'sm', color: FX.sub, flex: 4, gravity: 'center' }),
    fxText_(fmtPct_(p, 1) + ' · ' + word, { size: 'lg', weight: 'bold', color: pctColor_(p), flex: 7, align: 'end' }),
  ], { margin: 'sm' });
}

/** ตารางตัวเลขหลัก (ภาพรวม / เขต): ตัน | ล้านบาท */
function metricsTable_(m, snap, last) {
  const amt = !!(snap.hasAmount || m.budgetAmt);
  const cols = [{ label: 'รายการ', flex: 6, wrap: true }, { label: 'ตัน', flex: 5, align: 'end' }];
  if (amt) cols.push({ label: 'ล้านบาท', flex: 4, align: 'end' });
  const rows = [];
  const add = function (label, ton, mb, bold) {
    const cells = [label, ton];
    if (amt) cells.push(mb);
    rows.push(bold ? { cells: cells, bold: true } : cells);
  };
  const hasBudget = !!(m.budgetTon || m.budgetAmt);
  add('ทำได้', fmtTon_(m.actualTon), fmtMB_(m.actualAmt), true);
  if (hasBudget) {
    add('เป้า', m.budgetTon ? fmtTon_(m.budgetTon) : '-', m.budgetAmt ? fmtMB_(m.budgetAmt) : '-');
    add('สำเร็จ', fmtPct_(m.achievement, 1), fmtPct_(m.achievementAmt, 1));
  }
  rows.push('sep');
  add('สปีด / วัน', fmtTon_(m.currentSpeed), fmtMB_(m.speedAmt));
  if (hasBudget) {
    const gapT = m.requiredSpeed !== undefined ? m.currentSpeed - m.requiredSpeed : null;
    const gapA = m.requiredAmt !== undefined ? m.speedAmt - m.requiredAmt : null;
    const tone = function (g) { return g === null ? FX.text : g >= 0 ? FX.green : FX.red; };
    add('ต้องทำ / วัน', { t: m.requiredSpeed !== undefined ? fmtTon_(m.requiredSpeed) : '-', color: tone(gapT) },
      { t: m.requiredAmt !== undefined ? fmtMB_(m.requiredAmt) : '-', color: tone(gapA) });
    add('ส่วนต่าง / วัน', { t: gapT === null ? '-' : fmtSigned_(gapT), color: tone(gapT) },
      { t: gapA === null ? '-' : fmtSigned_(gapA, fmtMB_), color: tone(gapA) });
  }
  rows.push('sep');
  add('คาดปิดเดือน', fmtTon_(m.forecastTon), fmtMB_(m.forecastAmt), true);
  if (hasBudget) {
    add('คาดปิด % เป้า', { t: fmtPct_(m.forecastPct, 1), color: pctColor_(m.forecastPct), bold: true },
      { t: fmtPct_(m.forecastPctAmt, 1), color: pctColor_(m.forecastPctAmt), bold: true });
  }
  if (flag_('SHOW_CHALLENGE', false) && (m.challengeTon || m.challengeAmt)) {
    rows.push('sep');
    add('Challenge', m.challengeTon ? fmtTon_(m.challengeTon) : '-', m.challengeAmt ? fmtMB_(m.challengeAmt) : '-');
    add('คาดปิด % Challenge', fmtPct_(m.challengePct, 1), fmtPct_(m.challengePctAmt, 1));
  }
  if (m.lastTon || m.lastAmt) {
    rows.push('sep');
    add('ปีก่อน', m.lastTon ? fmtTon_(m.lastTon) : '-', m.lastAmt ? fmtMB_(m.lastAmt) : '-');
  }
  if (last) {
    rows.push('sep');
    add(last.label, fmtSigned_(last.ton), last.amt === null ? '-' : fmtSigned_(last.amt, fmtMB_));
  }
  return fxTable_(cols, rows, { margin: 'lg' });
}

/** ยอดวันล่าสุดของ รวม/เขต (null = ยังไม่มีไฟล์วันก่อนหน้า) */
function lastDayInfo_(snap, teamName) {
  const ld = snap.lastDay;
  if (ld.unavailable) return null;
  let ton = ld.total;
  let amt = ld.totalAmt;
  if (teamName) {
    const e = ld.byTeam.find(function (x) { return x.name === teamName; });
    ton = e ? e.ton : 0;
    amt = e ? e.amt : 0;
  }
  return { label: lastDayLabel_(ld) === 'วันล่าสุด' ? 'วันล่าสุด ' + fmtDate_(ld.date).replace(/^\S+ /, '') : lastDayLabel_(ld),
    ton: ton, amt: snap.hasAmount && !ld.amtUnknown ? amt : null };
}

// ---------------------------------------------------------------- ภาพรวม + รายเขต

function overviewCard_(snap, opt) {
  const o = opt || {};
  const t = snap.total;
  const body = [staleNote_(snap), statusRow_(t), metricsTable_(t, snap, lastDayInfo_(snap, null))];
  if (snap.lastDay.unavailable) body.push(fxNote_('ยอดรายวันจะเริ่มคิดเมื่อมีไฟล์ของวันถัดไป'));
  const lines = cardDateLines_(snap);
  const title = o.greeting ? '☀️ สวัสดีตอนเช้าค่ะ' : '📊 ยอดขายสะสม · ทุกเขต';
  if (o.greeting) lines.unshift(fmtDateLong_(o.greeting) + ' · ยอดขายสะสมทุกเขต');
  return fxMessage_('📊 ยอดขายสะสม ถึง ' + fmtDate_(snap.asOf) + ': ' + fmtTon_(t.actualTon) + ' ตัน' +
    (t.budgetTon ? ' (' + fmtPct_(t.achievement, 1) + ') คาดปิด ' + fmtPct_(t.forecastPct, 1) : ''),
  fxBubble_({ title: title, lines: lines, body: body, footer: 'พิมพ์ F1–F5 ดูรายเขต · ชื่อเซลส์ / ชื่อลูกค้า ดูรายคน' }));
}

function zonesCard_(snap) {
  const teams = snap.teams;
  const total = snap.total;
  const hasBudget = teams.some(function (z) { return z.budgetTon || z.budgetAmt; });
  const amt = !!(snap.hasAmount || teams.some(function (z) { return z.budgetAmt; }));
  const body = [staleNote_(snap)];
  const totalRow = function (cells) { return { cells: cells, bold: true }; };

  if (hasBudget) {
    const pctCell = function (p) { return { t: fmtPct_(p), color: pctColor_(p), bold: true }; };
    const tonCols = [{ label: 'เขต', flex: 2 }, { label: 'ทำได้', flex: 4, align: 'end' }, { label: 'เป้า', flex: 4, align: 'end' },
      { label: 'สำเร็จ', flex: 3, align: 'end' }, { label: 'คาดปิด', flex: 3, align: 'end' }];
    body.push(fxSection_('⚖️ ยอด (ตัน)'));
    body.push(fxTable_(tonCols, teams.map(function (z) {
      return [z.name, fmtTon_(z.actualTon), fmtTon_(z.budgetTon), fmtPct_(z.achievement), pctCell(z.forecastPct)];
    }).concat(['sep', totalRow(['รวม', fmtTon_(total.actualTon), fmtTon_(total.budgetTon), fmtPct_(total.achievement), pctCell(total.forecastPct)])]),
    { margin: 'sm' }));

    const gapCell = function (z) {
      if (z.requiredSpeed === undefined) return '-';
      const g = z.currentSpeed - z.requiredSpeed;
      return { t: fmtSigned_(g), color: g >= 0 ? FX.green : FX.red };
    };
    body.push(fxSection_('🚀 สปีด (ตัน / วัน)'));
    body.push(fxTable_([{ label: 'เขต', flex: 2 }, { label: 'ทำได้', flex: 3, align: 'end' }, { label: 'ต้องทำ', flex: 3, align: 'end' },
      { label: 'ส่วนต่าง', flex: 3, align: 'end' }], teams.map(function (z) {
      return [z.name, fmtTon_(z.currentSpeed), z.requiredSpeed !== undefined ? fmtTon_(z.requiredSpeed) : '-', gapCell(z)];
    }).concat(['sep', totalRow(['รวม', fmtTon_(total.currentSpeed), total.requiredSpeed !== undefined ? fmtTon_(total.requiredSpeed) : '-', gapCell(total)])]),
    { margin: 'sm' }));

    if (amt && !teams.some(function (z) { return z.budgetAmt; })) {
      // มีมูลค่าแต่ไม่มีเป้าบาท → ทำได้ สปีด คาดปิด
      body.push(fxSection_('💰 มูลค่า (ล้านบาท)'));
      body.push(fxTable_([{ label: 'เขต', flex: 2 }, { label: 'ทำได้', flex: 4, align: 'end' }, { label: 'สปีด/วัน', flex: 3, align: 'end' },
        { label: 'คาดปิด', flex: 4, align: 'end' }], teams.map(function (z) {
        return [z.name, fmtMB_(z.actualAmt), fmtMB_(z.speedAmt), fmtMB_(z.forecastAmt)];
      }).concat(['sep', totalRow(['รวม', fmtMB_(total.actualAmt), fmtMB_(total.speedAmt), fmtMB_(total.forecastAmt)])]), { margin: 'sm' }));
    } else if (amt) {
      body.push(fxSection_('💰 มูลค่า (ล้านบาท)'));
      body.push(fxTable_(tonCols, teams.map(function (z) {
        return [z.name, fmtMB_(z.actualAmt), z.budgetAmt ? fmtMB_(z.budgetAmt) : '-', fmtPct_(z.achievementAmt), pctCell(z.forecastPctAmt)];
      }).concat(['sep', totalRow(['รวม', fmtMB_(total.actualAmt), total.budgetAmt ? fmtMB_(total.budgetAmt) : '-', fmtPct_(total.achievementAmt), pctCell(total.forecastPctAmt)])]),
      { margin: 'sm' }));
    }
  } else {
    // ไม่มีเป้า: ยอด สปีด คาดปิด
    body.push(fxTable_([{ label: 'เขต', flex: 2 }, { label: 'ทำได้ (ตัน)', flex: 4, align: 'end' }, { label: 'สปีด/วัน', flex: 3, align: 'end' },
      { label: 'คาดปิด', flex: 4, align: 'end' }], teams.map(function (z) {
      return [z.name, fmtTon_(z.actualTon), fmtTon_(z.currentSpeed), fmtTon_(z.forecastTon)];
    }).concat(['sep', totalRow(['รวม', fmtTon_(total.actualTon), fmtTon_(total.currentSpeed), fmtTon_(total.forecastTon)])]), { margin: 'sm' }));
  }
  return fxMessage_('📍 รายเขต F1–F5 ถึง ' + fmtDate_(snap.asOf) + ': ' + teams.map(function (z) {
    return z.name + ' ' + (z.forecastPct !== null && z.forecastPct !== undefined ? fmtPct_(z.forecastPct) : fmtTon_(z.actualTon));
  }).join(' · '),
  fxBubble_({ title: '📍 รายเขต F1–F5', lines: cardDateLines_(snap), body: body,
    footer: (hasBudget ? 'คาดปิด = % ของเป้า ณ สิ้นเดือน\n' + PCT_LEGEND + '\n' : '') + 'พิมพ์ F1–F5 ดูละเอียดรายเขต' }));
}

function zoneDetailCard_(snap, team) {
  const body = [staleNote_(snap), statusRow_(team), metricsTable_(team, snap, lastDayInfo_(snap, team.name))];
  if (snap.lastDay.unavailable) body.push(fxNote_('ยอดรายวันจะเริ่มคิดเมื่อมีไฟล์ของวันถัดไป'));
  const members = snap.salesList.filter(function (s) { return s.team === team.name && Math.abs(s.actualTon) > 1e-9; });
  if (members.length) {
    const withBudget = members.some(function (s) { return s.budgetTon; });
    body.push(fxSection_('👥 เซลส์ในเขต ' + members.length + ' คน' + (snap.detailAsOf ? ' (ถึง ' + fmtDate_(snap.detailAsOf) + ')' : '')));
    body.push(fxTable_([{ label: 'เซลส์', flex: 7, wrap: true }, { label: 'ตัน', flex: 3, align: 'end' },
      { label: 'คาดปิด', flex: 3, align: 'end' }, { label: withBudget ? '% เป้า' : 'สัดส่วน', flex: 3, align: 'end' }],
    members.map(function (s) {
      return [s.name, fmtTon_(s.actualTon), fmtTon_(s.forecastTon),
        withBudget ? { t: fmtPct_(s.forecastPct), color: pctColor_(s.forecastPct) } : fmtShare_(team.actualTon ? s.actualTon / team.actualTon * 100 : null)];
    }), { margin: 'sm' }));
  }
  return fxMessage_('📊 ' + team.name + ' ถึง ' + fmtDate_(snap.asOf) + ': ' + fmtTon_(team.actualTon) + ' ตัน' +
    (team.forecastPct !== null && team.forecastPct !== undefined ? ' คาดปิด ' + fmtPct_(team.forecastPct, 1) : ''),
  fxBubble_({ title: '📊 ' + team.name + ' · ยอดสะสม', lines: cardDateLines_(snap), body: body,
    footer: 'พิมพ์ชื่อเซลส์ ดูลูกค้ารายคน · ลูกค้า ' + team.name + ' ดูลูกค้าทั้งเขต' }));
}

// ---------------------------------------------------------------- รายคน / ลูกค้า

/**
 * ตารางลูกค้าแบ่งหลายการ์ด (การ์ดละ 30 ราย)
 * rows = [{ name, ton, pct, extra }] · opts: { extraLabel, footer, startNo (เลขลำดับเริ่มต่อจาก), maxCards }
 */
function customerTableCards_(title, lines, rows, opts) {
  const o = opts || {};
  const start = o.startNo || 0;
  const totalCount = start + rows.length;
  const cols = [{ label: '#', flex: 1, align: 'end' }, { label: 'ลูกค้า', flex: o.extraLabel ? 7 : 9, wrap: true },
    { label: 'ตัน', flex: 3, align: 'end' }, { label: '%', flex: 2, align: 'end' }];
  if (o.extraLabel) cols.push({ label: o.extraLabel, flex: 3, wrap: true });
  const cells = rows.map(function (r, i) {
    const c = [String(start + i + 1), r.name, fmtTon_(r.ton), fmtShare_(r.pct)];
    if (o.extraLabel) c.push(r.extra || '-');
    return c;
  });
  const maxCards = o.maxCards || 5;
  const cards = [];
  for (let i = 0; i < cells.length && cards.length < maxCards; i += ROWS_PER_CARD) {
    const part = cells.slice(i, i + ROWS_PER_CARD);
    const cont = start + i > 0;
    const isLast = i + ROWS_PER_CARD >= cells.length || cards.length + 1 === maxCards;
    const more = cells.length - (i + part.length);
    const footer = isLast ? (more > 0 ? '…และอีก ' + more + ' ราย' : o.footer) : undefined;
    cards.push(fxMessage_(title + (cont ? ' (ต่อ)' : ''), fxBubble_({
      title: title + (cont ? ' (ต่อ)' : ''),
      lines: cont ? ['ลำดับ ' + (start + i + 1) + '–' + (start + i + part.length) + ' จาก ' + totalCount] : lines,
      body: [fxTable_(cols, part, { margin: 'none' })],
      footer: footer,
    })));
  }
  return cards;
}

function personCards_(snap, person) {
  const rows = snap.monthRows.filter(function (r) { return r.sales === person.name; });
  const zone = person.team ? snap.teams.find(function (t) { return t.name === person.team; }) : null;
  const wd = cardWd_(snap, true);
  const remain = wd.total - wd.passed;
  const kv = [['ยอดเดือนนี้', fmtTon_(person.actualTon) + ' ตัน', { bold: true }]];
  if (zone && zone.actualTon) kv.push(['สัดส่วนในเขต ' + zone.name, fmtPct_(person.actualTon / zone.actualTon * 100)]);
  kv.push(['สปีด / วัน', fmtTon_(person.currentSpeed) + ' ตัน']);
  kv.push(['คาดปิดเดือน', fmtTon_(person.forecastTon) + ' ตัน', { bold: true }]);
  if (person.budgetTon) {
    kv.push('sep');
    kv.push(['เป้า', fmtTon_(person.budgetTon) + ' ตัน']);
    kv.push(['สำเร็จ', fmtPct_(person.achievement, 1)]);
    kv.push(['คาดปิด % เป้า', fmtPct_(person.forecastPct, 1), { color: pctColor_(person.forecastPct), bold: true }]);
    if (remain > 0 && person.actualTon < person.budgetTon) {
      kv.push(['ต้องทำ / วัน', fmtTon_((person.budgetTon - person.actualTon) / remain) + ' ตัน', { color: FX.red }]);
    }
  }
  const lastRows = rows.filter(function (r) { return r.date.getTime() === snap.asOf.getTime(); });
  if (!snap.lastDay.unavailable && lastRows.length && !lastRows.some(function (r) { return r.firstSnap; })) {
    kv.push(['วันล่าสุด ' + fmtDate_(snap.asOf).replace(/^\S+ /, ''), fmtSigned_(lastRows.reduce(function (a, r) { return a + r.ton; }, 0)) + ' ตัน']);
  }
  const cust = sortedEntries_(sumBy_(rows.filter(function (r) { return r.customer; }), 'customer'))
    .filter(function (e) { return Math.abs(e.ton) > 1e-9; });
  const total = cust.reduce(function (a, e) { return a + e.ton; }, 0);
  const custRows = cust.map(function (e) { return { name: e.name, ton: e.ton, pct: total ? e.ton / total * 100 : null }; });
  const lines = [(person.team ? 'เขต ' + person.team + ' · ' : '') + 'ข้อมูลถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf),
    'วันทำงาน ' + wd.passed + '/' + wd.total + ' · เหลือ ' + remain + ' วัน'];
  const body = [fxKV_(kv, { margin: 'none' })];
  const FIRST = 15;
  if (custRows.length) {
    body.push(fxSection_('👥 ลูกค้า ' + custRows.length + ' ราย'));
    body.push(fxTable_([{ label: '#', flex: 1, align: 'end' }, { label: 'ลูกค้า', flex: 9, wrap: true },
      { label: 'ตัน', flex: 3, align: 'end' }, { label: '%', flex: 2, align: 'end' }],
    custRows.slice(0, FIRST).map(function (r, i) { return [String(i + 1), r.name, fmtTon_(r.ton), fmtShare_(r.pct)]; }), { margin: 'sm' }));
  }
  const prod = sortedEntries_(sumBy_(rows.filter(function (r) { return r.product; }), 'product'));
  if (prod.length) {
    body.push(fxSection_('📦 สินค้า'));
    body.push(fxTable_([{ label: 'สินค้า', flex: 9, wrap: true }, { label: 'ตัน', flex: 3, align: 'end' }],
      prod.slice(0, 5).map(function (e) { return [e.name, fmtTon_(e.ton)]; }), { margin: 'sm' }));
  }
  const cards = [fxMessage_('👤 ' + person.name + ': ' + fmtTon_(person.actualTon) + ' ตัน · ลูกค้า ' + custRows.length + ' ราย',
    fxBubble_({ title: '👤 ' + person.name, lines: lines, body: body,
      footer: custRows.length > FIRST ? 'ลูกค้าลำดับ ' + (FIRST + 1) + ' เป็นต้นไป อยู่ในข้อความถัดไป' : '% = สัดส่วนในยอดของเซลส์คนนี้' }))];
  if (custRows.length > FIRST) {
    customerTableCards_('👥 ลูกค้าของ ' + person.name.split(' ')[0], [], custRows.slice(FIRST),
      { startNo: FIRST, maxCards: 4, footer: '% = สัดส่วนในยอดของเซลส์คนนี้' }).forEach(function (c) { cards.push(c); });
  }
  return cards.length === 1 ? cards[0] : cards;
}

function zoneCustomerCards_(snap, zone) {
  const cust = {};
  snap.monthRows.forEach(function (r) {
    if (!r.customer || r.team !== zone) return;
    const c = cust[r.customer] || (cust[r.customer] = { name: r.customer, sales: r.sales, ton: 0 });
    c.ton += r.ton;
  });
  const list = Object.keys(cust).map(function (k) { return cust[k]; })
    .filter(function (c) { return Math.abs(c.ton) > 1e-9; })
    .sort(function (a, b) { return b.ton - a.ton; });
  if (!list.length) return 'ยังไม่มียอดรายลูกค้าของ ' + zone + ' ค่ะ';
  const sum = list.reduce(function (a, c) { return a + c.ton; }, 0);
  const t = snap.teams.find(function (x) { return x.name === zone; });
  const zoneTon = t && t.actualTon ? t.actualTon : sum;
  const cards = customerTableCards_('👥 ลูกค้า ' + zone,
    [list.length + ' ราย · รวม ' + fmtTon_(sum) + ' ตัน', 'ข้อมูลถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf)],
    list.map(function (c) { return { name: c.name, ton: c.ton, pct: c.ton / zoneTon * 100 }; }),
    { footer: '% = สัดส่วนในยอดเขต ' + zone + ' · พิมพ์ชื่อลูกค้า หรือชื่อเซลส์ ดูรายละเอียด' });
  return cards.length === 1 ? cards[0] : cards;
}

function customerCard_(snap, name) {
  const rows = snap.monthRows.filter(function (r) { return r.customer === name; });
  if (!rows.length) return '🏪 ' + name + '\nยังไม่มียอดเดือนนี้ค่ะ';
  const ton = sumField_(rows, 'ton');
  const amt = sumField_(rows, 'amount');
  const wd = cardWd_(snap, true);
  const m = salesMetrics_(name, ton, amt, null, null, wd);
  const zones = uniq_(rows.map(function (r) { return r.team; }));
  const pics = sortedEntries_(sumBy_(rows.filter(function (r) { return r.sales; }), 'sales'))
    .filter(function (e) { return Math.abs(e.ton) > 1e-9; }).map(function (e) { return e.name; });
  const custHasAmt = snap.hasAmount && rows.some(function (r) { return typeof r.amount === 'number' && !isNaN(r.amount) && r.amount !== 0; });
  const kv = [['ยอดเดือนนี้', fmtTon_(ton) + ' ตัน', { bold: true }]];
  if (custHasAmt) kv.push(['มูลค่า', fmtMB_(amt) + ' ล้านบาท']);
  kv.push(['สปีด / วัน', fmtTon_(m.currentSpeed) + ' ตัน']);
  kv.push(['คาดปิดเดือน', fmtTon_(m.forecastTon) + ' ตัน', { bold: true }]);
  if (zones.length === 1) {
    const z = snap.teams.find(function (t) { return t.name === zones[0]; });
    if (z && z.actualTon) kv.push(['สัดส่วนในเขต ' + z.name, fmtPct_(ton / z.actualTon * 100, 1)]);
  }
  const body = [fxKV_(kv, { margin: 'none' })];
  // รายวัน (จากผลต่างยอดสะสม) — ไม่นับไฟล์รายลูกค้าไฟล์แรกของเดือน (เป็นยอดสะสมทั้งก้อน)
  const byDay = {};
  const firstDays = {};
  rows.forEach(function (r) {
    const k = r.date.getTime();
    if (r.firstSnap) firstDays[k] = true;
    const d = byDay[k] || (byDay[k] = { ton: 0, amt: 0, amtKnown: false });
    d.ton += r.ton;
    if (typeof r.amount === 'number' && !isNaN(r.amount) && !r.amtLump) { d.amt += r.amount; d.amtKnown = true; }
  });
  const days = Object.keys(byDay).map(Number).sort(function (a, b) { return b - a; })
    .filter(function (t) { return t !== snap.lastDay.firstSnapshot && !firstDays[t]; });
  if (days.length) {
    const showAmt = custHasAmt && days.some(function (t) { return byDay[t].amtKnown; });
    const cols = [{ label: 'วันที่', flex: 5 }, { label: 'ตัน', flex: 4, align: 'end' }];
    if (showAmt) cols.push({ label: 'ล้านบาท', flex: 4, align: 'end' });
    body.push(fxSection_('📅 รายวันล่าสุด'));
    body.push(fxTable_(cols, days.slice(0, 7).map(function (t) {
      const d = byDay[t];
      const c = [fmtDate_(new Date(t)), fmtSigned_(d.ton)];
      if (showAmt) c.push(d.amtKnown ? fmtSigned_(d.amt, fmtMB_) : '-');
      return c;
    }), { margin: 'sm' }));
  }
  return fxMessage_('🏪 ' + name + ': ' + fmtTon_(ton) + ' ตัน (ถึง ' + fmtDate_(snap.detailAsOf || snap.asOf) + ')',
    fxBubble_({ title: '🏪 ' + name,
      lines: [(zones.join(', ') || '-') + (pics.length ? ' · 👤 ' + pics.join(', ') : ''),
        'ข้อมูลถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf) + ' · วันทำงาน ' + wd.passed + '/' + wd.total],
      body: body }));
}

// ---------------------------------------------------------------- อันดับ / ท็อป / ยอดเมื่อวาน

function rankCards_(snap) {
  if (!snap.salesList || !snap.salesList.length) return 'ยังไม่มียอดรายเซลส์ค่ะ (ต้องใช้ไฟล์ยอดรายลูกค้า)';
  const list0 = snap.salesList.filter(function (s) { return Math.abs(s.actualTon) > 1e-9 || s.budgetTon; });
  const anyTarget = list0.some(function (s) { return s.budgetTon; });
  const list = anyTarget
    ? list0.slice().sort(function (a, b) { return (b.achievement || -1) - (a.achievement || -1) || b.actualTon - a.actualTon; })
    : list0;
  const tg = timeGonePct_(snap);
  const cols = [{ label: '#', flex: 1, align: 'end' }, { label: 'เซลส์', flex: 9, wrap: true }, { label: 'เขต', flex: 2 },
    { label: 'ตัน', flex: 3, align: 'end' }, { label: anyTarget ? '% เป้า' : 'คาดปิด', flex: 3, align: 'end' }];
  const rows = list.map(function (s, i) {
    const last = anyTarget
      ? { t: fmtPct_(s.achievement), color: s.achievement === null ? FX.text : s.achievement >= tg ? FX.green : s.achievement >= tg - 10 ? FX.amber : FX.red }
      : fmtTon_(s.forecastTon);
    return [String(i + 1), s.name, s.team || '-', fmtTon_(s.actualTon), last];
  });
  const cards = [];
  for (let i = 0; i < rows.length && cards.length < 5; i += ROWS_PER_CARD) {
    cards.push(fxMessage_('🏆 อันดับเซลส์ ถึง ' + fmtDate_(snap.detailAsOf || snap.asOf), fxBubble_({
      title: '🏆 อันดับเซลส์' + (i ? ' (ต่อ)' : ''),
      lines: i ? [] : ['เดือนนี้ ถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf) + ' · ' + list.length + ' คน', 'Time gone ' + fmtPct_(tg)],
      body: [fxTable_(cols, rows.slice(i, i + ROWS_PER_CARD), { margin: 'none' })],
      footer: anyTarget ? 'สี % เป้า: เขียว ทันเวลา · ส้ม ช้าไม่เกิน 10% · แดง ช้ากว่านั้น' : 'คาดปิด = ตันที่คาดว่าจะได้เมื่อสิ้นเดือน · พิมพ์ชื่อเซลส์ ดูลูกค้า',
    })));
  }
  return cards.length === 1 ? cards[0] : cards;
}

function topCard_(snap, key, n) {
  const rows = snap.monthRows.filter(function (r) { return r[key]; });
  if (!rows.length) return key === 'customer' ? 'ยังไม่มียอดรายลูกค้าค่ะ (ต้องใช้ไฟล์ยอดรายลูกค้า)' : 'ไฟล์ยอดยังไม่มีข้อมูลรายสินค้าค่ะ';
  const entries = sortedEntries_(sumBy_(rows, key)).filter(function (e) { return Math.abs(e.ton) > 1e-9; });
  const zoneOf = {};
  rows.forEach(function (r) { if (r.team && !zoneOf[r[key]]) zoneOf[r[key]] = r.team; });
  const isCust = key === 'customer';
  const top = entries.slice(0, n || 10);
  const title = (isCust ? '👥 ลูกค้าท็อป ' : '📦 สินค้าท็อป ') + top.length;
  const cols = [{ label: '#', flex: 1, align: 'end' }, { label: isCust ? 'ลูกค้า' : 'สินค้า', flex: 9, wrap: true }];
  if (isCust) cols.push({ label: 'เขต', flex: 2 });
  cols.push({ label: 'ตัน', flex: 3, align: 'end' });
  return fxMessage_(title + ' ถึง ' + fmtDate_(snap.detailAsOf || snap.asOf), fxBubble_({
    title: title,
    lines: ['เดือนนี้ ถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf) + ' · ทั้งหมด ' + entries.length + (isCust ? ' ราย' : ' รายการ')],
    body: [fxTable_(cols, top.map(function (e, i) {
      const c = [String(i + 1), e.name];
      if (isCust) c.push(zoneOf[e.name] || '-');
      c.push(fmtTon_(e.ton));
      return c;
    }), { margin: 'none' })],
    footer: isCust ? 'ดูลูกค้าทั้งเขต พิมพ์: ลูกค้า F3' : undefined,
  }));
}

function lastDayCard_(snap) {
  const ld = snap.lastDay;
  if (ld.unavailable) {
    return '📅 ยอดรายวันยังไม่มีค่ะ\nจะเริ่มคิดเมื่อมีไฟล์ของวันถัดไป (ยอดวันนี้ = ไฟล์วันนี้ − ไฟล์ก่อนหน้า)\n\n' +
      'สะสมเดือนนี้ ถึง ' + fmtDate_(ld.date) + ': ' + fmtTon_(snap.total.actualTon) + ' ตัน' +
      (snap.total.budgetTon ? ' (' + fmtPct_(snap.total.achievement, 1) + ' ของเป้า)' : '');
  }
  const amt = snap.hasAmount && !ld.amtUnknown;
  const label = lastDayLabel_(ld) === 'วันล่าสุด' ? 'ยอดขายวันที่ ' + fmtDate_(ld.date) : lastDayLabel_(ld);
  const body = [];
  const zoneCols = [{ label: 'เขต', flex: 3 }, { label: 'ตัน', flex: 4, align: 'end' }];
  if (amt) zoneCols.push({ label: 'ล้านบาท', flex: 4, align: 'end' });
  const zoneRows = ld.byTeam.slice().sort(function (a, b) { return zoneCompare_(a.name, b.name); }).map(function (t) {
    const c = [t.name, fmtSigned_(t.ton)];
    if (amt) c.push(fmtSigned_(t.amt, fmtMB_));
    return c;
  });
  const totalCells = ['รวม', fmtSigned_(ld.total)];
  if (amt) totalCells.push(fmtSigned_(ld.totalAmt, fmtMB_));
  body.push(fxTable_(zoneCols, zoneRows.concat(['sep', { cells: totalCells, bold: true }]), { margin: 'none' }));
  const top = function (entries, n, head) {
    body.push(fxSection_(head));
    body.push(fxTable_([{ label: '#', flex: 1, align: 'end' }, { label: 'ชื่อ', flex: 9, wrap: true }, { label: 'ตัน', flex: 3, align: 'end' }],
      entries.slice(0, n).map(function (e, i) { return [String(i + 1), e.name, fmtSigned_(e.ton)]; }), { margin: 'sm' }));
  };
  if (ld.bySales.length) top(ld.bySales, 10, '🏅 เซลส์ ' + Math.min(10, ld.bySales.length) + ' อันดับ');
  if (ld.byCustomer.length) top(ld.byCustomer, 5, '👥 ลูกค้า ' + Math.min(5, ld.byCustomer.length) + ' อันดับ');
  const t = snap.total;
  return fxMessage_('📅 ' + label + ': ' + fmtTon_(ld.total) + ' ตัน', fxBubble_({
    title: '📅 ' + label,
    lines: ['รวม ' + fmtSigned_(ld.total) + ' ตัน' + (amt ? ' · ' + fmtSigned_(ld.totalAmt, fmtMB_) + ' ล้านบาท' : '')],
    body: body,
    footer: 'สะสมเดือนนี้ ' + fmtTon_(t.actualTon) + (t.budgetTon ? ' / ' + fmtTon_(t.budgetTon) : '') + ' ตัน' +
      (t.budgetTon ? ' (' + fmtPct_(t.achievement, 1) + ')' : '') +
      (snap.hasAmount ? ' · ' + fmtMB_(t.actualAmt) + ' ล้านบาท' + (t.budgetAmt ? ' (' + fmtPct_(t.achievementAmt, 1) + ')' : '') : ''),
  }));
}

// ---------- Ai.gs ----------
/**
 * วิเคราะห์ยอดขายด้วย Claude (ไม่บังคับ)
 *
 * เปิดใช้ (เลือกอย่างใดอย่างหนึ่ง):
 *   GEMINI_API_KEY    = คีย์จาก aistudio.google.com  (Google Gemini — มีแบบฟรี)
 *   ANTHROPIC_API_KEY = คีย์จาก console.anthropic.com (Claude)
 * มีทั้งสองคีย์: เลือกด้วย AI_PROVIDER = gemini | claude (ค่าเริ่มต้นใช้ Gemini ถ้ามีคีย์)
 * ไม่มีคีย์ = ข้ามส่วนนี้ บอทยังรายงานตัวเลขตามปกติ
 * ผลวิเคราะห์ถูก cache ตามวันที่ของข้อมูล — ไฟล์เดิมถามซ้ำไม่เสียเงินซ้ำ
 */

const AI_MODEL = 'claude-opus-5-5';
const AI_API_URL = 'https://api.anthropic.com/v1/messages';

// รูปแบบที่อ่านง่ายบนมือถือ: หัวข้อ emoji + bullet สั้น ๆ + เว้นบรรทัดระหว่างหัวข้อ
const AI_FORMAT_RULES = [
  'รูปแบบคำตอบ (สำคัญมาก — คนอ่านบนมือถือ ถ้าอ่านยากจะไม่อ่าน):',
  '- แบ่งเป็นหัวข้อ แต่ละหัวข้อขึ้นต้นด้วย emoji 1 ตัว + ชื่อหัวข้อสั้น ๆ',
  '- ใต้หัวข้อเป็นบรรทัด "• " หัวข้อละไม่เกิน 3 บรรทัด',
  '- 1 บรรทัด = 1 ประเด็น ไม่เกิน 35 ตัวอักษร ห้ามเขียนเป็นประโยคยาวหรือย่อหน้า',
  '- เว้นบรรทัดว่าง 1 บรรทัดระหว่างหัวข้อ',
  '- ตัวเลข: ตันทศนิยม 1 ตำแหน่ง, % ไม่มีทศนิยม, เงินเป็น "ล้าน" ทศนิยม 1 ตำแหน่ง',
  '- ห้ามใช้ markdown (**, #, ตาราง) ห้ามขึ้นต้นด้วยคำเกริ่น',
].join('\n');

const AI_SYSTEM_PROMPT = [
  'คุณคือ "น้องขุนศึก" ผู้ช่วยผู้จัดการฝ่ายขายอาหารปลา TFM (เขต F1–F5) พูดสุภาพแบบผู้หญิง (ค่ะ/คะ)',
  'อ่านยอดขายสะสมของเดือนที่ได้รับ แล้วเขียนบทวิเคราะห์สั้น ๆ ส่งในกลุ่ม LINE ของทีมขาย',
  'ใช้ตัวเลขจากข้อมูลเท่านั้น ห้ามสมมติตัวเลข ไม่ต้องทวนตัวเลขทุกตัว เลือกเฉพาะที่สำคัญ',
  AI_FORMAT_RULES,
  'เขียนตามแบบนี้ (ข้ามหัวข้อที่ไม่มีข้อมูล):',
  '📌 ภาพรวม',
  '• คาดปิด 86% ของเป้า (ยังไม่ถึง)',
  '• ต้องเพิ่มอีก 112.6 ตัน/วัน',
  '',
  '✅ เขตที่ทำได้ดี',
  '• F5 คาดปิด 105% เกินเป้า',
  '',
  '⚠️ เขตที่ต้องเร่ง',
  '• F1 คาดปิด 42% ต้องเพิ่ม +35.6 ตัน/วัน',
  '',
  '📅 ยอดวันล่าสุด',
  '• รวม +191.8 ตัน (F3 มากสุด)',
  '',
  '💡 ทำได้ทันที',
  '• ข้อแนะนำ 1–2 ข้อ สั้น ๆ ทำได้จริง',
].join('\n');

/**
 * จัดข้อความจาก AI ให้อ่านง่ายบน LINE (กันกรณีโมเดลไม่ทำตามรูปแบบ)
 *  - ตัด markdown, เปลี่ยน -, * เป็น •
 *  - บรรทัดยาวเกิน → ตัดเป็นหลายบรรทัด (ย่อหน้าต่อ)
 *  - เว้นบรรทัดก่อนหัวข้อ, ไม่เว้นซ้ำหลายบรรทัด
 */
function tidyAiText_(text) {
  const MAX = 40;
  const out = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
    let line = raw.replace(/\*\*|__|`|^#+\s*/g, '').replace(/^\s*[-*・]\s+/, '• ').replace(/\s+$/, '');
    line = line.replace(/^\s+(•)/, '$1');
    if (!line.trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); return; }
    const bullet = /^• /.test(line);
    const isHeader = !bullet && /^[^฀-๿a-zA-Z0-9(]/.test(line) && line.length <= 30;
    if (isHeader && out.length && out[out.length - 1] !== '') out.push('');
    // ตัดบรรทัดยาวที่ช่องว่าง
    const indent = bullet ? '   ' : '';
    let rest = line;
    let first = true;
    while (rest.length > MAX + 8) { // เศษท้ายสั้น ๆ ไม่ต้องขึ้นบรรทัดใหม่
      let cut = rest.lastIndexOf(' ', MAX);
      if (cut < MAX * 0.5) cut = rest.indexOf(' ', MAX);
      if (cut <= 0) break;
      out.push((first ? '' : indent) + rest.slice(0, cut).trim());
      rest = rest.slice(cut + 1).trim();
      first = false;
    }
    if (rest) out.push((first ? '' : indent) + rest);
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  while (out.length && out[0] === '') out.shift();
  // มีข้อที่ยาวหลายบรรทัด → เว้นบรรทัดระหว่างทุกข้อ ให้แยกกันชัด
  if (!out.some(function (l) { return /^ {3}\S/.test(l); })) return out.join('\n');
  const spaced = [];
  out.forEach(function (l, i) {
    const prev = spaced[spaced.length - 1];
    if (/^• /.test(l) && i > 0 && prev !== '' && /^( {3}\S|• )/.test(prev)) spaced.push('');
    spaced.push(l);
  });
  return spaced.join('\n');
}

/** ตัวเลขย่อสำหรับส่งให้ AI (ไม่มีข้อมูลลูกค้ารายตัว) */
function aiSalesPayload_(snap) {
  const r = function (n) { return n === null || n === undefined || isNaN(n) ? null : Math.round(n * 100) / 100; };
  const m = function (x) {
    return {
      ton: r(x.actualTon), targetTon: r(x.budgetTon), achievementPct: r(x.achievement),
      speedTonPerDay: r(x.currentSpeed), forecastTon: r(x.forecastTon), forecastPct: r(x.forecastPct),
      requiredTonPerDay: r(x.requiredSpeed),
      valueMB: snap.hasAmount ? r(x.actualAmt / 1e6) : undefined,
      forecastValueMB: snap.hasAmount ? r(x.forecastAmt / 1e6) : undefined,
      forecastValuePct: snap.hasAmount ? r(x.forecastPctAmt) : undefined,
      challengeTon: r(x.challengeTon), forecastVsChallengePct: r(x.challengePct),
      lastYearSameMonthTon: r(x.lastTon),
      lastYearSameMonthValueMB: x.lastAmt ? r(x.lastAmt / 1e6) : undefined,
    };
  };
  const out = {
    asOf: fmtDateLong_(snap.asOf),
    workingDays: { passed: snap.workingDaysPassed, total: snap.workingDaysTotal },
    total: m(snap.total),
    zones: snap.teams.map(function (t) { return Object.assign({ zone: t.name }, m(t)); }),
  };
  if (!snap.lastDay.unavailable) {
    out.lastDay = {
      ton: r(snap.lastDay.total),
      byZone: snap.lastDay.byTeam.map(function (e) { return { zone: e.name, ton: r(e.ton) }; }),
    };
  }
  return out;
}

const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** ตัวที่ใช้: 'gemini' | 'claude' | '' (ยังไม่เปิด) */
function aiProvider_() {
  const want = String(prop_('AI_PROVIDER', '')).toLowerCase();
  const hasGemini = !!prop_('GEMINI_API_KEY', '');
  const hasClaude = !!prop_('ANTHROPIC_API_KEY', '');
  if (want === 'claude' && hasClaude) return 'claude';
  if (want === 'gemini' && hasGemini) return 'gemini';
  if (hasGemini) return 'gemini';
  if (hasClaude) return 'claude';
  return '';
}

function aiEnabled_() {
  return !!aiProvider_();
}

/** ส่งคำถามให้ AI ที่เปิดใช้อยู่ — คืนข้อความ หรือ null */
function callAi_(system, userText) {
  const p = aiProvider_();
  if (!p) return null;
  const call = function (x) { return x === 'gemini' ? callGemini_(system, userText) : callClaude_(system, userText); };
  const text = call(p);
  if (text) return text;
  // ตัวหลักล่ม → ถ้ามีคีย์อีกเจ้า ใช้เป็นตัวสำรอง
  const other = p === 'gemini' ? 'claude' : 'gemini';
  if (!prop_(other === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY', '')) return null;
  console.warn(p + ' ไม่สำเร็จ (' + AI_LAST_ERROR + ') → ลอง ' + other);
  return call(other);
}

/** สาเหตุที่เรียก AI ไม่สำเร็จครั้งล่าสุด (ไว้บอกผู้ใช้) */
let AI_LAST_ERROR = '';

function geminiErrorText_(code, body) {
  let msg = '';
  try { msg = (JSON.parse(body).error || {}).message || ''; } catch (e) { msg = String(body || ''); }
  const hint = code === 400 && /API key/i.test(msg) ? 'คีย์ไม่ถูกต้อง — ตรวจ GEMINI_API_KEY'
    : code === 403 ? 'คีย์ไม่มีสิทธิ์ใช้ Gemini API (สร้างคีย์ใหม่ใน AI Studio)'
    : code === 404 ? 'ไม่พบโมเดล'
    : code === 429 ? 'ใช้เกินโควตาฟรี รอสักครู่แล้วลองใหม่ค่ะ'
    : code >= 500 ? 'Gemini คนใช้เยอะชั่วคราว รอสักครู่แล้วลองใหม่ค่ะ'
    : '';
  return 'Gemini ' + code + (hint ? ': ' + hint : '') + (msg && code < 429 ? ' (' + truncate_(msg, 120) + ')' : '');
}

/**
 * รายชื่อรุ่น Gemini Flash ที่คีย์นี้ใช้ได้จริง (ถาม Google ตรง ๆ แล้วจำไว้ 6 ชม.)
 * Google เปลี่ยน/ปลดรุ่นบ่อย จึงไม่ฝังชื่อรุ่นตายตัว — เรียงรุ่นใหม่สุดก่อน, ตัวเต็มก่อน lite, ตัวจริงก่อน preview
 */
function geminiModels_(key, refresh) {
  const cache = CacheService.getScriptCache();
  if (!refresh) {
    const hit = cache.get('gemini_models');
    if (hit) return JSON.parse(hit);
  }
  let names = [];
  try {
    const res = UrlFetchApp.fetch(GEMINI_API_URL.replace(/\/$/, '') + '?pageSize=200', {
      method: 'get', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) {
      names = (JSON.parse(res.getContentText()).models || [])
        .filter(function (m) {
          const n = String(m.name || '').replace(/^models\//, '');
          return /^gemini-/.test(n) && /flash/.test(n) &&
            !/image|tts|audio|live|embed|vision|learnlm|computer|robotics|exp/.test(n) &&
            (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
        })
        .map(function (m) { return String(m.name).replace(/^models\//, ''); });
    }
  } catch (e) { console.warn('list Gemini models: ' + e); }
  const ver = function (n) { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : 0; };
  const rank = function (n) { return (/latest/.test(n) ? 0 : ver(n) * 10) - (/lite/.test(n) ? 3 : 0) - (/preview/.test(n) ? 1 : 0); };
  names.sort(function (x, y) { return rank(y) - rank(x); });
  names = uniq_(names).slice(0, 4);
  cache.put('gemini_models', JSON.stringify(names), 6 * 3600);
  return names;
}

function geminiFetch_(key, model, system, userText) {
  return UrlFetchApp.fetch(GEMINI_API_URL + encodeURIComponent(model) + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
    }),
    muteHttpExceptions: true,
  });
}

/**
 * เรียก Google Gemini (ตัวฟรี) — ลองรุ่นที่ใช้ได้ทีละตัว
 * 404 (รุ่นถูกปลด) / 429 (โควตารุ่นนี้หมด) / 5xx (คนใช้เยอะ) → ข้ามไปรุ่นถัดไป
 * รุ่นที่ตอบได้จะถูกจำไว้ใช้ก่อนในครั้งหน้า
 */
function callGemini_(system, userText) {
  const key = prop_('GEMINI_API_KEY', '');
  if (!key) return null;
  const cache = CacheService.getScriptCache();
  const userModel = prop_('GEMINI_MODEL', '');
  const queue = uniq_([cache.get('gemini_ok'), userModel].concat(geminiModels_(key), [GEMINI_MODEL, 'gemini-flash-lite-latest'])
    .filter(function (m) { return m; }));
  const tried = {};
  let err = '';
  let busy = [];
  let refreshed = false;
  for (let i = 0; i < queue.length && i < 8; i++) {
    const model = queue[i];
    if (tried[model]) continue;
    tried[model] = true;
    const res = geminiFetch_(key, model, system, userText);
    const code = res.getResponseCode();
    if (code !== 200) {
      const body = res.getContentText();
      console.warn('Gemini ' + model + ' → ' + code);
      if (code === 404) {
        // Google มักบอกชื่อรุ่นใหม่มาในข้อความ เช่น "use models/gemini-x.y-flash"
        const sug = String(body).match(/models\/(gemini-[\w.\-]+)/g) || [];
        sug.forEach(function (x) { const n = x.replace('models/', ''); if (!tried[n]) queue.splice(i + 1, 0, n); });
        if (!refreshed) { refreshed = true; geminiModels_(key, true).forEach(function (n) { if (!tried[n]) queue.push(n); }); }
        if (cache.get('gemini_ok') === model) cache.remove('gemini_ok');
        if (!err) err = geminiErrorText_(code, body);
        continue;
      }
      if (code === 429 || code >= 500) { busy.push(model); err = geminiErrorText_(code, body); continue; }
      AI_LAST_ERROR = geminiErrorText_(code, body); // คีย์ผิด/ไม่มีสิทธิ์ — ลองรุ่นอื่นก็ไม่ช่วย
      console.error(AI_LAST_ERROR);
      return null;
    }
    const text = geminiText_(res.getContentText());
    if (text) { cache.put('gemini_ok', model, 6 * 3600); return text; }
  }
  // ทุกรุ่นยุ่งพร้อมกัน → พักสั้น ๆ แล้วลองรุ่นแรกที่ยังมีอยู่อีกครั้ง
  if (busy.length) {
    Utilities.sleep(2000);
    const res = geminiFetch_(key, busy[0], system, userText);
    if (res.getResponseCode() === 200) {
      const text = geminiText_(res.getContentText());
      if (text) { cache.put('gemini_ok', busy[0], 6 * 3600); return text; }
    } else err = geminiErrorText_(res.getResponseCode(), res.getContentText());
  }
  AI_LAST_ERROR = AI_LAST_ERROR || err || 'Gemini ไม่ตอบ';
  console.error(AI_LAST_ERROR);
  return null;
}

/** ดึงข้อความคำตอบ (ตัดส่วน "คิด" ออก) — ไม่มีคำตอบ → null + เก็บสาเหตุ */
function geminiText_(raw) {
  const body = JSON.parse(raw);
  if (body.promptFeedback && body.promptFeedback.blockReason) {
    AI_LAST_ERROR = 'Gemini ปฏิเสธคำถาม (' + body.promptFeedback.blockReason + ')';
    return null;
  }
  const cand = (body.candidates || [])[0];
  const text = cand && cand.content ? (cand.content.parts || []).filter(function (p) { return p.text && !p.thought; })
    .map(function (p) { return p.text; }).join('').trim() : '';
  if (!text) AI_LAST_ERROR = 'Gemini ไม่ส่งคำตอบกลับ' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '');
  return text || null;
}

/** รันจาก Apps Script เพื่อทดสอบ AI — ดูผลใน "บันทึกการดำเนินการ" */
function testAi() {
  console.log('ตัว AI: ' + (aiProvider_() || 'ยังไม่ได้ใส่คีย์'));
  if (prop_('GEMINI_API_KEY', '')) console.log('รุ่น Gemini ที่ใช้ได้: ' + geminiModels_(prop_('GEMINI_API_KEY', ''), true).join(', '));
  AI_LAST_ERROR = '';
  const t = callAi_('ตอบสั้น ๆ ภาษาไทย', 'สวัสดี ทดสอบระบบ');
  console.log(t ? '✅ AI ตอบ: ' + t : '❌ ไม่สำเร็จ: ' + AI_LAST_ERROR);
}

/** เรียก Claude Messages API — คืนข้อความ หรือ null ถ้าไม่มีคีย์/เรียกไม่สำเร็จ */
function callClaude_(system, userText) {
  const key = prop_('ANTHROPIC_API_KEY', '');
  if (!key) return null;
  const res = UrlFetchApp.fetch(AI_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify({
      model: prop_('AI_MODEL', AI_MODEL),
      max_tokens: 16000,
      output_config: { effort: 'low' },
      fallbacks: 'default',
      system: system,
      messages: [{ role: 'user', content: userText }],
    }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    AI_LAST_ERROR = 'Claude ' + code + ': ' + truncate_(res.getContentText(), 140);
    console.error(AI_LAST_ERROR);
    return null;
  }
  const body = JSON.parse(res.getContentText());
  if (body.stop_reason === 'refusal') {
    console.warn('Claude refused: ' + JSON.stringify(body.stop_details || {}));
    return null;
  }
  const text = (body.content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('\n').trim();
  return text || null;
}

function hashString_(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '_' + s.length;
}

/**
 * บทวิเคราะห์ยอดจาก AI — ข้อมูลชุดเดียวกันใช้บทวิเคราะห์เดิม (เก็บใน cache 6 ชม. + Script Properties)
 * cachedOnly = true: ไม่เรียก AI ใหม่ (ใช้ตอนพิมพ์ "ยอดขาย" ให้ตอบไว ไม่ต้องรอ AI)
 */
/** บทวิเคราะห์ AI ท้ายรายงานยอด — ปิดไว้ (ตั้ง AI_ANALYSIS = true เพื่อเปิด) · ถาม AI ด้วยการแท็กยังใช้ได้ */
function aiAnalysisOn_() {
  return flag_('AI_ANALYSIS', false);
}

function aiSalesComment_(snap, cachedOnly) {
  if (!snap || snap.source !== 'sheet' || !aiEnabled_() || !aiAnalysisOn_()) return null;
  const payload = JSON.stringify(aiSalesPayload_(snap));
  const cache = CacheService.getScriptCache();
  const key = 'ai_sales_' + aiProvider_() + '_' + hashString_(payload);
  const hit = cache.get(key);
  if (hit) return hit;
  if (prop_('AI_SALES_KEY', '') === key) {
    const saved = prop_('AI_SALES_TEXT', '');
    if (saved) { cache.put(key, saved, 21600); return saved; }
  }
  if (cachedOnly) return null;
  let text = null;
  try {
    text = callAi_(AI_SYSTEM_PROMPT, 'ข้อมูลยอดขาย (JSON):\n' + payload);
  } catch (e) {
    console.error('AI: ' + (e && e.message || e));
  }
  if (!text) return null;
  const msg = '🤖 วิเคราะห์โดย AI\n\n' + truncate_(tidyAiText_(text), 3000);
  cache.put(key, msg, 21600);
  try { setProp_('AI_SALES_KEY', key); setProp_('AI_SALES_TEXT', msg); } catch (e) { /* ไม่เป็นไร */ }
  return msg;
}


// ---------------------------------------------------------------- ถามบอทเป็นภาษาธรรมดา

const AI_QA_SYSTEM_PROMPT = [
  'คุณคือ "น้องขุนศึก" ผู้ช่วยทีมขายอาหารปลา TFM (เขต F1–F5) ตอบในกลุ่ม LINE ของทีม',
  'พูดสุภาพแบบผู้หญิง ใช้ค่ะ/คะ ให้ถูกต้อง (ค่ะ = บอกเล่า, คะ = คำถาม)',
  'ตอบจากข้อมูล JSON ที่ให้เท่านั้น ถ้าข้อมูลไม่พอให้บอกตรง ๆ ว่าไม่มีข้อมูลนั้น ห้ามเดาตัวเลข คำนวณให้ถูก',
  'หน่วย: ตัน และมูลค่าเป็นล้านบาท (ฟิลด์ *MB) — วันทำงานนับ จ.–ส.',
  AI_FORMAT_RULES,
  'บรรทัดแรก = คำตอบตรง ๆ 1 บรรทัด (เช่น "F5 น่าจะปิดได้ตามเป้าค่ะ ✅") แล้วเว้นบรรทัด ตามด้วยหัวข้อรายละเอียด',
  'ทั้งหมดไม่เกิน 12 บรรทัด',
].join('\n');

/** ข้อมูลที่ส่งให้ AI ตอบคำถาม: เขต, เซลส์, ลูกค้า (ยอดเดือนนี้), วันเกิด 30 วัน, เยี่ยมล่าสุด */
function aiQaPayload_(snap, now) {
  const r = function (n) { return n === null || n === undefined || isNaN(n) ? null : Math.round(n * 100) / 100; };
  const out = { today: fmtDateLong_(now) };
  if (snap && snap.source === 'sheet') {
    Object.assign(out, aiSalesPayload_(snap));
    out.salespeople = snap.salesList.slice(0, 60).map(function (s) {
      return { name: s.name, zone: s.team, ton: r(s.actualTon), forecastTon: r(s.forecastTon) };
    });
    const cust = {};
    snap.monthRows.forEach(function (x) {
      if (!x.customer) return;
      const c = cust[x.customer] || (cust[x.customer] = { name: x.customer, zone: x.team, sales: x.sales, ton: 0 });
      c.ton += x.ton;
    });
    out.customersThisMonth = Object.keys(cust).map(function (k) { return cust[k]; })
      .sort(function (a, b) { return b.ton - a.ton; }).slice(0, 250)
      .map(function (c) { return { name: c.name, zone: c.zone, sales: c.sales, ton: r(c.ton) }; });
    if (snap.detailAsOf) out.customerDataAsOf = fmtDateLong_(snap.detailAsOf);
  } else {
    out.sales = 'ยังไม่มีไฟล์ยอดขาย';
  }
  try {
    const today = startOfDay_(now);
    out.birthdaysNext30Days = upcomingBirthdays_(readBirthdays_(), today, 30).map(function (e) {
      return { customers: e.customers, owner: e.owner, zones: e.zones, date: fmtDate_(e.date) };
    });
  } catch (e) { /* ignore */ }
  try {
    const since = addDays_(startOfDay_(now), -30);
    out.visitsLast30Days = readVisits_().filter(function (v) { return v.at >= since; }).slice(-150).map(function (v) {
      return { date: fmtDate_(v.at), sales: v.sales, customer: v.customer, zone: v.zone, note: truncate_(v.note, 100) };
    });
  } catch (e) { /* ignore */ }
  return out;
}

/** ตอบคำถามภาษาธรรมดา (ต้องมี GEMINI_API_KEY หรือ ANTHROPIC_API_KEY) */
function askBot_(question, now) {
  if (!aiEnabled_()) {
    return 'น้องขุนศึกยังตอบคำถามแบบนี้ไม่ได้ค่ะ\nพิมพ์ "เมนู" เพื่อดูคำสั่งที่ใช้ได้นะคะ';
  }
  let snap = null;
  try { snap = getSalesSnapshot_(); } catch (e) { /* ignore */ }
  const payload = JSON.stringify(aiQaPayload_(snap, now));
  let text = null;
  AI_LAST_ERROR = '';
  try {
    text = callAi_(AI_QA_SYSTEM_PROMPT, 'ข้อมูล (JSON):\n' + payload + '\n\nคำถาม: ' + question);
  } catch (e) {
    AI_LAST_ERROR = String(e && e.message || e);
    console.error('AI Q&A: ' + AI_LAST_ERROR);
  }
  return text ? '🤖 ' + truncate_(tidyAiText_(text), 3500)
    : 'ขออภัยค่ะ ตอนนี้น้องขุนศึกตอบไม่ได้ ลองใหม่อีกครั้งนะคะ' + (AI_LAST_ERROR ? '\n(สาเหตุ: ' + AI_LAST_ERROR + ')' : '');
}

// ---------- Birthdays.gs ----------
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

// ---------- Reminders.gs ----------
/**
 * ข้อความแจ้งเตือนตามวัน/เวลา (แก้ได้ในแท็บ "แจ้งเตือน" ของชีทบอท)
 *
 * คอลัมน์: วัน | เวลา | ข้อความ | ทุกกี่สัปดาห์ | เริ่มวันที่ | ใช้งาน | ส่งล่าสุด
 *  - วัน: จ อ พ พฤ ศ ส อา, หลายวันคั่นด้วย , (เช่น จ,พ,ศ), ช่วง จ-ส, หรือ ทุกวัน
 *  - เวลา: 16:00
 *  - ทุกกี่สัปดาห์: 1 = ทุกสัปดาห์, 2 = เว้นสัปดาห์ (นับจาก "เริ่มวันที่")
 *  - ใช้งาน: TRUE / FALSE
 * บอทเช็กทุก 5 นาที จึงส่งช้ากว่าเวลาที่ตั้งได้ไม่เกิน ~5 นาที และส่งวันละครั้งต่อแถว
 */

const REMINDER_SHEET = 'แจ้งเตือน';
const REMINDER_HEADERS = ['วัน', 'เวลา', 'ข้อความ', 'ทุกกี่สัปดาห์', 'เริ่มวันที่', 'ใช้งาน', 'ส่งล่าสุด'];
const REMINDER_PLACEHOLDER = '(ใส่ข้อความที่ต้องการให้บอทส่ง)';
const FRIDAY_MEETING_TEXT = '@All วันที่มีประชุม Perfomance ทีมขาย&วิชาการ มีใครนำเสนอ,อัพเดทอะไรบ้างคะ';
const SATURDAY_PLAN_TEXT = 'รบกวนทุกคนส่งแผนการทำงานในสัปดาห์หน้าด้วยนะคะ';
/** ข้อความเดิม (เสียงผู้ชาย) → ข้อความใหม่ — แก้ให้เองตอนรัน setupTriggers */
const REMINDER_TEXT_UPDATES = {
  '@All วันที่มีประชุม Perfomance ทีมขาย&วิชาการ มีใครนำเสนอ,อัพเดทอะไรบ้างครับ': FRIDAY_MEETING_TEXT,
  'รบกวนทุกคนส่งแผนการทำงานในสัปดาห์หน้าด้วยครับ': SATURDAY_PLAN_TEXT,
};
const REMINDER_DEFAULTS = [
  ['ส', '16:00', SATURDAY_PLAN_TEXT, 1, '', true, ''],
  ['ศ', '07:00', FRIDAY_MEETING_TEXT, 2, new Date(2026, 11, 4), true, ''],
];

function setupReminders() {
  const ss = spreadsheet_();
  if (!ss.getSheetByName(REMINDER_SHEET)) {
    const sh = sheet_(REMINDER_SHEET, REMINDER_HEADERS);
    REMINDER_DEFAULTS.forEach(function (r) { sh.appendRow(r); });
    return;
  }
  // แท็บที่สร้างไว้ก่อน: เติมข้อความวันศุกร์แทนข้อความตัวอย่าง และเปลี่ยนข้อความเดิมเป็นเสียงผู้หญิง
  const sh = ss.getSheetByName(REMINDER_SHEET);
  sh.getDataRange().getValues().forEach(function (v, i) {
    if (i === 0) return;
    const t = cleanText_(v[2]);
    if (t === REMINDER_PLACEHOLDER) sh.getRange(i + 1, 3).setValue(FRIDAY_MEETING_TEXT);
    else if (REMINDER_TEXT_UPDATES[t]) sh.getRange(i + 1, 3).setValue(REMINDER_TEXT_UPDATES[t]);
  });
}

/** "@All ..." → ข้อความที่แท็กทุกคนในกลุ่มจริง (LINE textV2) */
function reminderMessage_(text) {
  if (!/@all\b/i.test(text)) return text;
  return {
    type: 'textV2',
    text: text.replace(/@all\b/ig, '{everyone}'),
    substitution: { everyone: { type: 'mention', mentionee: { type: 'all' } } },
  };
}

/** "จ-ส", "จ,พ,ศ", "ทุกวัน", "ศุกร์" → [1,3,5] */
function parseReminderDays_(v) {
  const s = cleanText_(v).replace(/\s/g, '');
  if (!s || s === 'ทุกวัน' || /^daily$/i.test(s)) return [0, 1, 2, 3, 4, 5, 6];
  const out = [];
  s.split(/[,،、]/).forEach(function (part) {
    const range = part.split('-');
    if (range.length === 2) {
      const a = parseDayName_(range[0], true);
      const b = parseDayName_(range[1], true);
      if (a && b) {
        for (let d = a.dow; ; d = (d + 1) % 7) { out.push(d); if (d === b.dow) break; }
      }
      return;
    }
    const d = parseDayName_(part, true);
    if (d) out.push(d.dow);
  });
  return out;
}

function parseClock_(v) {
  if (v && typeof v.getTime === 'function') return { h: v.getHours(), m: v.getMinutes() };
  const t = parseTimeToken_(String(v || '').trim());
  return t ? { h: t.h, m: t.m } : null;
}

/** ส่งแจ้งเตือนที่ถึงเวลา (ภายใน 1 ชม. หลังเวลาที่ตั้ง และยังไม่ส่งวันนี้) */
function runReminders_(now) {
  const groupId = prop_('GROUP_ID', '');
  const sh = groupId ? spreadsheet_().getSheetByName(REMINDER_SHEET) : null;
  if (!sh) return 0;
  const today = startOfDay_(now);
  const todayKey = 'ส่งแล้ว ' + fmtDate_(today) + ' ' + (today.getFullYear() + 543);
  const values = sh.getDataRange().getValues();
  const due = [];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    const text = cleanText_(v[2]);
    if (!text || text === REMINDER_PLACEHOLDER) continue;
    if (String(v[5]).toUpperCase() === 'FALSE' || v[5] === false) continue;
    if (parseReminderDays_(v[0]).indexOf(now.getDay()) < 0) continue;
    const clock = parseClock_(v[1]);
    if (!clock) continue;
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), clock.h, clock.m);
    if (now < at || now - at > 3600000) continue;
    const every = Math.max(1, Number(v[3]) || 1);
    const start = v[4] ? parseSheetDate_(v[4], 'DMY') : null;
    if (start && today < startOfDay_(start)) continue;
    if (every > 1) {
      const base = startOfWeek_(start || today);
      const weeks = Math.round((startOfWeek_(today) - base) / (7 * 86400000));
      if (weeks % every !== 0) continue;
    }
    if (cleanText_(v[6]) === todayKey) continue;
    sh.getRange(i + 1, 7).setValue(todayKey);
    due.push(text);
  }
  if (due.length) {
    const res = linePush_(groupId, due.map(reminderMessage_));
    // ถ้า LINE ไม่รับแบบแท็กทุกคน ส่งเป็นข้อความธรรมดาแทน
    if (res && res.code >= 300 && due.some(function (t) { return /@all\b/i.test(t); })) linePush_(groupId, due);
  }
  return due.length;
}

// ---------------------------------------------------------------- แผนงาน (กิจวัตร) จากห้องสั่งการ

const TH_DAY_SHORT_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function daysLabel_(days) {
  if (days.length === 7) return 'ทุกวัน';
  if (days.join(',') === '1,2,3,4,5,6') return 'จ-ส';
  if (days.join(',') === '1,2,3,4,5') return 'จ-ศ';
  return days.map(function (d) { return TH_DAY_SHORT_NAMES[d]; }).join(',');
}

/**
 * แปลงข้อความแผน 1 บรรทัด → แถวแจ้งเตือน
 * "ส 16:00 รบกวนส่งแผน..."  "จ-ส 07:45 ..."  "ศ 07:00 ทุก2สัปดาห์ เริ่ม 4/12 @All ..."
 */
function parsePlanLine_(line, now) {
  const tokens = cleanText_(line).replace(/^[-•*]\s*/, '').split(' ').filter(Boolean);
  if (tokens.length < 3) return null;
  let i = 0;
  let dayTok = tokens[i++].replace(/^วัน/, '');
  // "ทุก วัน" / "จันทร์ - เสาร์"
  if (tokens[i] === '-' && tokens[i + 1]) { dayTok += '-' + tokens[i + 1]; i += 2; }
  const days = parseReminderDays_(dayTok);
  if (!days.length || (dayTok !== 'ทุกวัน' && !parseDayName_(dayTok.split(/[-,]/)[0], true))) return null;
  const clock = parseClock_(tokens[i++]);
  if (!clock) return null;
  let every = 1;
  let start = '';
  for (;;) {
    const t = tokens[i] || '';
    let m = t.match(/^ทุก(\d+)สัปดาห์$/);
    if (m) { every = Number(m[1]); i++; continue; }
    if (t === 'ทุก' && /^\d+$/.test(tokens[i + 1] || '') && tokens[i + 2] === 'สัปดาห์') { every = Number(tokens[i + 1]); i += 3; continue; }
    if (t === 'เว้นสัปดาห์' || t === 'เว้นศุกร์' || t === 'สัปดาห์เว้นสัปดาห์') { every = 2; i++; continue; }
    m = t.match(/^เริ่ม(.+)$/);
    if (m) { start = parseDateToken_(m[1], now) || ''; i++; continue; }
    if (t === 'เริ่ม' && tokens[i + 1]) { start = parseDateToken_(tokens[i + 1], now) || ''; i += 2; continue; }
    break;
  }
  const text = tokens.slice(i).join(' ');
  if (!text) return null;
  return [daysLabel_(days), pad2_(clock.h) + ':' + pad2_(clock.m), text, every, start, true, ''];
}

/** แทนที่กิจวัตรทั้งหมดด้วยแผนใหม่ — คืน { rows, skipped } */
function replacePlan_(text, now) {
  const rows = [];
  const skipped = [];
  String(text || '').split(/\r?\n/).forEach(function (line) {
    if (!cleanText_(line)) return;
    const r = parsePlanLine_(line, now);
    if (r) rows.push(r); else skipped.push(cleanText_(line));
  });
  if (!rows.length) return { rows: rows, skipped: skipped };
  withLock_(function () {
    const sh = sheet_(REMINDER_SHEET, REMINDER_HEADERS);
    const out = [REMINDER_HEADERS].concat(rows);
    sh.clearContents();
    sh.getRange(1, 1, out.length, REMINDER_HEADERS.length).setValues(out);
  });
  return { rows: rows, skipped: skipped };
}

function clearPlan_() {
  withLock_(function () {
    const sh = sheet_(REMINDER_SHEET, REMINDER_HEADERS);
    sh.clearContents();
    sh.getRange(1, 1, 1, REMINDER_HEADERS.length).setValues([REMINDER_HEADERS]);
  });
}

function planRowLabel_(v) {
  const every = Number(v[3]) || 1;
  const start = v[4] ? toDate_(v[4]) : null;
  const on = !(String(v[5]).toUpperCase() === 'FALSE' || v[5] === false);
  const clock = parseClock_(v[1]);
  return (on ? '' : '⏸️ ') + cleanText_(v[0]) + ' ' + (clock ? pad2_(clock.h) + ':' + pad2_(clock.m) : cleanText_(v[1])) +
    (every > 1 ? ' (ทุก ' + every + ' สัปดาห์' + (start ? ' เริ่ม ' + fmtDate_(start) : '') + ')' : '') +
    '\n   ' + truncate_(cleanText_(v[2]), 120);
}

function formatPlan_() {
  const sh = spreadsheet_().getSheetByName(REMINDER_SHEET);
  const rows = sh ? sh.getDataRange().getValues().slice(1).filter(function (v) { return cleanText_(v[2]); }) : [];
  if (!rows.length) return '📋 ยังไม่มีแผนงาน (กิจวัตร) ค่ะ\n\n' + PLAN_HELP;
  return '📋 แผนงานที่บอทส่งเข้ากลุ่มหลักเป็นกิจวัตร (' + rows.length + ' รายการ)\n\n' +
    rows.map(function (v, i) { return (i + 1) + '. ' + planRowLabel_(v); }).join('\n\n') +
    '\n\nเปลี่ยน: ส่ง "แผน" ใหม่ทั้งชุด · ยกเลิกทั้งหมด: "ยกเลิกแผน"';
}

const PLAN_HELP = [
  'ตั้งแผนงาน: พิมพ์ "แผน" แล้วขึ้นบรรทัดละ 1 รายการ เช่น',
  'แผน',
  'ส 16:00 รบกวนทุกคนส่งแผนการทำงานในสัปดาห์หน้าด้วยนะคะ',
  'ศ 07:00 ทุก2สัปดาห์ เริ่ม 4/12 @All วันที่มีประชุม Perfomance...',
  'จ-ส 08:00 อย่าลืมส่งยอดเมื่อวานนะคะ',
  '',
  'วัน: จ อ พ พฤ ศ ส อา · จ-ส · จ,พ,ศ · ทุกวัน',
].join('\n');

/** ห้องสั่งการ: "แผน ..." / "แผน" / "ยกเลิกแผน" */
function handlePlanCommand_(raw, now) {
  const t = String(raw || '').trim();
  if (/^ยกเลิกแผน(งาน)?$/.test(t)) {
    clearPlan_();
    return '🗑️ ยกเลิกแผนงานทั้งหมดแล้วค่ะ บอทจะไม่ส่งแจ้งเตือนตามวันจนกว่าจะส่งแผนใหม่นะคะ';
  }
  const m = t.match(/^แผน(?:งาน)?\s*([\s\S]*)$/);
  if (!m) return null;
  if (!m[1].trim()) return formatPlan_();
  const r = replacePlan_(m[1], now);
  if (!r.rows.length) return '⚠️ อ่านแผนไม่ได้ค่ะ\n\n' + PLAN_HELP;
  let s = '✅ บันทึกแผนงานแล้วค่ะ (' + r.rows.length + ' รายการ) บอทจะส่งเข้ากลุ่มหลักตามเวลาทุกสัปดาห์\n\n' +
    r.rows.map(function (v, i) { return (i + 1) + '. ' + planRowLabel_(v); }).join('\n\n');
  if (r.skipped.length) s += '\n\n⚠️ บรรทัดที่อ่านไม่ได้ (ไม่ได้บันทึก):\n' + r.skipped.map(function (x) { return '• ' + x; }).join('\n');
  return s;
}

// ---------- Visits.gs ----------
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

function logVisit_(sender, visit, now) {
  const zone = customerZone_(visit.customer);
  withLock_(function () {
    sheet_(VISIT_SHEET, VISIT_HEADERS).appendRow([now, sender.name, sender.userId, visit.customer, zone, visit.note, '', '', '', visit.type || 'เยี่ยม']);
  });
  forwardVisit_(sender, visit, zone, now);
  return zone;
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
    activity: visit.type || 'เยี่ยม',
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

/** ลิงก์ไฟล์รวมรายงานเยี่ยม (OneDrive) — ตั้งที่ Script Property REPORT_LINK */
function reportLinkText_() {
  const link = prop_('REPORT_LINK', '');
  if (!link) return 'ยังไม่ได้ตั้งลิงก์ไฟล์รายงานค่ะ (ผู้ดูแลใส่ REPORT_LINK ใน Script Properties)';
  return '📂 ไฟล์รวมบันทึกเยี่ยม / ติดตาม / เข้าพบลูกค้า\nแยกชีทรายเขต F1–F5 + รวมทุกเขต (อัปเดตอัตโนมัติ)\n\n' + link;
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
  const icon = x.type.indexOf('ติดตาม') === 0 ? '📞' : x.type.indexOf('เข้าพบ') === 0 ? '🤝' : '📍';
  return icon + ' ' + x.customer + (x.zone ? ' [' + x.zone + ']' : '') +
    '\n   ' + fmtDate_(x.at) + ' ' + fmtTime_(x.at) + ' · ' + x.type + ' · 👤 ' + x.sales +
    (x.note ? '\n   🗒️ ' + truncate_(x.note.replace(/\n+/g, ' '), 140) : '') +
    (x.lat !== '' && x.lat !== undefined ? '\n   📌 ' + (x.place ? truncate_(x.place, 60) : 'แชร์ตำแหน่งแล้ว') : '');
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
      .map(function (s) { return '• ' + s + ' — ' + bySales[s] + ' ครั้ง'; });
    return '📍 เยี่ยม/เข้าพบ/ติดตามลูกค้า 7 วันล่าสุด (' + recent.length + ' ครั้ง)\n\n👤 รายคน\n' + ranking.join('\n') +
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
  if (!hits.length) return '📍 ไม่พบบันทึกเยี่ยมของ "' + query + '" ใน 90 วันค่ะ';
  return '📍 บันทึกเยี่ยม "' + query + '" (' + hits.length + ' ครั้ง ใน 90 วัน)\n\n' +
    hits.slice(0, 20).map(visitLine_).join('\n\n') + (hits.length > 20 ? '\n\n…และอีก ' + (hits.length - 20) + ' ครั้ง' : '');
}

/** ไม่ได้เยี่ยม [เขต] — ลูกค้าที่มียอดเดือนนี้ แต่ไม่ได้เยี่ยม 30 วันขึ้นไป */
function formatNotVisited_(zoneArg, now) {
  const snap = getSalesSnapshot_();
  if (snap.source !== 'sheet') return NO_SHEET_SALES_TEXT;
  const zone = zoneArg ? teamKey_(zoneArg).toUpperCase() : '';
  if (zone && !snap.teams.some(function (t) { return t.name === zone; })) {
    return /^F\d+$/.test(zone) ? 'ไม่มีเขต ' + zone + ' ค่ะ — มีเขต ' + snap.teams.map(function (t) { return t.name; }).join(', ') + ' นะคะ'
      : 'พิมพ์ "ไม่ได้เยี่ยม" หรือ "ไม่ได้เยี่ยม F3" นะคะ';
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
  if (!list.length) return '✅ ลูกค้าที่มียอดเดือนนี้' + (zone ? 'ของ ' + zone : '') + ' ได้เยี่ยมครบใน 30 วันแล้วค่ะ';
  const SHOW = 30;
  const cols = [{ label: '#', flex: 1, align: 'end' }, { label: 'ลูกค้า', flex: 8, wrap: true }];
  if (!zone) cols.push({ label: 'เขต', flex: 2 });
  cols.push({ label: 'ตัน', flex: 3, align: 'end' }, { label: 'เยี่ยมล่าสุด', flex: 4, align: 'end' });
  const rows = list.slice(0, SHOW).map(function (c, i) {
    const lv = last[visitKey_(c.name)];
    const r = [String(i + 1), c.name];
    if (!zone) r.push(c.team || '-');
    r.push(fmtTon_(c.ton), lv ? fmtDate_(lv).replace(/^\S+ /, '') : { t: 'ยังไม่เคย', color: FX.red });
    return r;
  });
  const title = '📍 ยังไม่ได้เยี่ยม 30 วัน' + (zone ? ' · ' + zone : '');
  return fxMessage_(title + ' (' + list.length + ' ราย)', fxBubble_({
    title: title,
    lines: [list.length + ' ราย · เรียงตามยอดเดือนนี้ (ถึง ' + fmtDate_(snap.detailAsOf || snap.asOf) + ')'],
    body: [fxTable_(cols, rows, { margin: 'none' })],
    footer: (list.length > SHOW ? '…และอีก ' + (list.length - SHOW) + ' ราย · ' : '') + 'บันทึกเยี่ยม: พิมพ์ เยี่ยม <ลูกค้า> <รายละเอียด>',
  }));
}

// ---------- Schedule.gs ----------
/**
 * งานตั้งเวลา
 *  - tick() ทุก 5 นาที: ข้อความเช้า (MORNING_TIME, วัน MORNING_DAYS) + แจ้งเตือนตามแท็บ "แจ้งเตือน"
 *  - importSalesHourly() ทุกชั่วโมง: ดึงไฟล์ยอดจากโฟลเดอร์ Drive
 * รัน setupTriggers() ครั้งเดียวหลังติดตั้ง/อัปเดต
 */

function setupTriggers() {
  const handlers = ['morningBrief', 'eventReminder', 'weeklyReview', 'importSalesHourly', 'tick'];
  setupSalesSheets();
  setupReminders();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('importSalesHourly').timeBased().everyHours(1).create();
  console.log('ตั้ง trigger แล้ว: ข้อความเช้า ' + prop_('MORNING_TIME', '07:30') + ' (จ.–ส.), แจ้งเตือนตามแท็บ "แจ้งเตือน", นำเข้าไฟล์ยอดทุกชั่วโมง');
}

function isWorkDay_(d) {
  return String(prop_('WORK_DAYS', CONFIG.WORK_DAYS)).split(',').map(Number).indexOf(d.getDay()) >= 0;
}

/** Trigger: ทุก 5 นาที */
function tick() {
  const now = now_();
  try { runMorning_(now); } catch (e) { console.error('ข้อความเช้า: ' + (e && e.message || e)); }
  try { runReminders_(now); } catch (e) { console.error('แจ้งเตือน: ' + (e && e.message || e)); }
}

/** ส่งข้อความเช้าวันละครั้ง เมื่อถึง MORNING_TIME (ค่าเริ่มต้น 07:30) ในวัน MORNING_DAYS (จ.–ส.) */
function runMorning_(now) {
  const days = String(prop_('MORNING_DAYS', '1,2,3,4,5,6')).split(',').map(Number);
  if (days.indexOf(now.getDay()) < 0) return false;
  const clock = parseClock_(prop_('MORNING_TIME', '07:30')) || { h: 7, m: 30 };
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), clock.h, clock.m);
  if (now < at || now - at > 3 * 3600000) return false;
  const key = fmtDate_(now) + ' ' + now.getFullYear();
  if (prop_('LAST_MORNING', '') === key) return false;
  setProp_('LAST_MORNING', key);
  return morningBrief();
}

/** ข้อความเช้า: ยอดขาย (รวม + F1–F5) + วันเกิดลูกค้า — ส่งเข้ากลุ่มหลักครั้งเดียว */
function morningBrief() {
  const messages = buildMorningMessages_(now_());
  if (!messages.length) return false;
  linePush_(prop_('GROUP_ID', ''), messages);
  return true;
}

function buildMorningMessages_(now) {
  const messages = [];
  if (flag_('BRIEF_ENABLED')) {
    importSalesQuietly_(false); // ใช้ไฟล์ล่าสุดในโฟลเดอร์ (ถ้ามี)
    try {
      const snap = getSalesSnapshot_();
      if (snap.source === 'none') throw new Error('ยังไม่มีไฟล์ยอด');
      const sales = salesMessages_(snap, null, { greeting: now });
      // แหล่งข้อมูลแบบข้อความ (dashboard.json เดิม) → ใส่คำทักทายนำหน้าเอง
      if (typeof sales[0] === 'string') sales[0] = '☀️ สวัสดีตอนเช้าค่ะ — ' + fmtDateLong_(now) + '\n\n' + sales[0];
      sales.forEach(function (m) { messages.push(m); });
      const ai = aiSalesComment_(snap);
      if (ai) messages.push(ai);
    } catch (e) {
      console.error('ยอดเช้า: ' + (e && e.message || e));
    }
  }
  if (flag_('BIRTHDAY_ENABLED')) {
    try {
      const bd = buildBirthdayAlert_(now);
      // LINE ส่งได้ครั้งละ 5 ข้อความ — การ์ดวันเกิดใช้ที่เหลือ
      if (bd) [].concat(bd).slice(0, Math.max(1, 5 - messages.length)).forEach(function (m) { messages.push(m); });
    } catch (e) {
      console.error('วันเกิด: ' + (e && e.message || e));
    }
  }
  return messages;
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
          if (ev.replyToken) lineReply_(ev.replyToken, '⚠️ ขออภัยค่ะ เกิดข้อผิดพลาด: ' + (err && err.message || err));
        }
      });
    }
  } catch (err) {
    console.error(err && err.stack || err);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** ห้องสั่งการ = กลุ่มอัปโหลด (มีแค่ผู้ดูแลกับบอท) */
function isControlRoom_(source) {
  const up = prop_('UPLOAD_GROUP_ID', '');
  return !!up && (source.groupId === up || source.roomId === up);
}

/** ส่งข้อความเข้ากลุ่มหลัก แล้วคืนข้อความยืนยันสำหรับตอบในห้องสั่งการ */
function sendToMainGroup_(messages, what) {
  const groupId = prop_('GROUP_ID', '');
  if (!groupId) return 'ยังไม่ได้ลงทะเบียนกลุ่มหลักค่ะ (พิมพ์ "ลงทะเบียน" ในกลุ่มใหญ่ก่อนนะคะ)';
  const res = linePush_(groupId, messages.slice(0, 5));
  const label = /[A-Za-z0-9]$/.test(what) ? what + ' ' : what;
  if (res && res.code >= 300) return '⚠️ ส่ง' + label + 'เข้ากลุ่มหลักไม่สำเร็จค่ะ (' + res.code + ')';
  return '✅ ส่ง' + label + 'เข้ากลุ่มหลักแล้วค่ะ';
}

function chatId_(source) {
  return source.groupId || source.roomId || source.userId;
}

function handleEvent_(ev) {
  const source = ev.source || {};
  const registered = prop_('GROUP_ID', '');

  if (ev.type === 'join') {
    lineReply_(ev.replyToken, withQuickReply_(
      '👋 สวัสดีค่ะทีมขาย! น้องขุนศึกเป็นบอทผู้ช่วยของทีมค่ะ\n' +
      (registered ? '' : 'พิมพ์ "ลงทะเบียน" เพื่อให้น้องขุนศึกส่งยอดและแจ้งเตือนเข้ากลุ่มนี้นะคะ\n') +
      'พิมพ์ "เมนู" เพื่อดูคำสั่งทั้งหมดได้เลยค่ะ', ['ลงทะเบียน', 'เมนู']));
    return;
  }
  if (ev.type !== 'message' || !ev.message) return;
  const uploadGroup = prop_('UPLOAD_GROUP_ID', '');
  const inOtherGroup = registered && (source.type === 'group' || source.type === 'room') &&
    chatId_(source) !== registered && chatId_(source) !== uploadGroup;
  // กลุ่มอื่นที่มีน้องขุนศึก: ใช้คำสั่งของทีมได้ (ดูยอด/ลูกค้า/เซลส์/วันเกิด/เยี่ยม/ถาม AI)
  // ตั้ง LOCK_GROUPS = true ถ้าต้องการให้ตอบเฉพาะกลุ่มหลัก + ห้องสั่งการ
  const blocked = inOtherGroup && prop_('LOCK_GROUPS', '') === 'true';

  // ส่งไฟล์ Excel/CSV ยอดขายเข้ากลุ่ม → บอทนำเข้าและรายงานทันที
  if (ev.message.type === 'file') {
    if (inOtherGroup || !/\.(xlsx|xls|csv)$/i.test(ev.message.fileName || '')) return;
    const r = importLineFile_(ev.message.id, ev.message.fileName);
    if (!r) {
      // ห้องสั่งการส่งไฟล์ที่ไม่ใช่ไฟล์ยอด → บอกให้รู้ (กลุ่มอื่นเงียบ)
      if (isControlRoom_(source)) lineReply_(ev.replyToken, 'ℹ️ ไฟล์ "' + ev.message.fileName + '" ไม่ใช่ไฟล์ยอดขายค่ะ (ไม่พบคอลัมน์ตัน/เขต) — ไม่ได้นำเข้านะคะ');
      return;
    }
    const snap = getSalesSnapshot_();
    const out = [r.message].concat(salesMessages_(snap, null));
    const ai = aiSalesComment_(snap);
    if (ai) out.push(ai);
    lineReply_(ev.replyToken, out.slice(0, 5));
    return;
  }
  // แชร์ตำแหน่งหลังบันทึกเยี่ยม → แนบตำแหน่ง
  if (ev.message.type === 'location') {
    if (blocked) return;
    const cust = attachVisitLocation_(source.userId, ev.message, now_());
    if (cust) lineReply_(ev.replyToken, '📍 แนบตำแหน่งการเยี่ยม ' + cust + ' แล้วค่ะ');
    return;
  }
  if (ev.message.type !== 'text') return;

  // ห้องสั่งการ: "ประกาศ <ข้อความ>" → บอทพูดในกลุ่มหลัก (เก็บบรรทัดใหม่ตามที่พิมพ์)
  // (กลุ่มอื่นพิมพ์ "พูด..." เป็นแชทปกติ — ไม่ดักไว้)
  const announce = String(ev.message.text || '').match(/^\s*(ประกาศ|พูด)\s+([\s\S]+)$/);
  if (announce && isControlRoom_(source)) {
    lineReply_(ev.replyToken, sendToMainGroup_([reminderMessage_(announce[2].trim())], 'ข้อความ'));
    return;
  }
  if (isControlRoom_(source) && /^\s*(ประกาศ|พูด)\s*$/.test(ev.message.text || '')) {
    lineReply_(ev.replyToken, 'พิมพ์ "ประกาศ" ตามด้วยข้อความนะคะ เช่น\nประกาศ พรุ่งนี้ประชุม 9 โมง @All');
    return;
  }

  // ห้องสั่งการ: แผนงาน (กิจวัตร)
  if (isControlRoom_(source) && /^\s*(แผน|ยกเลิกแผน)/.test(ev.message.text || '')) {
    const planReply = handlePlanCommand_(ev.message.text, now_());
    if (planReply) { lineReply_(ev.replyToken, planReply); return; }
  }

  const stripped = stripMentions_(ev.message.text, ev.message.mention);

  // บันทึกเยี่ยมลูกค้า: "เยี่ยม <ลูกค้า> <รายละเอียด>"
  const visit = !blocked && parseVisitText_(stripped.multiline);
  if (visit) {
    const sender = { userId: source.userId || '', name: lineDisplayName_(source) };
    const zone = logVisit_(sender, visit, now_());
    const icon = visit.type.indexOf('ติดตาม') === 0 ? '📞' : visit.type.indexOf('เข้าพบ') === 0 ? '🤝' : '📍';
    lineReply_(ev.replyToken, '✅ บันทึก' + visit.type.replace(' (ลูกค้าใหม่)', '') + (visit.isNew ? 'ลูกค้าใหม่' : 'ลูกค้า') + 'แล้วค่ะ\n' + icon + ' ' + visit.customer + (zone ? ' [' + zone + ']' : '') +
      '\n👤 ' + sender.name + ' · ' + fmtDate_(now_()) + ' ' + fmtTime_(now_()) +
      (visit.note ? '\n🗒️ ' + truncate_(visit.note.replace(/\n+/g, ' '), 120) : '') + '\n(แชร์ตำแหน่งต่อได้ภายใน 30 นาที)');
    return;
  }

  // คำสั่งปกติ หรือพิมพ์ชื่อเขต (F4) / ชื่อลูกค้า เฉย ๆ
  let parsed = parseCommand_(stripped.text);
  // คำสั่งงาน/นัด/งานประจำ (ฟีเจอร์เดิมที่เลิกใช้) — ปิดไว้ กันคำทั่วไป เช่น "งาน" "วันนี้" "นัด" ทำให้บอทตอบ
  if (parsed && LEGACY_CMDS.indexOf(parsed.cmd) >= 0 && !flag_('LEGACY_COMMANDS', false)) parsed = null;
  // "วิเคราะห์" (บทวิเคราะห์ AI) ปิดไว้ — แท็กบอทแล้วถามยังได้ (ส่งต่อไปถาม AI)
  if (parsed && parsed.cmd === 'aisales' && !aiAnalysisOn_()) parsed = null;
  parsed = parsed || lookupCommand_(stripped.text);
  if (!parsed) {
    // แท็ก @น้องขุนศึก แล้วถาม / ห้องสั่งการพิมพ์อะไรก็ได้ (มี "ถาม" นำหน้าหรือไม่ก็ได้) → AI ตอบจากข้อมูลจริง
    const ask = stripped.text.match(/^ถาม\s+([\s\S]+)$/);
    const question = stripped.botMentioned ? stripped.text
      : isControlRoom_(source) ? (ask ? ask[1] : aiEnabled_() ? stripped.text : '').trim() : '';
    if (question && !blocked) lineReply_(ev.replyToken, askBot_(question, now_()));
    return;
  }

  // ล็อกให้ใช้ได้เฉพาะกลุ่มที่ลงทะเบียน (แชท 1:1 กับบอทใช้ได้เสมอ)
  const isGroupChat = source.type === 'group' || source.type === 'room';
  if (blocked && parsed.cmd !== 'whoami' && parsed.cmd !== 'register' && parsed.cmd !== 'registerupload') return;

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

  let reply = runCommand_(parsed, ctx);
  if (reply && parsed.guessedFrom) {
    // เดาชื่อจากที่พิมพ์ผิด → บอกชื่อที่ถูกไว้ด้านบน
    const note = '🔎 พิมพ์ว่า "' + parsed.guessedFrom + '" — ชื่อที่ถูกคือ "' + parsed.argText + '" ค่ะ';
    const list = Array.isArray(reply) ? reply.slice() : [reply];
    if (typeof list[0] === 'string') list[0] = note + '\n\n' + list[0];
    else list.unshift(note);
    reply = list.slice(0, 5);
  }
  if (reply) lineReply_(ev.replyToken, reply);
}

/** คำสั่งผู้ดูแล: มีห้องสั่งการแล้ว → ใช้ได้เฉพาะห้องสั่งการ (และแชท 1:1) */
function adminAllowed_(ctx) {
  return !prop_('UPLOAD_GROUP_ID', '') || ctx.source.type === 'user' || isControlRoom_(ctx.source);
}

const LEGACY_CMDS = ['tasks', 'mytasks', 'addtask', 'done', 'deltask', 'movetask', 'today', 'tomorrow', 'week',
  'addevent', 'weekly', 'addweekly', 'weeklydone', 'delweekly', 'review'];

function runCommand_(p, ctx) {
  const now = ctx.now;
  switch (p.cmd) {
    case 'help':
      return withQuickReply_(isControlRoom_(ctx.source) ? ADMIN_HELP_TEXT : HELP_TEXT,
        ['ยอดขาย', 'ยอดเมื่อวาน', 'ยอดเซลส์', 'ยอดลูกค้า', 'วันเกิด', 'ดูเยี่ยม']);

    case 'register': {
      const id = chatId_(ctx.source);
      const current = prop_('GROUP_ID', '');
      if (ctx.source.type !== 'group' && ctx.source.type !== 'room') return 'ใช้คำสั่งนี้ในกลุ่ม LINE ที่ต้องการให้น้องขุนศึกส่งแจ้งเตือนนะคะ';
      if (current === id) return '✅ กลุ่มนี้ลงทะเบียนไว้แล้วค่ะ';
      if (id === prop_('UPLOAD_GROUP_ID', '')) return '⚠️ กลุ่มนี้เป็นกลุ่มอัปโหลด (ห้องสั่งการ) ค่ะ — พิมพ์ "ลงทะเบียน" ในกลุ่มใหญ่นะคะ';
      if (current) return '⚠️ น้องขุนศึกลงทะเบียนกับกลุ่มอื่นอยู่แล้วค่ะ — ให้ผู้ดูแลลบ GROUP_ID ใน Script Properties ก่อนนะคะ';
      setProp_('GROUP_ID', id);
      return '✅ ลงทะเบียนกลุ่มนี้แล้วค่ะ น้องขุนศึกจะส่งยอดขายกับวันเกิดลูกค้าทุกเช้า 7:30 (จ.–ส.) และแจ้งเตือนตามตารางเข้ากลุ่มนี้นะคะ\nพิมพ์ "เมนู" เพื่อดูคำสั่งได้เลยค่ะ';
    }

    case 'registerupload': {
      const id = chatId_(ctx.source);
      if (ctx.source.type !== 'group' && ctx.source.type !== 'room') return 'ใช้คำสั่งนี้ในกลุ่มที่จะใช้ส่งไฟล์ยอดนะคะ';
      const currentUpload = prop_('UPLOAD_GROUP_ID', '');
      if (currentUpload && currentUpload !== id) return null; // มีห้องสั่งการแล้ว — กลุ่มอื่นเปลี่ยนไม่ได้
      if (id === prop_('GROUP_ID', '')) {
        if (p.argText !== 'ยืนยัน') {
          return '⚠️ กลุ่มนี้เป็นกลุ่มหลักอยู่ค่ะ\n' +
            'ถ้าต้องการเปลี่ยนกลุ่มนี้เป็นกลุ่มอัปโหลด (ห้องสั่งการ) พิมพ์:\nกลุ่มอัปโหลด ยืนยัน\n' +
            'แล้วไปพิมพ์ "ลงทะเบียน" ในกลุ่มใหญ่นะคะ';
        }
        setProp_('GROUP_ID', '');
        setProp_('UPLOAD_GROUP_ID', id);
        return '✅ เปลี่ยนกลุ่มนี้เป็นกลุ่มอัปโหลด (ห้องสั่งการ) แล้วค่ะ\n' +
          '👉 ต่อไป: ไปที่กลุ่มใหญ่ แล้วพิมพ์ "ลงทะเบียน" เพื่อตั้งเป็นกลุ่มหลักนะคะ\n' +
          '(ระหว่างนี้ข้อความเช้าและแจ้งเตือนจะยังไม่ส่งจนกว่าจะลงทะเบียนกลุ่มใหญ่)';
      }
      setProp_('UPLOAD_GROUP_ID', id);
      return '✅ ตั้งกลุ่มนี้เป็นกลุ่มอัปโหลดแล้วค่ะ\nส่งไฟล์ Excel ยอดขายที่นี่ได้เลย น้องขุนศึกจะอัปเดตข้อมูลให้ (ไม่ส่งอะไรเข้ากลุ่มหลักค่ะ)\nในกลุ่มหลักพิมพ์ "ยอดขาย" จะได้ข้อมูลล่าสุดค่ะ';
    }

    case 'whoami':
      if (!adminAllowed_(ctx)) return null;
      return 'chat: ' + chatId_(ctx.source) + '\nuser: ' + (ctx.source.userId || '-');

    case 'sales': {
      if (!p.argText) {
        const all = getSalesSnapshot_();
        const ai = aiSalesComment_(all, true); // ใช้บทวิเคราะห์ที่มีอยู่แล้ว ไม่รอ AI
        return salesMessages_(all, null).concat(ai ? [ai] : []);
      }
      let snap;
      try { snap = getSalesSnapshot_(); } catch (e) { return null; }
      const team = findTeam_(snap, p.argText);
      if (team) return salesMessages_(snap, team);
      const zoneAsked = /^(?:f|fish|เขต|zone)\s*\d{1,2}$/i.test(String(p.argText).trim());
      if (snap.source !== 'sheet') return zoneAsked ? NO_SHEET_SALES_TEXT : null;
      if (zoneAsked) return 'ไม่มีเขต ' + String(p.argText).trim().toUpperCase() + ' ค่ะ — มีเขต ' +
        snap.teams.map(function (t) { return t.name; }).join(', ') + ' นะคะ';
      const customers = customerNames_(snap);
      const exact = findCustomers_(customers, p.argText, true);
      if (exact.length === 1) return formatCustomerSales_(snap, exact[0]);
      const person = findSalesPerson_(snap, p.argText);
      if (person) return formatPersonSales_(snap, person);
      const found = findCustomers_(customers, p.argText, false);
      if (found.length === 1) return formatCustomerSales_(snap, found[0]);
      if (found.length > 1) {
        return '🔎 พบลูกค้า ' + found.length + ' รายค่ะ — พิมพ์ชื่อให้ตรงขึ้นอีกนิดนะคะ\n' +
          found.slice(0, 15).map(function (n) { return '• ' + n; }).join('\n') + (found.length > 15 ? '\n…' : '');
      }
      // ไม่พบ → เดาชื่อที่ใกล้เคียง (ถ้าไม่มี ให้ AI ช่วยเดา) แล้วบอกให้สะกดให้ถูก
      const sales = uniq_(snap.monthRows.map(function (r) { return r.sales; }));
      let guesses = similarNames_(p.argText, sales, customers, 0.45).slice(0, 3).map(function (x) { return x.name; });
      if (!guesses.length) guesses = aiGuessNames_(p.argText, sales.concat(customers));
      return spellingHelpText_(p.argText, guesses);
    }

    case 'nameguess':
      return spellingHelpText_(p.argText, p.args);

    case 'aisales': {
      if (!aiEnabled_()) return isControlRoom_(ctx.source) ? 'ยังไม่ได้เปิดใช้ AI ค่ะ — ใส่ GEMINI_API_KEY ใน Script Properties ก่อนนะคะ' : 'ตอนนี้ยังไม่ได้เปิดใช้ AI ค่ะ';
      const snap = getSalesSnapshot_();
      if (snap.source !== 'sheet') return NO_SHEET_SALES_TEXT;
      return aiSalesComment_(snap) || 'ขออภัยค่ะ AI วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้งนะคะ';
    }

    case 'birthday':
      return birthdayCommand_(p.argText, now);

    case 'visits':
      return formatVisits_(p.argText, now);

    case 'reportlink':
      return reportLinkText_();

    case 'notvisited':
      return formatNotVisited_(p.argText, now);

    case 'sendsales': {
      if (!isControlRoom_(ctx.source)) return null; // ในกลุ่มอื่น "ส่งยอด" เป็นแชทปกติ
      const snap = getSalesSnapshot_();
      if (snap.source === 'none') return NO_SHEET_SALES_TEXT;
      let msgs;
      if (p.argText) {
        const team = findTeam_(snap, p.argText);
        if (!team) return 'ไม่พบเขต ' + p.argText + ' ค่ะ (ใช้ F1–F5)';
        msgs = salesMessages_(snap, team);
      } else {
        msgs = salesMessages_(snap, null);
      }
      return sendToMainGroup_(msgs, 'ยอด' + (p.argText ? ' ' + p.argText.toUpperCase() : ''));
    }

    case 'sendbirthday': {
      if (!isControlRoom_(ctx.source)) return null;
      const bd = birthdayCommand_(p.argText, now);
      if (!bd) return null;
      return sendToMainGroup_([].concat(bd), 'วันเกิดลูกค้า');
    }

    case 'customer':
      return formatCustomerSales_(getSalesSnapshot_(), p.argText);

    case 'salesday':
    case 'salesrank':
    case 'salescust':
    case 'salesprod': {
      const snap = getSalesSnapshot_();
      if (snap.source !== 'sheet') return NO_SHEET_SALES_TEXT;
      if (p.cmd === 'salesday') return formatLastDay_(snap);
      if (p.cmd === 'salesrank') return formatSalesRank_(snap);
      if (p.cmd === 'salescust') {
        if (!p.args.length) {
          const top = formatTopBy_(snap, 'customer', '👥 ลูกค้าท็อป', 10);
          return /^👥/.test(top) ? top + '\n\nดูทั้งเขต พิมพ์: ลูกค้า F3' : top;
        }
        const zone = teamKey_(p.argText).toUpperCase();
        if (!/^F\d+$/.test(zone)) return null; // "ลูกค้า ..." ที่ไม่ใช่เขต = แชทปกติ
        if (!snap.teams.some(function (t) { return t.name === zone; })) {
          return 'ไม่มีเขต ' + zone + ' ค่ะ — มีเขต ' + snap.teams.map(function (t) { return t.name; }).join(', ') + ' นะคะ';
        }
        return formatZoneCustomers_(snap, zone);
      }
      return formatTopBy_(snap, 'product', '📦 สินค้าท็อป', 10);
    }

    case 'importsales': {
      if (!adminAllowed_(ctx)) return null;
      const asOf = p.args[0] ? parseDateToken_(p.args[0], now) : null;
      if (asOf && asOf > startOfDay_(now)) return 'วันที่ของข้อมูลต้องไม่เกินวันนี้นะคะ';
      const r = importSalesFromDrive_(true, asOf);
      if (r.skipped) return 'ℹ️ ' + r.message;
      const snap = getSalesSnapshot_();
      const out = [r.message].concat(salesMessages_(snap, null));
      const ai = aiSalesComment_(snap);
      if (ai) out.push(ai);
      return out.slice(0, 5);
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

    case 'brief': {
      if (!adminAllowed_(ctx)) return null; // ตัวอย่างข้อความเช้า (นำเข้าไฟล์ + เรียก AI — ช้า) ใช้ในห้องสั่งการ
      const msgs = buildMorningMessages_(now);
      if (msgs.length) return msgs;
      return flag_('BRIEF_ENABLED') || flag_('BIRTHDAY_ENABLED') ? 'ยังไม่มีข้อมูลยอดขายหรือวันเกิดสำหรับข้อความเช้าค่ะ' : 'ข้อความเช้าปิดอยู่ค่ะ';
    }

    case 'review':
      return buildWeeklyReview_(now);
  }
  return null;
}

/** ข้อความที่ไม่ใช่คำสั่ง: "F4" → ยอดเขต, ชื่อลูกค้า (ตรงรายเดียว) → ยอดลูกค้า, อย่างอื่นเงียบ */
function lookupCommand_(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 60 || /\n/.test(t)) return null;
  if (/^(?:f|fish|เขต|zone)\s*\d{1,2}$/i.test(t)) return { cmd: 'sales', args: [t], argText: t };
  const names = customerIndex_();
  const exact = findCustomers_(names, t, true);
  if (exact.length === 1) return { cmd: 'customer', args: [exact[0]], argText: exact[0] };
  const person = findSalesName_(salesIndex_(), t);
  if (person) return { cmd: 'sales', args: [person], argText: person };
  const found = findCustomers_(names, t, false);
  if (found.length === 1) return { cmd: 'customer', args: [found[0]], argText: found[0] };
  if (found.length) return null;
  // พิมพ์ชื่อผิดเล็กน้อย → เดาให้ (เฉพาะข้อความสั้น ๆ คล้ายชื่อ กันชนแชทปกติ)
  if (t.length < 3 || t.length > 40 || t.split(/\s+/).length > 3 || /[?？]|ไหม|มั้ย|ครับ|ค่ะ|คะ|นะ$/.test(t)) return null;
  const near = similarNames_(t, salesIndex_(), names, 0.25);
  if (!near.length) return null;
  const clear = near.length === 1 || near[1].d > near[0].d;
  if (clear) return { cmd: near[0].kind === 'sales' ? 'sales' : 'customer', args: [near[0].name], argText: near[0].name, guessedFrom: t };
  return { cmd: 'nameguess', args: near.slice(0, 3).map(function (x) { return x.name; }), argText: t };
}

const NO_SHEET_SALES_TEXT = 'ยังไม่มีข้อมูลยอดขายของเดือนนี้ค่ะ รอผู้ดูแลอัปเดตไฟล์ยอดก่อนนะคะ';

// เมนูกลุ่มใหญ่ (ทีมขาย) — เฉพาะคำสั่งที่ทีมใช้ได้
const HELP_TEXT = [
  '🤖 คำสั่งน้องขุนศึก',
  '',
  '📊 ยอดขาย',
  '• ยอดขาย — ภาพรวม + F1–F5',
  '• F1–F5 — ยอดเขตนั้น',
  '• ชื่อลูกค้า — ยอดลูกค้ารายนั้น',
  '• ลูกค้า F3 — ลูกค้าทุกรายในเขต',
  "• ชื่อเซลส์ — ยอด + ลูกค้าของเซลส์คนนั้น",
  '  (พิมพ์ชื่อผิดนิดหน่อย น้องขุนศึกเดาให้ค่ะ)',
  '• ยอดเมื่อวาน · ยอดเซลส์ · ยอดลูกค้า',
  '',
  '💬 ถาม AI',
  '• แท็ก @น้องขุนศึก แล้วพิมพ์คำถาม',
  '  เช่น F3 ต้องขายวันละเท่าไหร่ถึงเป้า',
  '',
  '🎂 วันเกิดลูกค้า',
  '• วันเกิด — 30 วันข้างหน้า',
  '• วันเกิด ธ.ค. — ทั้งเดือน',
  '',
  '📍 บันทึกเยี่ยมลูกค้า',
  '• เยี่ยม / เข้าพบ / ติดตาม <ลูกค้า> <รายละเอียด>',
  '  เช่น เข้าพบ กบทองฟาร์ม สนใจสูตรใหม่',
  '  (แล้วแชร์ตำแหน่งต่อได้)',
  '• ดูเยี่ยม · ดูเยี่ยม F4 · ไม่ได้เยี่ยม F4',
  '• ไฟล์รายงาน — ลิงก์ไฟล์ Excel รวมทุกเขต (OneDrive)',
  '',
  '⏰ ทุกเช้า 7:30 (จ.–ส.) น้องขุนศึกสรุปยอด + วันเกิดให้เองค่ะ',
].join('\n');

// เมนูห้องสั่งการ — เพิ่มคำสั่งของผู้ดูแล
const ADMIN_HELP_TEXT = HELP_TEXT + '\n' + [
  '',
  '━━━━━━━━━━',
  '🛠️ เฉพาะห้องสั่งการ',
  '',
  '📤 ส่งไฟล์ Excel ยอดขายในห้องนี้',
  '• อัปเดตยอด 23/11 — แก้วันที่ของไฟล์ล่าสุด',
  '• สรุปเช้า — ดูตัวอย่างข้อความเช้า',
  '',
  '📣 ให้บอทพูดในกลุ่มใหญ่',
  '• ประกาศ <ข้อความ> (ใส่ @All ได้)',
  '• ส่งยอด · ส่งยอด F4 · ส่งวันเกิด',
  '',
  '🗓️ แผนงานประจำ',
  '• แผน — ดูแผน · แผน <รายการ> — ตั้งแผน',
  '• ยกเลิกแผน',
  '',
  '💬 พิมพ์คำถามได้เลย ไม่ต้องแท็ก',
].join('\n');
