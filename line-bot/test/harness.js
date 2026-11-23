// โหลดไฟล์ .gs ใน Node พร้อม mock ของ Google Apps Script และ LINE API เพื่อทดสอบในเครื่อง
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const ORDER = ['Config', 'Util', 'Parser', 'Line', 'Store', 'Tasks', 'Weekly',
  'Calendar', 'Sales', 'SalesData', 'Ai', 'Birthdays', 'Reminders', 'Schedule', 'Main'];

function makeSheet(name) {
  const data = [];
  return {
    name,
    data,
    appendRow(row) { data.push(row.slice()); },
    setFrozenRows() {},
    getDataRange() { return { getValues: () => data.map((r) => r.slice()) }; },
    getRange(r, c, nr, nc) {
      return {
        setValue(v) { while (data[r - 1].length < c) data[r - 1].push(''); data[r - 1][c - 1] = v; },
        setValues(vals) {
          vals.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); });
        },
      };
    },
    deleteRow(r) { data.splice(r - 1, 1); },
    clearContents() { data.length = 0; },
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
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
    getSheets: () => Object.values(sheets),
  };
  const aiCalls = [];
  let aiResponse = opts.aiResponse || { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: '• ทดสอบบทวิเคราะห์' }] } };
  const driveFiles = []; // { id, name, mime, content (string | 2D array), updated: Date }
  const lineFiles = {}; // messageId → ตาราง (จำลองไฟล์ที่ส่งในแชท)
  const fileObj = (f) => ({
    getId: () => f.id, getName: () => f.name, getMimeType: () => f.mime,
    getLastUpdated: () => f.updated,
    getBlob: () => ({ getDataAsString: () => f.content }),
    setTrashed() { f.trashed = true; },
  });

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
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { base64EncodeWebSafe: (s) => Buffer.from(s).toString('base64url'), parseCsv },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: (id) => {
        const f = driveFiles.find((x) => x.id === id);
        if (!f) return ss;
        return { getSheets: () => [{ getDataRange: () => ({ getValues: () => f.content.map((r) => r.slice()) }) }] };
      },
    },
    DriveApp: {
      getFolderById: () => ({
        createFile(blob) {
          const f = { id: 'up' + driveFiles.length, name: blob.name, mime: /\.csv$/i.test(blob.name) ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            table: blob.table, content: blob.table, updated: new Date(now.getTime()) };
          driveFiles.push(f);
          return fileObj(f);
        },
        getFiles() { const list = driveFiles.filter((f) => !f.trashed); let i = 0; return { hasNext: () => i < list.length, next: () => fileObj(list[i++]) }; } }),
      getFileById: (id) => fileObj(driveFiles.find((x) => x.id === id)),
    },
    CalendarApp: { getDefaultCalendar: () => calendar, getCalendarById: () => calendar },
    ContentService: {
      createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }),
      MimeType: { JSON: 'json' },
    },
    ScriptApp: {
      getOAuthToken: () => 'oauth',
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
        const copy = url.match(/drive\/v3\/files\/([^/]+)\/copy/);
        if (copy) {
          const src = driveFiles.find((x) => x.id === copy[1]);
          const id = 'tmp' + driveFiles.length;
          driveFiles.push({ id, name: JSON.parse(o.payload).name, mime: 'application/vnd.google-apps.spreadsheet', content: src.table, updated: new Date() });
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id }) };
        }
        const content = url.match(/api-data\.line\.me\/v2\/bot\/message\/([^/]+)\/content/);
        if (content) {
          lineCalls.push({ url, method: 'get' });
          const src = lineFiles[content[1]];
          if (!src) return { getResponseCode: () => 404, getContentText: () => '' };
          return { getResponseCode: () => 200, getBlob: () => ({ table: src, setName(n) { this.name = n; return this; } }) };
        }
        if (url.startsWith('https://api.anthropic.com')) {
          aiCalls.push({ url, headers: o.headers, body: JSON.parse(o.payload) });
          const r = typeof aiResponse === 'function' ? aiResponse() : aiResponse;
          return { getResponseCode: () => r.status || 200, getContentText: () => JSON.stringify(r.body) };
        }
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
    ctx, props, sheets, events, lineCalls, triggers, driveFiles, aiCalls,
    /** จำลองส่งไฟล์เข้ากลุ่ม */
    sendFile(name, table, o = {}) {
      const id = 'm' + Object.keys(lineFiles).length;
      lineFiles[id] = table;
      const before = lineCalls.length;
      const ev = { type: 'message', replyToken: 'rt', source: { type: 'group', groupId: o.groupId || 'Cgroup1', userId: 'Uuser1' },
        message: { type: 'file', id, fileName: name, fileSize: 1000 } };
      ctx.doPost({ postData: { contents: JSON.stringify({ destination: 'Ubot', events: [ev] }) } });
      const reply = lineCalls.slice(before).find((c) => c.url.endsWith('/message/reply'));
      return reply ? reply.body.messages.map((m) => m.text).join('\n') : null;
    },
    setAiResponse(r) { aiResponse = r; },
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
