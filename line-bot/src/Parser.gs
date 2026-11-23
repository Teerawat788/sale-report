/** แปลงข้อความในกลุ่มเป็นคำสั่ง (ไม่เรียก Google service — ทดสอบได้) */

const COMMANDS = {
  help: ['เมนู', 'คำสั่ง', 'ช่วยเหลือ', 'help', '?'],
  register: ['ลงทะเบียน', 'register'],
  registerupload: ['กลุ่มอัปโหลด', 'ลงทะเบียนอัปโหลด'],
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
  birthday: ['วันเกิด', 'วันเกิดลูกค้า', 'hbd'],
  sendsales: ['ส่งยอด', 'ส่งยอดขาย'],
  visits: ['ดูเยี่ยม', 'ประวัติเยี่ยม', 'ดูติดตาม', 'ดูเข้าพบ', 'ประวัติติดตาม'],
  notvisited: ['ไม่ได้เยี่ยม', 'ยังไม่เยี่ยม'],
  sendbirthday: ['ส่งวันเกิด'],
  aisales: ['วิเคราะห์', 'วิเคราะห์ยอด', 'ai'],
  review: ['สรุปสัปดาห์', 'review'],
};

/** คำสั่งที่ต้องพิมพ์โดด ๆ (กันบอทตอบแชทปกติ เช่น "วันนี้ ไปไหนกัน") */
const NO_ARG_COMMANDS = ['help', 'register', 'whoami', 'tasks', 'mytasks', 'today',
  'tomorrow', 'week', 'weekly', 'brief', 'review', 'salesday', 'salesrank', 'salescust',
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
  return { text: out.replace(/\s+/g, ' ').trim(), mentions: mentions, botMentioned: botMentioned };
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
