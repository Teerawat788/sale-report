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

/** ตอบกลับ (reply ไม่นับโควตาข้อความ) */
function lineReply_(replyToken, messages) {
  return lineFetch_('/message/reply', 'post', { replyToken: replyToken, messages: toMessages_(messages) });
}

/** ส่งหาแบบ push (นับโควตาข้อความของ LINE OA ตามจำนวนสมาชิกในกลุ่ม) */
function linePush_(to, messages) {
  if (!to) { console.warn('ไม่มีปลายทาง push — พิมพ์ "ลงทะเบียน" ในกลุ่มก่อน'); return null; }
  return lineFetch_('/message/push', 'post', { to: to, messages: toMessages_(messages) });
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
