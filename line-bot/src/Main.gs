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
    if (cust) lineReply_(ev.replyToken, '📌 แนบตำแหน่งการเข้าพบ ' + cust + ' แล้วค่ะ');
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
    const icon = visit.type.indexOf('ติดตาม') === 0 ? '📞' : '🤝';
    const ack = '✅ บันทึกการ' + visit.type.replace(' (ลูกค้าใหม่)', '') + (visit.isNew ? 'ลูกค้าใหม่' : 'ลูกค้า') + 'แล้วค่ะ\n' + icon + ' ' + visit.customer + (zone ? ' [' + zone + ']' : '') +
      '\n👤 ' + sender.name + ' · ' + fmtDate_(now_()) + ' ' + fmtTime_(now_()) +
      (visit.note ? '\n🗒️ ' + truncate_(visit.note.replace(/\n+/g, ' '), 120) : '');
    if (zone) {
      lineReply_(ev.replyToken, ack + '\n(แชร์ตำแหน่งต่อได้ภายใน 30 นาที)');
    } else {
      // ไม่รู้เขต → ถาม พร้อมปุ่ม และสอนวิธีพิมพ์ครั้งหน้า
      lineReply_(ev.replyToken, withQuickReply_(ack + '\n\n❓ ลูกค้านี้อยู่เขตไหนคะ? กดปุ่มด้านล่าง หรือพิมพ์ เขต F3\n' +
        '💡 ครั้งหน้าใส่เขตต่อจากคำขึ้นต้นได้เลย เช่น เข้าพบ F3 ' + visit.customer,
        ['เขต F1', 'เขต F2', 'เขต F3', 'เขต F4', 'เขต F5']));
    }
    return;
  }

  // ตอบเขตหลังบันทึก: "เขต F3" → ใส่เขตให้รายการล่าสุดที่ยังไม่มีเขต
  const zoneAns = !blocked && stripped.text.match(/^เขต\s*(?:f|fish)?\s*([1-5])$/i);
  if (zoneAns && /f/i.test(stripped.text)) {
    const r = setVisitZone_({ userId: source.userId || '', name: lineDisplayName_(source) }, 'F' + zoneAns[1], now_());
    if (r) { lineReply_(ev.replyToken, r); return; }
  }

  // พิมพ์ชื่อแบบฟอร์ม เช่น "ข้อมูลลูกปลา" / "ผลการเลี้ยง" → ปุ่มเปิดไฟล์นั้น
  const form = !blocked && findFormByName_(stripped.text);
  if (form) { lineReply_(ev.replyToken, formLinksCard_(form)); return; }

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
        ['ยอดขาย', 'ยอดเมื่อวาน', 'ยอดเซลส์', 'ยอดลูกค้า', 'วันเกิด', 'ดูการเข้าพบ', 'ดูรายงาน', 'แบบฟอร์ม']);

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

    case 'visithelp':
      return VISIT_HELP_TEXT;

    case 'formlinks':
      return formLinksCard_();

    case 'sendformlinks': {
      if (!isControlRoom_(ctx.source)) return null;
      const card = formLinksCard_();
      if (typeof card === 'string') return card;
      return sendToMainGroup_([card], 'แบบฟอร์มกรอกข้อมูล');
    }

    case 'sendvisithelp':
      if (!isControlRoom_(ctx.source)) return null;
      return sendToMainGroup_([VISIT_HELP_TEXT], 'วิธีบันทึกการเข้าพบลูกค้า');

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
  '🤝 บันทึกการเข้าพบลูกค้า',
  '• เข้าพบ / ติดตาม <ลูกค้า> <รายละเอียด>',
  '  เช่น เข้าพบ กบทองฟาร์ม สนใจสูตรใหม่',
  '  (แล้วแชร์ตำแหน่งต่อได้)',
  '• ดูการเข้าพบ · ดูการเข้าพบ F4 · ยังไม่ได้เข้าพบ F4',
  '• วิธีบันทึก — อธิบายวิธีพิมพ์แบบละเอียด',
  '• ดูรายงาน — ลิงก์ไฟล์ Excel รวมทุกเขต (OneDrive)',
  '',
  '📝 แบบฟอร์มกรอกข้อมูล',
  '• ข้อมูลลูกปลา — ไฟล์กรอกการลงลูกปลา',
  '• ผลการเลี้ยง — ไฟล์กรอกผลการเลี้ยงปลา',
  '• แบบฟอร์ม — ทั้ง 2 ไฟล์',
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
  '• ส่งยอด · ส่งยอด F4 · ส่งวันเกิด · ส่งวิธีบันทึก · ส่งแบบฟอร์ม',
  '',
  '🗓️ แผนงานประจำ',
  '• แผน — ดูแผน · แผน <รายการ> — ตั้งแผน',
  '• ยกเลิกแผน',
  '',
  '💬 พิมพ์คำถามได้เลย ไม่ต้องแท็ก',
].join('\n');
