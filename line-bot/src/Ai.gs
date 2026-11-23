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
    : code === 403 ? 'คีย์ไม่มีสิทธิ์ใช้ Gemini API (เปิด Generative Language API / ตรวจข้อจำกัดของคีย์)'
    : code === 404 ? 'ไม่พบโมเดล — ตั้ง GEMINI_MODEL เป็นชื่อรุ่นที่มีใน AI Studio'
    : code === 429 ? 'ใช้เกินโควตา รอสักครู่หรือเปิด billing'
    : code >= 500 ? 'เซิร์ฟเวอร์ Gemini คนใช้เยอะชั่วคราว ลองใหม่อีกครั้งค่ะ'
    : '';
  return 'Gemini ' + code + (hint ? ': ' + hint : '') + (msg ? ' (' + truncate_(msg, 140) + ')' : '');
}

/** เรียก Google Gemini (generateContent) — ถ้าไม่พบโมเดลจะลองรุ่นสำรอง */
function callGemini_(system, userText) {
  const key = prop_('GEMINI_API_KEY', '');
  if (!key) return null;
  const preferred = prop_('GEMINI_MODEL', GEMINI_MODEL);
  const models = uniq_([preferred, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']);
  for (let i = 0; i < models.length; i++) {
    const res = UrlFetchApp.fetch(GEMINI_API_URL + encodeURIComponent(models[i]) + ':generateContent', {
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
    const code = res.getResponseCode();
    // ไม่พบโมเดล / คนใช้เยอะ / โควตารุ่นนี้หมด → ลองรุ่นถัดไป
    if ((code === 404 || code === 429 || code >= 500) && i < models.length - 1) {
      console.warn('Gemini ' + models[i] + ' → ' + code + ' ลองรุ่นถัดไป');
      continue;
    }
    if (code !== 200) {
      AI_LAST_ERROR = geminiErrorText_(code, res.getContentText());
      console.error(AI_LAST_ERROR);
      return null;
    }
    const body = JSON.parse(res.getContentText());
    if (body.promptFeedback && body.promptFeedback.blockReason) {
      AI_LAST_ERROR = 'Gemini ปฏิเสธคำถาม (' + body.promptFeedback.blockReason + ')';
      return null;
    }
    const cand = (body.candidates || [])[0];
    const text = cand && cand.content ? (cand.content.parts || []).filter(function (p) { return p.text && !p.thought; })
      .map(function (p) { return p.text; }).join('').trim() : '';
    if (!text) {
      AI_LAST_ERROR = 'Gemini ไม่ส่งคำตอบกลับ' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '');
      return null;
    }
    if (models[i] !== preferred) console.log('Gemini ใช้รุ่นสำรอง: ' + models[i]);
    return text;
  }
  return null;
}

/** รันจาก Apps Script เพื่อทดสอบ AI — ดูผลใน "บันทึกการดำเนินการ" */
function testAi() {
  console.log('ตัว AI: ' + (aiProvider_() || 'ยังไม่ได้ใส่คีย์'));
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

/** บทวิเคราะห์ยอดจาก AI (cache ตามข้อมูลชุดเดียวกัน 6 ชม.) */
function aiSalesComment_(snap) {
  if (!snap || snap.source !== 'sheet' || !aiEnabled_()) return null;
  const payload = JSON.stringify(aiSalesPayload_(snap));
  const cache = CacheService.getScriptCache();
  const key = 'ai_sales_' + aiProvider_() + '_' + hashString_(payload);
  const hit = cache.get(key);
  if (hit) return hit;
  let text = null;
  try {
    text = callAi_(AI_SYSTEM_PROMPT, 'ข้อมูลยอดขาย (JSON):\n' + payload);
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

/** ตอบคำถามภาษาธรรมดา (ต้องมี GEMINI_API_KEY หรือ ANTHROPIC_API_KEY) */
function askBot_(question, now) {
  if (!aiEnabled_()) {
    return 'น้องขุนศึกยังตอบคำถามแบบนี้ไม่ได้ค่ะ ต้องเปิดใช้ AI ก่อน (ใส่ GEMINI_API_KEY ใน Script Properties)\nระหว่างนี้พิมพ์ "เมนู" เพื่อดูคำสั่งที่ใช้ได้นะคะ';
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
  return text ? '🤖 ' + truncate_(text, 3500)
    : 'ขออภัยค่ะ ตอนนี้น้องขุนศึกตอบไม่ได้ ลองใหม่อีกครั้งนะคะ' + (AI_LAST_ERROR ? '\n(สาเหตุ: ' + AI_LAST_ERROR + ')' : '');
}
