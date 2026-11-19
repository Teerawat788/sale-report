// รันด้วย: npm test  (หรือ TZ=Asia/Bangkok node test/run.js)
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { createBot } = require('./harness');

const dashboard = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'dashboard.json'), 'utf8'));
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); } catch (e) {
    console.error('✗ ' + name + '\n  ' + (e.stack || e));
    process.exitCode = 1;
  }
}
const D = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);
const same = (a, b) => assert.strictEqual(a && a.getTime(), b && b.getTime());

// ---------- Parser ----------
test('parseCommand: คำสั่งพื้นฐานและกันข้อความแชทปกติ', () => {
  const { ctx } = createBot();
  assert.strictEqual(ctx.parseCommand_('ยอด').cmd, 'sales');
  assert.strictEqual(ctx.parseCommand_('ยอด fish4').cmd, 'sales');
  assert.strictEqual(ctx.parseCommand_('ยอดเยี่ยมมาก'), null);
  assert.strictEqual(ctx.parseCommand_('ยอด ดีมากครับ'), null);
  assert.strictEqual(ctx.parseCommand_('วันนี้ ไปไหนกัน'), null);
  assert.strictEqual(ctx.parseCommand_('วันนี้').cmd, 'today');
  assert.strictEqual(ctx.parseCommand_('งาน + โทรหาลูกค้า').cmd, 'addtask');
  assert.strictEqual(ctx.parseCommand_('/งาน+ โทร').cmd, 'addtask');
  assert.strictEqual(ctx.parseCommand_('เสร็จ 3 #5').cmd, 'done');
  assert.strictEqual(ctx.parseCommand_('เสร็จ ครับ'), null);
  assert.strictEqual(ctx.parseCommand_('สวัสดีครับ'), null);
});

test('parseDateToken: คำไทย ชื่อวัน วันที่ และ พ.ศ.', () => {
  const { ctx } = createBot();
  const now = D(2026, 11, 19, 9); // พฤหัส
  same(ctx.parseDateToken_('วันนี้', now), D(2026, 11, 19));
  same(ctx.parseDateToken_('พรุ่งนี้', now), D(2026, 11, 20));
  same(ctx.parseDateToken_('มะรืน', now), D(2026, 11, 21));
  same(ctx.parseDateToken_('ศุกร์', now), D(2026, 11, 20));
  same(ctx.parseDateToken_('วันศุกร์หน้า', now), D(2026, 11, 27));
  same(ctx.parseDateToken_('พฤหัส', now), D(2026, 11, 19));
  same(ctx.parseDateToken_('จันทร์นี้', now), D(2026, 11, 23));
  same(ctx.parseDateToken_('25/11', now), D(2026, 11, 25));
  same(ctx.parseDateToken_('5/1', now), D(2027, 1, 5));
  same(ctx.parseDateToken_('25/11/2569', now), D(2026, 11, 25));
  same(ctx.parseDateToken_('25/11/69', now), D(2026, 11, 25));
  assert.strictEqual(ctx.parseDateToken_('31/11', now), null);
  assert.strictEqual(ctx.parseDateToken_('14:00', now), null);
});

test('parseTimeToken / parseEventInput', () => {
  const { ctx } = createBot();
  const now = D(2026, 11, 19, 9);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.parseTimeToken_('9.30น.'))), { h: 9, m: 30 });
  assert.strictEqual(ctx.parseTimeToken_('3'), null);
  assert.strictEqual(ctx.parseTimeToken_('25:00'), null);
  const ev = ctx.parseEventInput_('25/11 14:00-15:30 เยี่ยมฟาร์มคุณสมชาย', now);
  same(ev.start, D(2026, 11, 25, 14));
  same(ev.end, D(2026, 11, 25, 15, 30));
  assert.strictEqual(ev.title, 'เยี่ยมฟาร์มคุณสมชาย');
  const ad = ctx.parseEventInput_('พรุ่งนี้ ออกบูธงานเกษตร', now);
  assert.strictEqual(ad.allDay, true);
  same(ad.start, D(2026, 11, 20));
  assert.strictEqual(ctx.parseEventInput_('พรุ่งนี้ 10:00', now), null);
});

test('stripMentions: แยก @mention และตัด mention บอท', () => {
  const { ctx } = createBot();
  const text = '@SalesBot งาน+ โทรหาฟาร์ม @สมชาย พรุ่งนี้';
  const r = ctx.stripMentions_(text, { mentionees: [
    { index: 0, length: 9, userId: 'Ubot', isSelf: true },
    { index: 26, length: 6, userId: 'Usomchai' },
  ] });
  assert.strictEqual(r.text, 'งาน+ โทรหาฟาร์ม พรุ่งนี้');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.mentions)), [{ userId: 'Usomchai', name: 'สมชาย' }]);
});

test('isoWeekKey', () => {
  const { ctx } = createBot();
  assert.strictEqual(ctx.isoWeekKey_(D(2026, 11, 19)), '2026-W47');
  assert.strictEqual(ctx.isoWeekKey_(D(2027, 1, 1)), '2026-W53');
});

// ---------- Flow ----------
test('ลงทะเบียนกลุ่ม และล็อกกลุ่มอื่น', () => {
  const bot = createBot({ props: { BOT_USER_ID: 'Ubot' } });
  assert.match(bot.say('ลงทะเบียน'), /ลงทะเบียนกลุ่มนี้แล้ว/);
  assert.strictEqual(bot.props.GROUP_ID, 'Cgroup1');
  assert.match(bot.say('ลงทะเบียน', { groupId: 'Cother' }), /กลุ่มอื่นอยู่แล้ว/);
  assert.strictEqual(bot.say('งาน', { groupId: 'Cother' }), null);
  assert.strictEqual(bot.say('งาน', { destination: 'Ufake' }), null);
});

test('ยอดขายจาก dashboard.json', () => {
  const bot = createBot({ dashboard });
  const r = bot.say('ยอด');
  assert.match(r, /538\.84 \/ 1,900\.02 ตัน \(28\.36%\)/);
  assert.match(r, /Time gone 33%/);
  assert.match(r, /ต้องเร่งอีก 17\.72 ตัน\/วัน/);
  assert.match(r, /Fish 4: 391\.32/);
  const f5 = bot.say('ยอด fish5');
  assert.match(f5, /Fish 5: 147\.46/);
  assert.doesNotMatch(f5, /Fish 4/);
  bot.setDashboard(null);
  assert.match(bot.say('ยอด'), /เกิดข้อผิดพลาด.*dashboard\.json/);
});

test('งานติดตาม: เพิ่ม/ดู/งานฉัน/เลื่อน/ปิด/ลบ', () => {
  const bot = createBot();
  const msg = 'งาน+ ส่งใบเสนอราคาฟาร์ม A พรุ่งนี้ @สมชาย';
  const add = bot.say(msg, {
    mention: { mentionees: [{ index: msg.indexOf('@สมชาย'), length: 6, userId: 'Usomchai' }] },
  });
  assert.match(add, /เพิ่มงาน #1 ส่งใบเสนอราคาฟาร์ม A/);
  assert.match(add, /👤 สมชาย/);
  assert.match(add, /ศ\. 20 พ\.ย\./);
  assert.match(bot.say('งาน+ โทรตามเช็ค'), /#2 .*\n👤 ผู้ทดสอบ/);
  bot.say('งาน+ เก็บเงินร้าน B 10/11');

  const list = bot.say('งาน');
  assert.match(list, /งานค้าง 3 งาน \(เลยกำหนด 1\)/);
  assert.ok(list.indexOf('#3') < list.indexOf('#1'), 'งานเลยกำหนดต้องขึ้นก่อน');
  assert.match(bot.say('งานฉัน', { userId: 'Usomchai' }), /#1/);
  assert.doesNotMatch(bot.say('งานฉัน', { userId: 'Usomchai' }), /#2/);

  assert.match(bot.say('เลื่อน 3 ศุกร์หน้า'), /เลื่อนงาน #3 .* ศ\. 27 พ\.ย\./);
  assert.match(bot.say('เสร็จ 1 2 9'), /ปิดงาน #1[\s\S]*ปิดงาน #2[\s\S]*ไม่พบงานค้าง #9/);
  assert.match(bot.say('งาน'), /งานค้าง 1 งาน\n/);
  assert.match(bot.say('ลบงาน 3'), /ลบงาน #3/);
  assert.match(bot.say('งาน'), /ไม่มีงานค้าง/);
  assert.strictEqual(bot.sheets.Tasks.data[1][5], 'เสร็จ');
});

test('นัด: เพิ่ม และดู agenda', () => {
  const bot = createBot();
  assert.match(bot.say('นัด+ วันนี้ 14:00 เยี่ยมฟาร์มคุณสมชาย'), /บันทึกนัดแล้ว\nพฤ\. 19 พ\.ย\. 14:00–15:00/);
  bot.say('นัด+ พรุ่งนี้ ออกบูธงานเกษตร');
  bot.say('นัด+ จันทร์หน้า 09:00-10:00 ประชุมทีม');
  assert.match(bot.say('วันนี้'), /นัดวันนี้ พฤ\. 19 พ\.ย\. \(1\)\n• 14:00–15:00 เยี่ยมฟาร์มคุณสมชาย/);
  assert.match(bot.say('พรุ่งนี้'), /ทั้งวัน ออกบูธงานเกษตร/);
  const wk = bot.say('สัปดาห์นี้');
  assert.match(wk, /นัดสัปดาห์นี้ \(2\)/);
  assert.doesNotMatch(wk, /ประชุมทีม/);
});

test('งานประจำสัปดาห์: เพิ่ม/เช็ค/ขึ้นสัปดาห์ใหม่รีเซ็ต', () => {
  const bot = createBot();
  assert.match(bot.say('ประจำ+ จันทร์ ส่งรายงานลูกค้าใหม่ @สมชาย'), /#1 ส่งรายงานลูกค้าใหม่ \(ภายใน จ\.\)\n👤 สมชาย/);
  bot.say('ประจำ+ อัปเดตสต๊อกตัวแทน');
  assert.match(bot.say('ประจำ'), /ทำแล้ว 0\/2[\s\S]*⬜ #1[\s\S]*⬜ #2 .*ภายในสัปดาห์/);
  assert.match(bot.say('เช็ค 1'), /✅ ส่งรายงานลูกค้าใหม่/);
  assert.match(bot.say('ประจำ'), /ทำแล้ว 1\/2[\s\S]*✅ #1/);
  bot.setNow(D(2026, 11, 23, 9));
  assert.match(bot.say('ประจำ'), /ทำแล้ว 0\/2/);
});

test('สรุปเช้า (วันจันทร์มีแผนสัปดาห์) และสรุปสัปดาห์ ส่งเข้ากลุ่ม', () => {
  const bot = createBot({ dashboard, now: D(2026, 11, 23, 7) });
  bot.say('ลงทะเบียน');
  bot.say('งาน+ ส่งใบเสนอราคา วันนี้');
  bot.say('งาน+ โทรตามลูกค้า พฤหัส');
  bot.say('ประจำ+ จันทร์ ส่งรายงาน');
  bot.say('นัด+ วันนี้ 10:00 ประชุมเช้า');
  bot.ctx.morningBrief();
  const brief = bot.pushes()[0];
  assert.strictEqual(brief.body.to, 'Cgroup1');
  const text = brief.body.messages[0].text;
  assert.match(text, /สวัสดีตอนเช้า.*จันทร์ 23 พ\.ย\. 2569/);
  assert.match(text, /แผนสัปดาห์นี้[\s\S]*ส่งรายงาน/);
  assert.match(text, /10:00–11:00 ประชุมเช้า/);
  assert.match(text, /ส่งใบเสนอราคา/);
  assert.doesNotMatch(text, /โทรตามลูกค้า/);
  assert.match(text, /📊 ยอด 538\.84/);

  bot.setNow(D(2026, 11, 22, 7)); // อาทิตย์ = ไม่ใช่วันทำงาน
  bot.ctx.morningBrief();
  assert.strictEqual(bot.pushes().length, 1);

  bot.setNow(D(2026, 11, 27, 16));
  bot.say('เสร็จ 1');
  bot.ctx.weeklyReview();
  const review = bot.pushes()[1].body.messages[0].text;
  assert.match(review, /สรุปประจำสัปดาห์ จ\. 23 พ\.ย\. – อา\. 29 พ\.ย\./);
  assert.match(review, /ปิดงานสัปดาห์นี้ 1 งาน\n• #1 ส่งใบเสนอราคา/);
  assert.match(review, /งานค้าง 1 งาน \(เลยกำหนด 1\)/);
  assert.match(review, /งานประจำ ทำแล้ว 0\/1/);
});

test('เตือนก่อนนัด ครั้งเดียวต่อนัด', () => {
  const bot = createBot({ now: D(2026, 11, 19, 13, 40) });
  bot.say('ลงทะเบียน');
  bot.say('นัด+ วันนี้ 14:00 เยี่ยมฟาร์ม');
  bot.say('นัด+ วันนี้ 16:00 ประชุม');
  bot.ctx.eventReminder();
  bot.ctx.eventReminder();
  assert.strictEqual(bot.pushes().length, 1);
  assert.match(bot.pushes()[0].body.messages[0].text, /เยี่ยมฟาร์ม \(อีก 20 นาที\)/);
  assert.doesNotMatch(bot.pushes()[0].body.messages[0].text, /ประชุม/);
});

test('ปิดการแจ้งเตือนด้วย Script Properties และตั้ง trigger', () => {
  const bot = createBot({ props: { BRIEF_ENABLED: 'false', GROUP_ID: 'Cgroup1' } });
  bot.ctx.morningBrief();
  assert.strictEqual(bot.pushes().length, 0);
  bot.ctx.setupTriggers();
  bot.ctx.setupTriggers();
  assert.deepStrictEqual(bot.triggers.map((t) => t.fn).sort(), ['eventReminder', 'morningBrief', 'weeklyReview']);
});

test('ข้อความยาวถูกแบ่งเป็นหลายบับเบิล', () => {
  const { ctx } = createBot();
  const long = Array.from({ length: 400 }, (_, i) => 'บรรทัดที่ ' + i + ' ข้อความทดสอบยาว ๆ').join('\n');
  const msgs = ctx.toMessages_(long);
  assert.ok(msgs.length >= 2 && msgs.every((m) => m.text.length <= 4900));
  assert.strictEqual(msgs.map((m) => m.text).join('\n'), long);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' (มีที่ล้มเหลว)' : ''));
