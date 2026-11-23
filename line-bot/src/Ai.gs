/**
 * วิเคราะห์ยอดขายด้วย Claude (ไม่บังคับ)
 *
 * เปิดใช้: Script Property ANTHROPIC_API_KEY = API key จาก console.anthropic.com
 * ไม่มีคีย์ = ข้ามส่วนนี้ บอทยังรายงานตัวเลขตามปกติ
 * ผลวิเคราะห์ถูก cache ตามวันที่ของข้อมูล — ไฟล์เดิมถามซ้ำไม่เสียเงินซ้ำ
 */

const AI_MODEL = 'claude-opus-5-5';
const AI_API_URL = 'https://api.anthropic.com/v1/messages';

const AI_SYSTEM_PROMPT = [
  'คุณเป็นผู้ช่วยผู้จัดการฝ่ายขายอาหารปลา (ทีม Fish เขต F1–F5) ของบริษัทอาหารสัตว์ในประเทศไทย',
  'อ่านตัวเลขยอดขายสะสมของเดือนที่ได้รับ แล้วเขียนบทวิเคราะห์สั้น ๆ ภาษาไทยสำหรับส่งในกลุ่ม LINE ของทีมขาย',
  'ใช้ตัวเลขจากข้อมูลที่ให้เท่านั้น ห้ามสมมติตัวเลขเพิ่ม ถ้าไม่มีเป้าก็พูดถึงสปีดและแนวโน้มแทน',
  'เขียน 4–6 บรรทัด แต่ละบรรทัดขึ้นต้นด้วย "• " ไม่ใช้ markdown ไม่ใช้หัวข้อ:',
  'ภาพรวมจะปิดเดือนได้ตามเป้าหรือไม่, เขตที่ทำได้ดี, เขตที่ต้องเร่งพร้อมจำนวนตันต่อวันที่ต้องเพิ่ม,',
  'ความเคลื่อนไหวของยอดวันล่าสุด (ถ้ามี) และข้อแนะนำ 1 ข้อที่ทีมทำได้ทันที',
].join('\n');

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
    console.error('Claude API ' + code + ': ' + res.getContentText());
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

/** บทวิเคราะห์ยอดจาก AI (cache ตามข้อมูลชุดเดียวกัน 6 ชม.) */
function aiSalesComment_(snap) {
  if (!snap || snap.source !== 'sheet' || !prop_('ANTHROPIC_API_KEY', '')) return null;
  const payload = JSON.stringify(aiSalesPayload_(snap));
  const cache = CacheService.getScriptCache();
  const key = 'ai_sales_' + hashString_(payload);
  const hit = cache.get(key);
  if (hit) return hit;
  let text = null;
  try {
    text = callClaude_(AI_SYSTEM_PROMPT, 'ข้อมูลยอดขาย (JSON):\n' + payload);
  } catch (e) {
    console.error('AI: ' + (e && e.message || e));
  }
  if (!text) return null;
  const msg = '🤖 วิเคราะห์โดย AI\n' + truncate_(text, 3000);
  cache.put(key, msg, 21600);
  return msg;
}


// ---------------------------------------------------------------- ถามบอทเป็นภาษาธรรมดา

const AI_QA_SYSTEM_PROMPT = [
  'คุณคือ "น้องขุนศึก" ผู้ช่วยทีมขายอาหารปลา TFM (เขต F1–F5) ตอบในกลุ่ม LINE ของทีม',
  'พูดสุภาพแบบผู้หญิง ใช้ค่ะ/คะ ให้ถูกต้อง (ค่ะ = บอกเล่า, คะ = คำถาม)',
  'ตอบจากข้อมูล JSON ที่ให้เท่านั้น ถ้าข้อมูลไม่พอให้บอกตรง ๆ ว่าไม่มีข้อมูลนั้น ห้ามเดาตัวเลข',
  'คำนวณให้ถูก แสดงตัวเลขสำคัญ ตอบสั้น อ่านง่ายบนมือถือ: บรรทัดสั้น ขึ้นต้นด้วย "• " ไม่เกิน 12 บรรทัด ไม่ใช้ markdown',
  'หน่วย: ตัน และมูลค่าเป็นล้านบาท (ฟิลด์ *MB) — วันทำงานนับ จ.–ส.',
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

/** ตอบคำถามภาษาธรรมดา (ต้องมี ANTHROPIC_API_KEY) */
function askBot_(question, now) {
  if (!prop_('ANTHROPIC_API_KEY', '')) {
    return 'น้องขุนศึกยังตอบคำถามแบบนี้ไม่ได้ค่ะ ต้องเปิดใช้ AI ก่อน (ใส่ ANTHROPIC_API_KEY ใน Script Properties)\nระหว่างนี้พิมพ์ "เมนู" เพื่อดูคำสั่งที่ใช้ได้นะคะ';
  }
  let snap = null;
  try { snap = getSalesSnapshot_(); } catch (e) { /* ignore */ }
  const payload = JSON.stringify(aiQaPayload_(snap, now));
  let text = null;
  try {
    text = callClaude_(AI_QA_SYSTEM_PROMPT, 'ข้อมูล (JSON):\n' + payload + '\n\nคำถาม: ' + question);
  } catch (e) {
    console.error('AI Q&A: ' + (e && e.message || e));
  }
  return text ? '🤖 ' + truncate_(text, 3500) : 'ขออภัยค่ะ ตอนนี้น้องขุนศึกตอบไม่ได้ ลองใหม่อีกครั้งนะคะ';
}
