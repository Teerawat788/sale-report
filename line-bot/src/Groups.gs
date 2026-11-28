/**
 * กลุ่มที่น้องขุนศึกอยู่ + ข้อความเช้าส่งทุกกลุ่ม
 *  - LINE ไม่มี API ให้ดูว่าบอทอยู่กลุ่มไหนบ้าง → จำกลุ่มเองเมื่อถูกเชิญเข้า หรือมีคนพิมพ์ในกลุ่ม (ออกจากกลุ่ม = ลืม)
 *  - ข้อความเช้า: กลุ่มหลัก (GROUP_ID) + ทุกกลุ่มที่จำได้ ยกเว้นห้องสั่งการและกลุ่มที่พิมพ์ "ไม่รับข้อความเช้า"
 *  - LINE นับโควตาข้อความ push เข้ากลุ่มตามจำนวนสมาชิก → ถ้าโควตามีจำกัดและใกล้หมด
 *    จะเก็บโควตาไว้ให้กลุ่มหลักใช้ถึงสิ้นเดือนก่อน แล้วงดส่งกลุ่มอื่น (ดูได้ด้วยคำสั่ง "กลุ่ม" ในห้องสั่งการ)
 * Script Properties: KNOWN_GROUPS (บอทจัดการเอง) · MORNING_ALL_GROUPS = false → ส่งเฉพาะกลุ่มหลัก
 */

function knownGroups_() {
  try {
    const g = JSON.parse(prop_('KNOWN_GROUPS', '{}'));
    return g && typeof g === 'object' && !Array.isArray(g) ? g : {};
  } catch (e) {
    return {};
  }
}

function saveKnownGroups_(groups) {
  setProp_('KNOWN_GROUPS', JSON.stringify(groups));
}

/** จำกลุ่ม/ห้องแชทที่บอทอยู่ (เรียกทุก event — เขียนเฉพาะกลุ่มใหม่) */
function rememberGroup_(source) {
  if (!source || (source.type !== 'group' && source.type !== 'room')) return;
  const id = chatId_(source);
  if (!id) return;
  const groups = knownGroups_();
  if (groups[id]) return;
  groups[id] = { type: source.type, since: isoDay_(now_()) };
  saveKnownGroups_(groups);
}

function isoDay_(d) {
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}

function forgetGroup_(id) {
  const groups = knownGroups_();
  if (!groups[id]) return;
  delete groups[id];
  saveKnownGroups_(groups);
}

function morningToAllGroups_() {
  return prop_('LOCK_GROUPS', '') !== 'true' && flag_('MORNING_ALL_GROUPS');
}

/** กลุ่มที่ได้ข้อความเช้า: กลุ่มหลักก่อน แล้วกลุ่มอื่นตามลำดับที่น้องขุนศึกรู้จัก */
function morningTargets_() {
  const main = prop_('GROUP_ID', '');
  const upload = prop_('UPLOAD_GROUP_ID', '');
  const out = main ? [main] : [];
  if (!morningToAllGroups_()) return out;
  const groups = knownGroups_();
  Object.keys(groups).forEach(function (id) {
    if (id === main || id === upload || groups[id].off || out.indexOf(id) >= 0) return;
    out.push(id);
  });
  return out;
}

/** "7:30 (จ.–ส.)" ตาม MORNING_TIME / MORNING_DAYS */
function morningWhenText_() {
  const c = parseClock_(prop_('MORNING_TIME', '07:30')) || { h: 7, m: 30 };
  const days = String(prop_('MORNING_DAYS', '1,2,3,4,5,6'));
  const names = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const label = days === '1,2,3,4,5,6' ? 'จ.–ส.' : days === '1,2,3,4,5' ? 'จ.–ศ.' : days === '0,1,2,3,4,5,6' ? 'ทุกวัน'
    : days.split(',').map(function (d) { return names[Number(d)] || ''; }).filter(Boolean).join(' ');
  return c.h + ':' + ('0' + c.m).slice(-2) + ' (' + label + ')';
}

// ---------------------------------------------------------------- โควตาข้อความ LINE

/** { limit, used, unlimited } — ไม่ทราบ = null (เช่น เรียก API ไม่ได้) */
function lineQuota_() {
  const out = { limit: null, used: null, unlimited: false };
  try {
    const q = lineFetch_('/message/quota', 'get');
    if (q.code === 200) {
      const j = JSON.parse(q.body);
      if (j.type === 'none') out.unlimited = true;
      else if (j.type === 'limited' && isFinite(Number(j.value))) out.limit = Number(j.value);
    }
    const u = lineFetch_('/message/quota/consumption', 'get');
    if (u.code === 200) {
      const n = Number(JSON.parse(u.body).totalUsage);
      if (isFinite(n)) out.used = n;
    }
  } catch (e) {
    console.error('ดูโควตา LINE ไม่ได้: ' + (e && e.message || e));
  }
  return out;
}

/** จำนวนสมาชิกในกลุ่ม (ไม่นับบอท) — null = ดูไม่ได้ (เช่น น้องขุนศึกไม่ได้อยู่ในกลุ่มแล้ว) */
function groupMemberCount_(id) {
  const kind = /^R/.test(id) ? 'room' : 'group';
  const res = lineFetch_('/' + kind + '/' + id + '/members/count', 'get', null, true);
  if (res.code !== 200) return null;
  try {
    const n = Number(JSON.parse(res.body).count);
    return isFinite(n) ? n : null;
  } catch (e) {
    return null;
  }
}

function groupName_(id) {
  if (/^R/.test(id)) return 'ห้องแชท (ไม่มีชื่อ)';
  const res = lineFetch_('/group/' + id + '/summary', 'get', null, true);
  if (res.code !== 200) return '';
  try { return cleanText_(JSON.parse(res.body).groupName); } catch (e) { return ''; }
}

/** วันที่ยังต้องส่งข้อความเช้าหลังวันนี้ จนถึงสิ้นเดือน */
function morningDaysLeft_(now) {
  const days = String(prop_('MORNING_DAYS', '1,2,3,4,5,6')).split(',').map(Number);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let n = 0;
  for (let d = now.getDate() + 1; d <= last; d++) {
    if (days.indexOf(new Date(now.getFullYear(), now.getMonth(), d).getDay()) >= 0) n++;
  }
  return n;
}

/**
 * ส่งข้อความเช้าเข้าทุกกลุ่ม — กลุ่มหลักก่อนเสมอ
 * โควตาจำกัด: กันโควตาไว้ให้กลุ่มหลักถึงสิ้นเดือน ที่เหลือจึงส่งกลุ่มอื่น · LINE ตอบ 429 (โควตาหมด) → หยุด
 * คืน { sent, skipped, failed } (รายการ id) และเก็บผลล่าสุดไว้ดูใน "กลุ่ม"
 */
function pushToMorningGroups_(messages, now) {
  const main = prop_('GROUP_ID', '');
  const report = { date: fmtDate_(now), sent: [], skipped: [], failed: [], quota: false };
  let stop = false;
  const push = function (id) {
    const res = linePush_(id, messages);
    if (res && res.code < 300) { report.sent.push(id); return true; }
    report.failed.push(id);
    if (res && res.code === 429) { stop = true; report.quota = true; }
    return false;
  };
  const targets = morningTargets_();
  if (main && targets[0] === main) push(main);
  const extras = targets.filter(function (id) { return id !== main; });
  if (stop) Array.prototype.push.apply(report.skipped, extras);
  if (extras.length && !stop) {
    const q = lineQuota_();
    let left = Infinity;
    if (!q.unlimited && q.limit !== null && q.used !== null) {
      const reserve = main ? (groupMemberCount_(main) || 0) * morningDaysLeft_(now) : 0;
      left = q.limit - q.used - reserve;
    }
    extras.forEach(function (id) {
      if (stop) { report.skipped.push(id); return; }
      const cost = left === Infinity ? 0 : groupMemberCount_(id);
      if (left !== Infinity && (cost === null || cost > left)) { report.skipped.push(id); report.quota = true; return; }
      if (push(id) && left !== Infinity) left -= cost;
    });
  }
  setProp_('LAST_MORNING_REPORT', JSON.stringify(report));
  if (report.skipped.length || report.failed.length) {
    console.warn('ข้อความเช้า: ส่ง ' + report.sent.length + ' กลุ่ม · งดส่ง ' + report.skipped.length + ' · ไม่สำเร็จ ' + report.failed.length);
  }
  return report;
}

// ---------------------------------------------------------------- คำสั่ง

/** ลำดับกลุ่มในรายการ (เลขที่ใช้กับ "ปิดข้อความเช้า 2") */
function groupList_() {
  const main = prop_('GROUP_ID', '');
  const upload = prop_('UPLOAD_GROUP_ID', '');
  const groups = knownGroups_();
  const ids = [];
  if (main) ids.push(main);
  Object.keys(groups).forEach(function (id) { if (id !== main && id !== upload) ids.push(id); });
  if (upload) ids.push(upload);
  return ids.map(function (id) {
    return { id: id, main: id === main, control: id === upload, off: !!(groups[id] && groups[id].off) };
  });
}

/** ห้องสั่งการ: "กลุ่ม" — รายชื่อกลุ่ม จำนวนคน ใครได้ข้อความเช้า + โควตาเดือนนี้ */
function groupsCard_(now) {
  const list = groupList_();
  if (!list.length) return 'ยังไม่รู้จักกลุ่มไหนเลยค่ะ — พิมพ์อะไรก็ได้ในกลุ่มที่มีน้องขุนศึก 1 ครั้ง เช่น เมนู';
  const all = morningToAllGroups_();
  const groups = knownGroups_();
  let changed = false;
  let cost = 0;
  let unknownCost = false;
  const rows = list.map(function (g, i) {
    const count = groupMemberCount_(g.id);
    let name = groupName_(g.id);
    if (name && groups[g.id] && groups[g.id].name !== truncate_(name, 40)) { groups[g.id].name = truncate_(name, 40); changed = true; }
    if (!name) name = (groups[g.id] && groups[g.id].name) || (count === null ? '(น้องขุนศึกไม่ได้อยู่ในกลุ่มนี้แล้ว?)' : 'กลุ่มไม่มีชื่อ');
    const gets = g.main || (!g.control && !g.off && all);
    if (gets) { if (count === null) unknownCost = true; else cost += count; }
    const status = g.main ? '⭐ หลัก' : g.control ? '🛠️ สั่งการ' : !all ? '—' : g.off ? '🔕 ปิด' : '✅ รับ';
    return [String(i + 1), { t: name }, count === null ? '-' : fmtNum_(count, 0), { t: status, color: gets ? FX.green : FX.sub }];
  });
  if (changed) saveKnownGroups_(groups);
  const body = [fxTable_([
    { label: '#', flex: 1 }, { label: 'กลุ่ม', flex: 7, wrap: true }, { label: 'คน', flex: 2, align: 'end' }, { label: 'ข้อความเช้า', flex: 4, align: 'end' },
  ], rows, { margin: 'none' })];
  const q = lineQuota_();
  const days = morningDaysLeft_(now);
  const pairs = [
    ['โควตาข้อความเดือนนี้', q.unlimited ? 'ไม่จำกัด' : q.limit !== null ? fmtNum_(q.used || 0, 0) + ' / ' + fmtNum_(q.limit, 0) : 'ดูไม่ได้'],
    ['ข้อความเช้า 1 ครั้งใช้', (unknownCost ? '≥ ' : '≈ ') + fmtNum_(cost, 0) + ' ข้อความ'],
    ['ถึงสิ้นเดือน (' + days + ' วัน)', '≈ ' + fmtNum_(cost * days, 0) + ' ข้อความ'],
  ];
  if (q.limit !== null && q.used !== null) {
    const left = q.limit - q.used;
    pairs.push(['คงเหลือ', fmtNum_(left, 0), { color: left < cost * days ? FX.red : FX.green, bold: true }]);
  }
  body.push(fxSection_('📨 โควตาข้อความ LINE'));
  body.push(fxKV_(pairs, { margin: 'sm' }));
  body.push(fxNote_('LINE นับข้อความที่ส่งเข้ากลุ่มตามจำนวนสมาชิก (ตอบกลับคำสั่งไม่นับ)'));
  let last = null;
  try { last = JSON.parse(prop_('LAST_MORNING_REPORT', 'null')); } catch (e) { /* ignore */ }
  if (last && last.sent) {
    const extra = (last.skipped.length ? ' · งดส่ง ' + last.skipped.length + ' กลุ่ม' : '') +
      (last.failed.length ? ' · ส่งไม่สำเร็จ ' + last.failed.length + ' กลุ่ม' : '') + (last.quota ? ' (โควตาใกล้หมด/หมด)' : '');
    body.push(fxNote_('☀️ ข้อความเช้าล่าสุด ' + last.date + ': ส่ง ' + last.sent.length + ' กลุ่ม' + extra,
      last.skipped.length || last.failed.length ? FX.red : FX.sub));
  }
  return fxMessage_('👥 กลุ่มที่มีน้องขุนศึก ' + list.length + ' กลุ่ม', fxBubble_({
    title: '👥 กลุ่มที่มีน้องขุนศึก',
    lines: [all ? 'ข้อความเช้า ' + morningWhenText_() + ' ส่งทุกกลุ่มที่ ✅' : 'ข้อความเช้าส่งเฉพาะกลุ่มหลัก (MORNING_ALL_GROUPS / LOCK_GROUPS)'],
    body: body,
    footer: 'ปิด/เปิด: ปิดข้อความเช้า 2 · เปิดข้อความเช้า 2\nกลุ่มที่ไม่อยู่ในรายการ: พิมพ์อะไรก็ได้ในกลุ่มนั้น 1 ครั้ง',
  }));
}

/** ปิด/เปิดข้อความเช้า — ในกลุ่ม = กลุ่มนั้น · ห้องสั่งการ + เลข = กลุ่มตามรายการ "กลุ่ม" */
function setMorningOff_(ctx, argText, off) {
  const control = isControlRoom_(ctx.source);
  let id = '';
  if (control) {
    const n = parseInt(argText, 10);
    if (!n) return 'พิมพ์ "กลุ่ม" เพื่อดูเลขกลุ่ม แล้วพิมพ์ ' + (off ? 'ปิด' : 'เปิด') + 'ข้อความเช้า <เลข> ค่ะ';
    const g = groupList_()[n - 1];
    if (!g) return 'ไม่มีกลุ่มเลข ' + n + ' ค่ะ (พิมพ์ "กลุ่ม" เพื่อดูรายการ)';
    if (g.control) return 'ห้องสั่งการไม่ได้รับข้อความเช้าอยู่แล้วค่ะ';
    id = g.id;
  } else {
    if (argText) return null;
    if (ctx.source.type !== 'group' && ctx.source.type !== 'room') return null;
    id = chatId_(ctx.source);
  }
  if (id === prop_('GROUP_ID', '')) {
    return 'กลุ่มหลักได้รับข้อความเช้าเสมอค่ะ (ถ้าจะปิดทั้งหมด ให้ผู้ดูแลตั้ง BRIEF_ENABLED / BIRTHDAY_ENABLED = false)';
  }
  const groups = knownGroups_();
  groups[id] = Object.assign(groups[id] || { type: /^R/.test(id) ? 'room' : 'group', since: isoDay_(now_()) }, { off: off });
  saveKnownGroups_(groups);
  const which = control ? 'กลุ่มเลข ' + parseInt(argText, 10) + ' ' : 'กลุ่มนี้';
  if (off) return '🔕 ' + which + 'จะไม่ได้รับข้อความเช้าแล้วค่ะ' + (control ? '' : '\n(อยากได้อีก พิมพ์: รับข้อความเช้า)') +
    '\nคำสั่งต่าง ๆ ยังใช้ได้ตามปกตินะคะ';
  if (!morningToAllGroups_()) return 'ตอนนี้ข้อความเช้าตั้งให้ส่งเฉพาะกลุ่มหลักค่ะ (ผู้ดูแลเปิดได้ที่ MORNING_ALL_GROUPS / LOCK_GROUPS)';
  return '☀️ ' + which + 'จะได้รับข้อความเช้าทุก ' + morningWhenText_() + ' ค่ะ';
}

// ---------------------------------------------------------------- แชทส่วนตัว (1:1) + ผู้ดูแล

function jsonListProp_(key) {
  try {
    const v = JSON.parse(prop_(key, '[]'));
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

/** คนที่พิมพ์ในห้องสั่งการ = ผู้ดูแล (ห้องสั่งการมีแค่ผู้ดูแลกับบอท) — ใช้คำสั่งผู้ดูแลในแชทส่วนตัวได้ */
function rememberAdmin_(userId) {
  if (!userId) return;
  const list = jsonListProp_('ADMIN_USERS');
  if (list.indexOf(userId) >= 0) return;
  list.push(userId);
  setProp_('ADMIN_USERS', JSON.stringify(list.slice(-50)));
}

/** ผู้ดูแล: เคยพิมพ์ในห้องสั่งการ หรืออยู่ใน ADMIN_USER_IDS (ใส่เอง คั่นด้วย ,) */
function isAdminUser_(userId) {
  if (!userId) return false;
  const manual = String(prop_('ADMIN_USER_IDS', '')).split(/[\s,]+/).filter(Boolean);
  return manual.indexOf(userId) >= 0 || jsonListProp_('ADMIN_USERS').indexOf(userId) >= 0;
}

/** กลุ่มที่ใช้ตรวจว่าเป็นคนในทีม: กลุ่มหลัก → ห้องสั่งการ → กลุ่มอื่นที่น้องขุนศึกอยู่ (สูงสุด 10 กลุ่ม) */
function teamGroupIds_() {
  const ids = [prop_('GROUP_ID', ''), prop_('UPLOAD_GROUP_ID', '')].filter(Boolean);
  Object.keys(knownGroups_()).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
  return ids.slice(0, 10);
}

/**
 * แชทส่วนตัวได้ไหม — ยอดขาย/ลูกค้าเป็นข้อมูลบริษัท จึงให้คุยได้เฉพาะคนที่อยู่ในกลุ่มที่มีน้องขุนศึก
 * (เช็กผ่าน LINE ว่าเป็นสมาชิกกลุ่ม · จำผล 6 ชม. / ไม่ใช่สมาชิก 10 นาที) · DM_MEMBERS_ONLY = false → ใครแอดก็คุยได้
 */
function dmAllowed_(userId) {
  if (!userId) return false;
  if (!flag_('DM_MEMBERS_ONLY', true) || isAdminUser_(userId)) return true;
  const groups = teamGroupIds_();
  if (!groups.length) return true; // ยังไม่ได้ตั้งกลุ่ม (ช่วงติดตั้ง)
  const cache = CacheService.getScriptCache();
  const key = 'dm_ok_' + userId;
  const hit = cache.get(key);
  if (hit) return hit === '1';
  const ok = groups.some(function (g) {
    return lineFetch_('/' + (/^R/.test(g) ? 'room' : 'group') + '/' + g + '/member/' + userId, 'get', null, true).code === 200;
  });
  cache.put(key, ok ? '1' : '0', ok ? 21600 : 600);
  return ok;
}

const DM_QUICK = ['ยอดขาย', 'ยอดเซลส์', 'ปิดเดือน', 'วันเกิด', 'ลิงก์', 'เมนู'];

function dmWelcomeText_() {
  return [
    '👋 สวัสดีค่ะ น้องขุนศึกเป็นผู้ช่วยทีมขายค่ะ',
    'คุยส่วนตัวกับน้องขุนศึกได้เหมือนในกลุ่มเลย เช่น',
    '',
    '• ยอดขาย · F3 · ยอดเซลส์ · ปิดเดือน',
    '• พิมพ์ชื่อเซลส์ / ชื่อลูกค้า ดูยอด',
    '• เข้าพบ / ติดตาม <ลูกค้า> <รายละเอียด>',
    '  บันทึกการเข้าพบลงรายงานทีมเหมือนพิมพ์ในกลุ่ม',
    '• ลิงก์ — ไฟล์ทีมบน OneDrive',
  ].concat(aiEnabled_() ? ['• ถามได้เลย เช่น F5 จะถึงเป้าไหม'] : [])
    .concat(['', 'พิมพ์ "เมนู" ดูคำสั่งทั้งหมดค่ะ']).join('\n');
}

const DM_LOCKED_TEXT = '🔒 น้องขุนศึกคุยส่วนตัวได้เฉพาะสมาชิกกลุ่มทีมขายค่ะ\n' +
  'ถ้าอยู่ทีมขาย ให้ผู้ดูแลเชิญเข้ากลุ่มทีมก่อน แล้วทักมาใหม่นะคะ';

const DM_UNKNOWN_TEXT = '🙏 น้องขุนศึกยังไม่เข้าใจคำนี้ค่ะ\n' +
  'ลองพิมพ์ เช่น ยอดขาย · F3 · ชื่อเซลส์ · ชื่อลูกค้า\nหรือพิมพ์ เมนู ดูคำสั่งทั้งหมด';

/** คำสั่งผู้ดูแล — แชทส่วนตัวที่ใช้ไม่ได้ บอกให้รู้แทนการเงียบ */
const ADMIN_ONLY_CMDS = ['sendsales', 'sendbirthday', 'sendvisithelp', 'sendformlinks', 'importsales', 'brief', 'groups',
  'holidays', 'delholiday', 'whoami', 'registerupload'];
