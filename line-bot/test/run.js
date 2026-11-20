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
  assert.strictEqual(bot.say('ยอด ดีมากครับ'), null);
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
  assert.deepStrictEqual(bot.triggers.map((t) => t.fn).sort(), ['eventReminder', 'importSalesHourly', 'morningBrief', 'weeklyReview']);
});

test('ข้อความยาวถูกแบ่งเป็นหลายบับเบิล', () => {
  const { ctx } = createBot();
  const long = Array.from({ length: 400 }, (_, i) => 'บรรทัดที่ ' + i + ' ข้อความทดสอบยาว ๆ').join('\n');
  const msgs = ctx.toMessages_(long);
  assert.ok(msgs.length >= 2 && msgs.every((m) => m.text.length <= 4900));
  assert.strictEqual(msgs.map((m) => m.text).join('\n'), long);
});

// ---------- Power BI / SalesData ----------
const PBI_CSV = [
  '\uFEFFInvoice Date,Sales Team,Sales Name,Customer Name,Material Description,Qty (KG),Net Amount',
  '11/17/2026,Fish 4,สมชาย ใจดี,ฟาร์ม A,อาหารปลา 1,"12,000","240,000.00"',
  '11/18/2026,Fish 4,สมชาย ใจดี,ฟาร์ม B,อาหารปลา 2,8000,160000',
  '11/18/2026,Fish 5,วิทย์ รักงาน,ร้าน C,อาหารปลา 1,15000,300000',
  '11/19/2026,Fish 4,สมชาย ใจดี,ฟาร์ม A,อาหารปลา 1,5000,100000',
  '11/19/2026,Fish 5,วิทย์ รักงาน,ร้าน D,อาหารปลา 3,20000,400000',
  '11/19/2026,Fish 5,นก สายบุญ,ฟาร์ม E,อาหารปลา 3,3000,60000',
  'Total,,,,,"63,000","1,260,000"',
].join('\r\n');

function pbiBot() {
  const bot = createBot({ dashboard, now: D(2026, 11, 20, 9), props: { IMPORT_FOLDER_ID: 'folder1' } });
  bot.say('ลงทะเบียน');
  bot.driveFiles.push({ id: 'f1', name: 'export.csv', mime: 'text/csv', content: PBI_CSV, updated: D(2026, 11, 20, 6) });
  bot.ctx.setupSalesSheets();
  const tgt = bot.sheets.Targets.data;
  tgt.push(['2026-11', 'Fish 4', '', 400], ['2026-11', 'Fish 5', '', 300],
    ['2026-11', 'Fish 4', 'สมชาย ใจดี', 200], ['2026-11', 'Fish 5', 'วิทย์ รักงาน', 150], ['2026-11', 'Fish 5', 'นก สายบุญ', 100]);
  return bot;
}

test('mapColumns / วันที่ / ตัวเลข', () => {
  const { ctx } = createBot();
  const m = ctx.mapColumns_(['Invoice Date', 'Sales Team', 'Sales Name', 'Customer Name', 'Material Description', 'Qty (KG)', 'Sales Amount']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m)), { date: 0, ton: 5, amount: 6, customer: 3, product: 4, team: 1, sales: 2 });
  assert.strictEqual(ctx.parseNumber_('(1,234.5)'), -1234.5);
  same(ctx.parseSheetDate_('19/11/2569', 'DMY'), D(2026, 11, 19));
  same(ctx.parseSheetDate_('11/19/2026', 'MDY'), D(2026, 11, 19));
  same(ctx.parseSheetDate_('2026-11-19T00:00:00', 'DMY'), D(2026, 11, 19));
  same(ctx.parseSheetDate_(46345, 'DMY'), D(2026, 11, 19));
  assert.strictEqual(ctx.detectDateOrder_(['11/19/2026', '11/18/2026']), 'MDY');
  assert.throws(() => ctx.rowsFromTable_([['a', 'b'], [1, 2]]), /ไม่พบคอลัมน์/);
});

test('อัปเดตยอด: นำเข้า CSV จาก Power BI (kg→ตัน, ข้ามแถว Total, นำเข้าซ้ำไม่ซ้ำซ้อน)', () => {
  const bot = pbiBot();
  const r = bot.say('อัปเดตยอด');
  assert.match(r, /นำเข้ายอดขาย 6 แถว \(อ\. 17 พ\.ย\. – พฤ\. 19 พ\.ย\.\)/);
  assert.strictEqual(bot.sheets.SalesData.data.length, 7);
  assert.strictEqual(bot.sheets.SalesData.data[1][5], 12);
  bot.say('อัปเดตยอด');
  assert.strictEqual(bot.sheets.SalesData.data.length, 7);
  bot.ctx.importSalesHourly();
  assert.strictEqual(bot.sheets.SalesData.data.length, 7);
});

test('นำเข้า .xlsx (แปลงผ่าน Drive) และแทนที่เฉพาะช่วงวันที่ในไฟล์', () => {
  const bot = pbiBot();
  bot.say('อัปเดตยอด');
  bot.driveFiles.push({ id: 'f2', name: 'day20.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    table: [['วันที่', 'ทีม', 'เซลส์', 'ลูกค้า', 'สินค้า', 'ตัน'], [D(2026, 11, 19), 'Fish 4', 'สมชาย ใจดี', 'ฟาร์ม A', 'อาหารปลา 1', 7]],
    updated: D(2026, 11, 20, 8) });
  assert.match(bot.say('อัปเดตยอด'), /1 แถว[\s\S]*day20\.xlsx/);
  const d19 = bot.sheets.SalesData.data.slice(1).filter((r) => r[0].getDate() === 19);
  assert.strictEqual(d19.length, 1);
  assert.ok(bot.driveFiles.find((f) => f.id.startsWith('tmp')).trashed, 'ไฟล์ชั่วคราวต้องถูกลบ');
});

test('ยอด / ยอดเมื่อวาน / ยอดเซลส์ / ยอด <ชื่อ> / ยอดลูกค้า / ยอดสินค้า จาก SalesData', () => {
  const bot = pbiBot();
  bot.say('อัปเดตยอด');
  const total = bot.say('ยอด');
  // 63 ตัน จากเป้า 700, วันทำงาน จ-ส: พ.ย. 2026 มี 25 วัน, ถึง 19 พ.ย. = 16 วัน (อาทิตย์ 1,8,15)
  assert.match(total, /ยอดขายสะสม ถึง พฤหัสบดี 19 พ\.ย\. 2569/);
  assert.match(total, /วันทำงาน 16\/25 วัน \(เหลือ 9\)/);
  assert.match(total, /🏢 รวมทุกเขต 🔴\nตัน: 63\.00 \/ 700\.00 \(9\.0%\)/);
  assert.match(total, /📍 F4 🔴\nตัน: 25\.00 \/ 400\.00/);
  assert.match(total, /📅 วันล่าสุด 28\.00 ตัน · 0\.56 ล้านบาท/);

  const day = bot.say('ยอดเมื่อวาน');
  assert.match(day, /ยอดขายวันที่ พฤ\. 19 พ\.ย\.: 28\.00 ตัน/);
  assert.match(day, /1\. วิทย์ รักงาน — 20\.00 ตัน/);

  const rank = bot.say('ยอดเซลส์');
  assert.match(rank, /1\. วิทย์ รักงาน \(F5\) — 35\.00 \/ 150\.00 ตัน \(23\.3%\) 🔴/);

  const me = bot.say('ยอด สมชาย');
  assert.match(me, /👤 สมชาย ใจดี \(F4\)/);
  assert.match(me, /25\.00 \/ 200\.00 ตัน/);
  assert.match(me, /ต้องทำอีก 175\.00 ตัน ≈ 19\.44 ตัน\/วัน/);
  assert.match(me, /1\. ฟาร์ม A — 17\.00 ตัน/);

  assert.match(bot.say('ยอด f5'), /📍 F5[\s\S]*ตัน: 38\.00 \/ 300\.00[\s\S]*วิทย์ รักงาน/);
  assert.match(bot.say('ยอดลูกค้า'), /1\. ร้าน D — 20\.00 ตัน/);
  assert.match(bot.say('ยอดสินค้า'), /ทั้งหมด 3 รายการ\n1\. อาหารปลา 1 — 32\.00 ตัน\n2\. อาหารปลา 3 — 23\.00/);
  assert.strictEqual(bot.say('ยอด ใครไม่รู้'), null);
});

test('สรุปเช้านำเข้าไฟล์ใหม่อัตโนมัติ และแสดงยอดวันล่าสุด + ท็อปเซลส์', () => {
  const bot = pbiBot();
  bot.ctx.morningBrief();
  const text = bot.pushes()[0].body.messages[0].text;
  assert.match(text, /📊 ยอดถึง พฤ\. 19 พ\.ย\. \(วันทำงาน 16\/25\)\nตัน 63\.00 \(9\.0%\)/);
  assert.match(text, /วันที่ พฤ\. 19 พ\.ย\. 28\.00 ตัน · 0\.56 ล้านบาท · ท็อป: วิทย์ รักงาน 20\.0/);
  bot.setNow(D(2026, 11, 20, 16));
  bot.ctx.weeklyReview();
  assert.match(bot.pushes()[1].body.messages[0].text, /ท็อปเซลส์เดือนนี้\n1\. วิทย์ รักงาน/);
});

test('ไม่มี SalesData: คำสั่งยอดรายวันแนะนำวิธีตั้งค่า', () => {
  const bot = createBot({ dashboard });
  assert.match(bot.say('ยอดเซลส์'), /ยังไม่มียอดรายวันจาก Power BI/);
  assert.match(bot.say('อัปเดตยอด'), /ยังไม่ได้ตั้ง IMPORT_FOLDER_ID/);
});

test('รายงานรวม + แยก F1–F5: ตันและบาท, สปีดต่อวัน, คาดปิดเดือน, % ของเป้า', () => {
  const rows = ['Invoice Date,Zone,Sales Name,Customer,Product,Ton,Net Amount'];
  const zones = { F1: 20, F2: 15, F3: 12, F4: 25, F5: 9 };
  for (let d = 2; d <= 19; d++) {
    if (new Date(2026, 10, d).getDay() === 0) continue;
    Object.entries(zones).forEach(([z, t]) => rows.push(`${d}/11/2026,${z},เซลส์ ${z},ลูกค้า ${z},อาหารปลา,${t},${t * 21500}`));
  }
  const bot = createBot({ now: D(2026, 11, 20, 9), props: { IMPORT_FOLDER_ID: 'x' } });
  bot.driveFiles.push({ id: 'f', name: 'pbi.csv', mime: 'text/csv', content: rows.join('\n'), updated: D(2026, 11, 20) });
  bot.ctx.setupSalesSheets();
  [['F1', 500, 10.5], ['F2', 400, 8.6], ['F3', 300, 6.4], ['F4', 600, 13], ['F5', 250, 5.4]]
    .forEach(([z, t, a]) => bot.sheets.Targets.data.push(['2026-11', z, '', t, a]));
  assert.match(bot.say('อัปเดตยอด'), /80 แถว/);
  const r = bot.say('ยอด');
  // 16 วันทำงาน: 81 ตัน/วัน x 25 = 2,025 ตัน = 98.8% ของ 2,050
  assert.match(r, /🏢 รวมทุกเขต 🟡\nตัน: 1,296\.00 \/ 2,050\.00 \(63\.2%\)\n   สปีด 81\.00 ตัน\/วัน → ปิดเดือน 2,025\.00 \(98\.8%\)\n   ต้องทำ 83\.78 ตัน\/วัน ⚠️ ขาด 2\.78/);
  assert.match(r, /มูลค่า: 27\.86 \/ 43\.90 ล้านบาท \(63\.5%\)\n   สปีด 1\.74 ล้านบาท\/วัน → ปิดเดือน 43\.54 ล้านบาท \(99\.2%\)/);
  assert.match(r, /📍 F2 🔴\nตัน: 240\.00 \/ 400\.00 \(60\.0%\)\n   สปีด 15\.00 ตัน\/วัน → ปิดเดือน 375\.00 \(93\.8%\)/);
  assert.match(r, /📍 F4 🟢[\s\S]*ปิดเดือน 13\.44 ล้านบาท \(103\.4%\)/);
  assert.ok(r.indexOf('📍 F1') < r.indexOf('📍 F2') && r.indexOf('📍 F4') < r.indexOf('📍 F5'));
  for (const q of ['ยอด f4', 'ยอด F4', 'ยอด เขต4']) assert.match(bot.say(q), /📍 F4 🟢[\s\S]*ต้องทำ 22\.22 ตัน\/วัน ✅/);
  assert.match(bot.say('ยอดเมื่อวาน'), /81\.00 ตัน · 1\.74 ล้านบาท\n• F1 20\.00 ตัน · 0\.43 ล้านบาท/);
  assert.match(bot.say('สรุปเช้า'), /F1 100% 🟢 · F2 94% 🔴 · F3 100% 🟢 · F4 104% 🟢 · F5 90% 🔴/);
});

test('Targets แท็บเก่า (4 คอลัมน์) ได้หัวคอลัมน์ "เป้า (ล้านบาท)" เพิ่ม', () => {
  const bot = createBot();
  const sh = bot.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet('Targets');
  sh.appendRow(['เดือน (yyyy-mm)', 'ทีม', 'เซลส์', 'เป้า (ตัน)']);
  bot.ctx.setupSalesSheets();
  assert.strictEqual(bot.sheets.Targets.data[0][4], 'เป้า (ล้านบาท)');
});

// ---------- ฟอร์มหลัก: ยอดสะสมรายลูกค้า (PIC_New / Area_New ไม่มีวันที่) ----------
const MTD_HEAD = ['PIC', 'Area', 'PIC_New', 'Area_New', 'Sold_to_Party_id', 'Sold_to_Party', 'Group_OEM', 'Actual Volume ThisYY (Ton)'];
function mtdTable(extra) {
  return [MTD_HEAD,
    ['วุฒิชัย ขันทอง', 'TFM Fish3 East', 'วุฒิชัย ขันทอง', 'TFM Fish3 East', '10036886', 'ร้านบุญสว่าง (2006)', 'Fish', 224],
    ['วุฒิชัย ขันทอง', 'TFM Fish3 East', 'อัจฉราพรรณ เพ็งเกาะ', 'TFM Fish3 East', '10037893', 'คุณนรินทร์ นฤภัย', 'Fish', 63],
    ['ณรงค์วิทย์ ช่วยทอง', 'TFM Fish4 Central', 'ณรงค์วิทย์ ช่วยทอง', 'TFM Fish4 Central', '10037014', 'นลินรัตน์ฟาร์ม', 'Fish', 165.6],
    ['สุทัศน์ โมคภา', 'TFM Fish3 East', 'กลุ่มบัญชี ประโยชน์\u00a0\u00a0โสรัจจกิจ', 'TFM Fish3 East', '10036989', 'อานนท์ฟาร์ม', 'Fish', 20.46],
    ['ภัทราภรณ์ บัวโรย', 'TFM Fish1 North', 'ภัทราภรณ์ บัวโรย', 'TFM Fish1 North', '10036932', 'นครพันธ์ปลา', 'Fish', 55.2],
    ['สิทธิ สิงห์ทอง', 'TFM Shrimp1', 'สิทธิ สิงห์ทอง', 'TFM Shrimp1', '10036899', 'R.Y.Fishery', 'Fish', 0.14],
  ].concat(extra || [], [
    ['Total', '', '', '', '', '', '', 528.4],
    ['', '', '', '', '', '', '', ''],
    ['ตัวกรองที่ใช้:\nPlant เป็น TFM MHC\nMonthL ไม่เป็น January', '', '', '', '', '', '', ''],
  ]);
}

function mtdBot() {
  const bot = createBot({ now: D(2026, 11, 19, 9), props: { IMPORT_FOLDER_ID: 'x' } });
  bot.say('ลงทะเบียน');
  bot.ctx.setupSalesSheets();
  [['F1', 300], ['F3', 600], ['F4', 500]].forEach(([z, t]) => bot.sheets.Targets.data.push(['2026-11', z, '', t]));
  bot.driveFiles.push({ id: 'd18', name: 'data_18.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    table: mtdTable(), updated: D(2026, 11, 19, 8) });
  return bot;
}

test('ฟอร์มหลัก: แมปคอลัมน์ PIC_New / Area_New / Sold_to_Party และวันที่จากชื่อไฟล์', () => {
  const { ctx } = createBot();
  const m = ctx.mapColumns_(MTD_HEAD);
  assert.strictEqual(m.sales, 2);
  assert.strictEqual(m.team, 3);
  assert.strictEqual(m.custid, 4);
  assert.strictEqual(m.customer, 5);
  assert.strictEqual(m.ton, 7);
  assert.strictEqual(m.date, undefined);
  assert.strictEqual(ctx.normZone_('TFM Fish3 East'), 'F3');
  assert.strictEqual(ctx.normZone_('TFM Shrimp1'), 'อื่นๆ');
  assert.strictEqual(ctx.normZone_('F2'), 'F2');
  same(ctx.asOfFromFileName_('data_18.xlsx', D(2026, 11, 19, 8)), D(2026, 11, 18));
  same(ctx.asOfFromFileName_('data_30.xlsx', D(2026, 12, 1, 8)), D(2026, 11, 30));
  same(ctx.asOfFromFileName_('sales 2026-11-18.csv', D(2026, 11, 20)), D(2026, 11, 18));
  same(ctx.asOfFromFileName_('export.xlsx', D(2026, 11, 19, 8)), D(2026, 11, 18));
});

test('ฟอร์มหลัก: นำเข้ายอดสะสม ข้ามแถว Total/ตัวกรอง และสรุปรวม + แยกเขต', () => {
  const bot = mtdBot();
  const imp = bot.say('อัปเดตยอด');
  assert.match(imp, /นำเข้ายอดสะสม ณ พุธ 18 พ\.ย\. 2569\n5 แถว รวม 528\.26 ตัน/);
  assert.match(imp, /ไม่มีคอลัมน์มูลค่า/);
  const r = bot.say('ยอด');
  // ถึง 18 พ.ย. = 15 วันทำงาน (อาทิตย์ 1, 8, 15) จาก 25
  assert.match(r, /วันทำงาน 15\/25 วัน \(เหลือ 10\)/);
  assert.match(r, /ยอดรายวัน: จะเริ่มคำนวณเมื่อมีไฟล์ของวันถัดไป/);
  assert.match(r, /🏢 รวมทุกเขต[^\n]*\nตัน: 528\.26 \/ 1,400\.00 \(37\.7%\)\n   สปีด 35\.22 ตัน\/วัน → ปิดเดือน 880\.43 \(62\.9%\)/);
  assert.match(r, /📍 F3 🔴\nตัน: 307\.46 \/ 600\.00/);
  assert.doesNotMatch(r, /อื่นๆ|0\.14/);
  assert.doesNotMatch(r, /มูลค่า:/);
  assert.match(bot.say('ยอด อัจฉรา'), /👤 อัจฉราพรรณ เพ็งเกาะ \(F3\)[\s\S]*1\. คุณนรินทร์ นฤภัย — 63\.00 ตัน/);
  assert.match(bot.say('ยอด กลุ่มบัญชี'), /กลุ่มบัญชี ประโยชน์ โสรัจจกิจ/);
  assert.match(bot.say('ยอดเมื่อวาน'), /จะเริ่มคำนวณเมื่อมีไฟล์ของวันถัดไป/);
});

test('ฟอร์มหลัก: ไฟล์วันถัดไป → ยอดรายวัน = ผลต่างยอดสะสม', () => {
  const bot = mtdBot();
  bot.say('อัปเดตยอด');
  const t19 = mtdTable([['ณรงค์วิทย์ ช่วยทอง', 'TFM Fish4 Central', 'ณรงค์วิทย์ ช่วยทอง', 'TFM Fish4 Central', '10099999', 'ฟาร์มใหม่', 'Fish', 10]]);
  t19[1][7] = 254; // ร้านบุญสว่าง +30
  bot.setNow(D(2026, 11, 20, 9));
  bot.driveFiles.push({ id: 'd19', name: 'data_19.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    table: t19, updated: D(2026, 11, 20, 8) });
  assert.match(bot.say('อัปเดตยอด'), /ณ พฤหัสบดี 19 พ\.ย\. 2569/);
  const day = bot.say('ยอดเมื่อวาน');
  assert.match(day, /ยอดขายวันที่ พฤ\. 19 พ\.ย\.: 40\.00 ตัน/);
  assert.match(day, /• F3 30\.00 ตัน\n• F4 10\.00 ตัน/);
  assert.match(day, /1\. วุฒิชัย ขันทอง — 30\.00 ตัน/);
  const r = bot.say('ยอด');
  assert.match(r, /📅 วันล่าสุด 40\.00 ตัน/);
  assert.match(r, /วันทำงาน 16\/25/);
  assert.match(r, /ตัน: 568\.26 \/ 1,400\.00/);
  // นำเข้าไฟล์เดิมซ้ำโดยระบุวัน: ไม่เกิดยอดซ้ำ
  assert.match(bot.say('อัปเดตยอด 19/11'), /ณ พฤหัสบดี 19 พ\.ย\. 2569/);
  assert.match(bot.say('ยอด'), /ตัน: 568\.26 \/ 1,400\.00/);
  assert.strictEqual(bot.say('อัปเดตยอด พรุ่งนี้ครับ'), null);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' (มีที่ล้มเหลว)' : ''));
