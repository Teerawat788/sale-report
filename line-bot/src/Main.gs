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
  // คำสั่งปกติ หรือพิมพ์ชื่อเขต (F4) / ชื่อลูกค้า เฉย ๆ
  const parsed = parseCommand_(stripped.text) || lookupCommand_(stripped.text);
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
      if (snap.source !== 'sheet') return null;
      const customers = customerNames_(snap);
      const exact = findCustomers_(customers, p.argText, true);
      if (exact.length === 1) return formatCustomerSales_(snap, exact[0]);
      const person = findSalesPerson_(snap, p.argText);
      if (person) return formatPersonSales_(snap, person);
      const found = findCustomers_(customers, p.argText, false);
      if (found.length === 1) return formatCustomerSales_(snap, found[0]);
      if (found.length > 1) {
        return '🔎 พบลูกค้า ' + found.length + ' ราย — พิมพ์ชื่อให้ตรงขึ้น\n' +
          found.slice(0, 15).map(function (n) { return '• ' + n; }).join('\n') + (found.length > 15 ? '\n…' : '');
      }
      return null;
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
      if (p.cmd === 'salescust') return formatTopBy_(snap, 'customer', '👥 ลูกค้าท็อป', 10);
      return formatTopBy_(snap, 'product', '📦 สินค้าท็อป', 10);
    }

    case 'importsales': {
      const asOf = p.args[0] ? parseDateToken_(p.args[0], now) : null;
      if (asOf && asOf > startOfDay_(now)) return 'วันที่ของข้อมูลต้องไม่เกินวันนี้';
      const r = importSalesFromDrive_(true, asOf);
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

/** ข้อความที่ไม่ใช่คำสั่ง: "F4" → ยอดเขต, ชื่อลูกค้า (ตรงรายเดียว) → ยอดลูกค้า, อย่างอื่นเงียบ */
function lookupCommand_(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 60 || /\n/.test(t)) return null;
  if (/^(?:f|fish|เขต|zone)\s*\d{1,2}$/i.test(t)) return { cmd: 'sales', args: [t], argText: t };
  const found = findCustomers_(customerIndex_(), t, false);
  return found.length === 1 ? { cmd: 'customer', args: [found[0]], argText: found[0] } : null;
}

const NO_SHEET_SALES_TEXT = 'ยังไม่มียอดรายวันจาก Power BI ในแท็บ SalesData\n' +
  'Export ข้อมูลจาก Power BI เป็น .csv แล้ววางในโฟลเดอร์ Google Drive ที่ตั้งไว้ จากนั้นพิมพ์ "อัปเดตยอด"';

const HELP_TEXT = [
  '🤖 คำสั่งบอททีมขาย',
  '',
  '📊 ยอดขาย',
  '• ยอด — สรุปยอดเดือนนี้ | ยอด fish4 | ยอด <ชื่อเซลส์>',
  '• พิมพ์ F1–F5 = ยอดเขต | พิมพ์ชื่อลูกค้า เช่น กบทองฟาร์ม = ยอดลูกค้า',
  '• ยอดเมื่อวาน | ยอดเซลส์ (อันดับ) | ยอดลูกค้า | ยอดสินค้า',
  '• อัปเดตยอด — ดึงไฟล์ล่าสุดเข้าระบบ (ระบุวันข้อมูล: อัปเดตยอด 18/11)',
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
