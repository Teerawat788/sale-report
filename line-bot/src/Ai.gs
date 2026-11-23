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
  const msg = '🤖 วิเคราะห์โดย AI\n\n' + truncate_(tidyAiText_(text), 3000);
  cache.put(key, msg, 21600);
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
  return text ? '🤖 ' + truncate_(tidyAiText_(text), 3500)
    : 'ขออภัยค่ะ ตอนนี้น้องขุนศึกตอบไม่ได้ ลองใหม่อีกครั้งนะคะ' + (AI_LAST_ERROR ? '\n(สาเหตุ: ' + AI_LAST_ERROR + ')' : '');
}
