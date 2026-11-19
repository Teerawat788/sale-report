// โหลดไฟล์ .gs ใน Node พร้อม mock ของ Google Apps Script และ LINE API เพื่อทดสอบในเครื่อง
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const ORDER = ['Config', 'Util', 'Parser', 'Line', 'Store', 'Tasks', 'Weekly',
  'Calendar', 'Sales', 'Schedule', 'Main'];

function makeSheet(name) {
  const data = [];
  return {
    name,
    data,
    appendRow(row) { data.push(row.slice()); },
    setFrozenRows() {},
    getDataRange() { return { getValues: () => data.map((r) => r.slice()) }; },
    getRange(r, c) { return { setValue(v) { while (data[r - 1].length < c) data[r - 1].push(''); data[r - 1][c - 1] = v; } }; },
    deleteRow(r) { data.splice(r - 1, 1); },
  };
}

function createBot(opts = {}) {
  const props = Object.assign({ LINE_CHANNEL_ACCESS_TOKEN: 'test-token' }, opts.props || {});
  const cache = {};
  const sheets = {};
  const events = [];
  const lineCalls = [];
  const triggers = [];
  let dashboard = opts.dashboard;

  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
  };

  const calendar = {
    getEvents(start, end) {
      return events.filter((e) => e.start < end && e.end > start).map((e) => ({
        getId: () => e.id, getTitle: () => e.title, getStartTime: () => e.start,
        getEndTime: () => e.end, isAllDayEvent: () => !!e.allDay, getLocation: () => e.location || '',
      }));
    },
    createEvent(title, start, end, o) {
      const e = { id: 'ev' + (events.length + 1), title, start, end, allDay: false, description: o && o.description };
      events.push(e);
      return { getId: () => e.id };
    },
    createAllDayEvent(title, start, o) {
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      const e = { id: 'ev' + (events.length + 1), title, start, end, allDay: true, description: o && o.description };
      events.push(e);
      return { getId: () => e.id };
    },
  };

  const ctx = {
    console: opts.quiet === false ? console : { log() {}, warn() {}, error() {} },
    JSON, Math, Date, Number, String, Array, Object, RegExp, Error, isNaN,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
    }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { base64EncodeWebSafe: (s) => Buffer.from(s).toString('base64url') },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    CalendarApp: { getDefaultCalendar: () => calendar, getCalendarById: () => calendar },
    ContentService: {
      createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }),
      MimeType: { JSON: 'json' },
    },
    ScriptApp: {
      WeekDay: { FRIDAY: 'FRIDAY' },
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger(fn) {
        const t = { fn, getHandlerFunction: () => fn };
        const chain = new Proxy({}, { get: (_, k) => (k === 'create' ? () => triggers.push(t) : () => chain) });
        return chain;
      },
    },
    UrlFetchApp: {
      fetch(url, o = {}) {
        if (url.startsWith('https://api.line.me')) {
          const call = { url, method: o.method, body: o.payload ? JSON.parse(o.payload) : null };
          lineCalls.push(call);
          const body = /\/member\/|\/profile\//.test(url) ? JSON.stringify({ displayName: 'ผู้ทดสอบ' }) : '{}';
          return { getResponseCode: () => 200, getContentText: () => body };
        }
        if (!dashboard) return { getResponseCode: () => 404, getContentText: () => '' };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(dashboard) };
      },
    },
  };
  vm.createContext(ctx);
  ORDER.forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC, f + '.gs'), 'utf8'), ctx, { filename: f + '.gs' }));

  let now = opts.now || new Date(2026, 10, 19, 9, 0); // พฤ. 19 พ.ย. 2026
  ctx.now_ = () => new Date(now.getTime());

  return {
    ctx, props, sheets, events, lineCalls, triggers,
    setNow(d) { now = d; },
    setDashboard(d) { dashboard = d; },
    /** จำลองข้อความจากกลุ่ม คืนข้อความที่บอทตอบ (string) หรือ null */
    say(text, o = {}) {
      const before = lineCalls.length;
      const ev = {
        type: 'message', replyToken: 'rt',
        source: { type: 'group', groupId: o.groupId || 'Cgroup1', userId: o.userId || 'Uuser1' },
        message: { type: 'text', text, mention: o.mention },
      };
      ctx.doPost({ postData: { contents: JSON.stringify({ destination: o.destination || 'Ubot', events: [ev] }) } });
      const reply = lineCalls.slice(before).find((c) => c.url.endsWith('/message/reply'));
      return reply ? reply.body.messages.map((m) => m.text).join('\n') : null;
    },
    pushes() { return lineCalls.filter((c) => c.url.endsWith('/message/push')); },
  };
}

module.exports = { createBot };
