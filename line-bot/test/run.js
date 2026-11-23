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

test('ตั้ง trigger: tick ทุก 5 นาที + นำเข้าไฟล์ทุกชั่วโมง (ไม่มีเตือนนัด/สรุปสัปดาห์)', () => {
  const bot = createBot({ props: { GROUP_ID: 'Cgroup1' } });
  bot.ctx.setupTriggers();
  bot.ctx.setupTriggers();
  assert.deepStrictEqual(bot.triggers.map((t) => t.fn).sort(), ['importSalesHourly', 'tick']);
  assert.ok(bot.sheets['แจ้งเตือน'], 'สร้างแท็บแจ้งเตือน');
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

test('ข้อความเช้า 7:30 จ.–ส.: นำเข้าไฟล์ใหม่ + ยอดรวมและรายเขต, ไม่มีนัด/งาน, ส่งวันละครั้ง, อาทิตย์ไม่ส่ง', () => {
  const bot = pbiBot(); // พ.ย. 20 (ศุกร์) 09:00, มีไฟล์ใหม่ในโฟลเดอร์
  bot.say('งาน+ ส่งใบเสนอราคา วันนี้');
  bot.say('นัด+ วันนี้ 10:00 ประชุมเช้า');
  bot.setNow(D(2026, 11, 20, 7, 25));
  bot.ctx.tick();
  assert.strictEqual(bot.pushes().length, 0, 'ก่อน 7:30 ยังไม่ส่ง');
  bot.setNow(D(2026, 11, 20, 7, 31));
  bot.ctx.tick();
  bot.setNow(D(2026, 11, 20, 7, 36));
  bot.ctx.tick();
  assert.strictEqual(bot.pushes().length, 1, 'ส่งครั้งเดียวต่อวัน');
  const text = bot.pushes()[0].body.messages[0].text;
  assert.match(text, /^☀️ สวัสดีตอนเช้าครับ — ศุกร์ 20 พ\.ย\. 2569\n\n📊 ยอดขายสะสม ถึง พฤหัสบดี 19 พ\.ย\. 2569/);
  assert.match(text, /🏢 รวมทุกเขต[\s\S]*📍 F4[\s\S]*📍 F5/);
  assert.doesNotMatch(text, /ประชุมเช้า|ใบเสนอราคา|นัด|งานค้าง/);
  bot.setNow(D(2026, 11, 22, 7, 31)); // อาทิตย์
  bot.ctx.tick();
  assert.strictEqual(bot.pushes().length, 1, 'วันอาทิตย์ไม่ส่ง');
  bot.setNow(D(2026, 11, 23, 7, 32)); // จันทร์
  bot.ctx.tick();
  assert.strictEqual(bot.pushes().length, 2);
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
  assert.match(bot.say('สรุปเช้า'), /สวัสดีตอนเช้า[\s\S]*📍 F4 🟢/);
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

test('พิมพ์ชื่อลูกค้า / F4 เฉย ๆ ก็ขึ้นยอด (ตัน + ล้านบาท) และไม่ตอบแชทปกติ', () => {
  const bot = mtdBot();
  bot.say('อัปเดตยอด');
  const t19 = mtdTable([['ณรงค์วิทย์ ช่วยทอง', 'TFM Fish4 Central', 'ณรงค์วิทย์ ช่วยทอง', 'TFM Fish4 Central', '10037015', 'กบทองฟาร์ม', 'Fish', 12]]);
  t19[3][7] = 175.6; // นลินรัตน์ฟาร์ม +10
  t19[0].push('Actual Value ThisYY');
  t19.slice(1).forEach((r) => { if (typeof r[7] === 'number') r.push(r[7] * 21000); });
  bot.setNow(D(2026, 11, 20, 9));
  bot.driveFiles.push({ id: 'd19', name: 'data_19.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    table: t19, updated: D(2026, 11, 20, 8) });
  bot.say('อัปเดตยอด');

  const c = bot.say('นลินรัตน์ฟาร์ม');
  assert.match(c, /👥 นลินรัตน์ฟาร์ม\n📍 F4 · 👤 ณรงค์วิทย์ ช่วยทอง/);
  assert.match(c, /วันทำงาน 16\/25/);
  assert.match(c, /ตัน: 175\.60\n   สปีด 10\.97 ตัน\/วัน → ปิดเดือน 274\.38/);
  assert.match(c, /มูลค่า: 3\.69 ล้านบาท/);
  assert.match(c, /📅 รายวันล่าสุด\n• พฤ\. 19 พ\.ย\. \+10\.00 ตัน$/m);
  assert.match(bot.say('กบทองฟาร์ม'), /👥 กบทองฟาร์ม[\s\S]*ตัน: 12\.00/);
  assert.match(bot.say('ยอด นลินรัตน์'), /👥 นลินรัตน์ฟาร์ม/);
  assert.match(bot.say('ยอด ฟาร์ม'), /พบลูกค้า 3 ราย/);
  assert.strictEqual(bot.say('ฟาร์ม'), null);
  assert.strictEqual(bot.say('ไปเยี่ยมฟาร์มกันไหม'), null);

  const z = bot.say('F4');
  assert.match(z, /📍 F4 🔴\nตัน: 187\.60 \/ 500\.00 \(37\.5%\)[\s\S]*มูลค่า: 3\.94 ล้านบาท\n   สปีด 0\.25 ล้านบาท\/วัน → ปิดเดือน 6\.16 ล้านบาท/);
  assert.doesNotMatch(z, /📍 F3/);
  assert.match(bot.say('f4'), /📍 F4/);
  assert.strictEqual(bot.say('F4 ไปไหน'), null);
});

// ---------- วันเกิดลูกค้า ----------
const BD_HEAD = ['เขต', 'รหัสลูกค้า', 'ชื่อลูกค้า', 'ชื่อเจ้าของ', 'วัน', 'เดือน', 'ปีเกิด (พ.ศ.)', 'วันเกิด', 'เบอร์โทร'];
function bdBot(now, extraProps) {
  const bot = createBot({ now: now || D(2026, 11, 23, 7), props: Object.assign({ GROUP_ID: 'Cgroup1', BRIEF_ENABLED: 'false' }, extraProps) });
  const sh = bot.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet('วันเกิด');
  [BD_HEAD,
    ['F5', '1', 'มาลี สิงห์สุวรรณ', 'มาลี สิงห์สุวรรณ', 23, 11, 2520, '23 พ.ย.', '081'],
    ['F2', '2', 'ฟาร์มภูเขียว', 'นายเฉลิมพล', 26, 11, '', '26 พ.ย.', ''],
    ['F5', '3', 'เมืองใหม่เจริญการเกษตร', 'เพ็ญศิริ โลหะวิจารณ์', 26, 11, '', '', ''],
    ['F1', '4', 'นครพันธ์ปลา', 'นายนคร เจริญพร', '', '', '', '3/ส.ค/2505', ''],
    ['F1', '5', 'นครพันธ์ปลา (ฉวางกร)', 'นายนคร เจริญพร', '', '', '', '3/ส.ค/2505', ''],
    ['F1', '6', 'จิดาภาฟาร์ม', 'จิดาภา ตุ้มทอง', 27, 11, '', '', ''],
    ['F2', '7', 'แจใจส่งเสริมการเกษตร', 'นายเมธี อำไพพิศ', 20, 11, '', '', ''],
    ['F3', '8', 'นายศราวุฒิ ตันเจริญ', 'Non Active', 24, 11, '', '', ''],
    ['F4', '9', 'ฟาร์มอธิกสุรทิน', 'คุณ ก', 29, 2, '', '', ''],
    ['F4', '10', 'ฟาร์มธันวา', 'คุณ ข', '', '', '', '1/12', ''],
  ].forEach((r) => sh.appendRow(r));
  return bot;
}

test('วันเกิด: แปลงรูปแบบวันที่หลายแบบ', () => {
  const { ctx } = createBot();
  const p = (v) => JSON.parse(JSON.stringify(ctx.parseBirthday_(v)));
  assert.deepStrictEqual(p('3/ส.ค/2505'), { day: 3, month: 8 });
  assert.deepStrictEqual(p('17/มิ.ย/2509'), { day: 17, month: 6 });
  assert.deepStrictEqual(p('24/10'), { day: 24, month: 10 });
  assert.deepStrictEqual(p('20/11/2508'), { day: 20, month: 11 });
  assert.deepStrictEqual(p(new Date(2534, 7, 21)), { day: 21, month: 8 });
  assert.strictEqual(ctx.parseBirthday_('-'), null);
  assert.strictEqual(ctx.parseBirthday_('หยุดซื้อขาย'), null);
  assert.strictEqual(ctx.parseBirthday_('31/11'), null);
  assert.strictEqual(ctx.fmtBirthdayDate_(D(2026, 11, 23)), 'วันจันทร์ที่ 23/11/69');
});

test('วันเกิด: แจ้งทุกเช้า 7 วันข้างหน้า เรียงตามวัน แยกเดือน (ไม่มียอดขาย)', () => {
  const bot = bdBot(D(2026, 11, 23, 7), { BIRTHDAY_SHEET_ID: 'sheet', BIRTHDAY_DAYS_AHEAD: '9' });
  bot.ctx.morningBrief();
  const msgs = bot.pushes()[0].body.messages;
  assert.strictEqual(msgs.length, 1, 'ปิดสรุปเช้าไว้ ต้องเหลือแค่วันเกิด');
  const t = msgs[0].text;
  assert.match(t, /^🎂 วันเกิดลูกค้า 9 วันข้างหน้า \(5 ราย\)\n\n━━ เดือน พ\.ย\. ━━\n\n🎂 1\. มาลี สิงห์สุวรรณ \[F5\]\nชื่อ มาลี สิงห์สุวรรณ\nวันเกิด วันจันทร์ที่ 23\/11\/69 🎉 วันนี้!\n\n2\. /);
  assert.match(t, /\d\. ฟาร์มภูเขียว \[F2\]\nชื่อ นายเฉลิมพล\nวันเกิด วันพฤหัสบดีที่ 26\/11\/69 \(อีก 3 วัน\)/);
  assert.match(t, /จิดาภาฟาร์ม \[F1\]\nชื่อ จิดาภา ตุ้มทอง\nวันเกิด วันศุกร์ที่ 27\/11\/69/);
  assert.match(t, /\n\n━━ เดือน ธ\.ค\. ━━\n\n5\. ฟาร์มธันวา \[F4\]\nชื่อ คุณ ข\nวันเกิด วันอังคารที่ 01\/12\/69/);
  assert.doesNotMatch(t, /แจใจ|Non Active|ยอด|ตัน|ลูกค้าราย/);
  assert.ok(t.indexOf('ฟาร์มภูเขียว') < t.indexOf('จิดาภาฟาร์ม'));
});

test('วันเกิด: ส่งพร้อมข้อความเช้าในครั้งเดียว / อาทิตย์ไม่ส่ง / ไม่มีใครเกิดก็ไม่มีบับเบิลวันเกิด', () => {
  const sun = bdBot(D(2026, 11, 22, 7, 31), { BIRTHDAY_SHEET_ID: 'sheet', BRIEF_ENABLED: 'true' });
  sun.ctx.tick();
  assert.strictEqual(sun.pushes().length, 0);

  const mon = bdBot(D(2026, 11, 23, 7, 31), { BIRTHDAY_SHEET_ID: 'sheet', BRIEF_ENABLED: 'true', DASHBOARD_URL: 'x' });
  mon.setDashboard(dashboard);
  mon.ctx.tick();
  assert.strictEqual(mon.pushes().length, 1);
  const m = mon.pushes()[0].body.messages;
  assert.strictEqual(m.length, 2);
  assert.match(m[0].text, /สวัสดีตอนเช้า/);
  assert.match(m[1].text, /^🎂 วันเกิดลูกค้า/);

  const quiet = bdBot(D(2026, 4, 1, 9), { BIRTHDAY_SHEET_ID: 'sheet' });
  assert.strictEqual(quiet.ctx.buildMorningMessages_(D(2026, 4, 1, 9)).length, 0);
  const off = bdBot(D(2026, 11, 23, 9), { BIRTHDAY_SHEET_ID: 'sheet', BIRTHDAY_ENABLED: 'false' });
  assert.strictEqual(off.ctx.buildMorningMessages_(D(2026, 11, 23, 9)).length, 0);
});

test('วันเกิด: คำสั่ง วันเกิด / วันเกิด ส.ค. รวมลูกค้าเจ้าของเดียวกัน, 29 ก.พ.', () => {
  const bot = bdBot(D(2026, 11, 23, 9), { BIRTHDAY_SHEET_ID: 'sheet' });
  assert.match(bot.say('วันเกิด'), /30 วันข้างหน้า \(5 ราย\)/);
  const aug = bot.say('วันเกิด ส.ค.');
  assert.match(aug, /เดือน ส\.ค\. \(1 ราย\)\n\n━━ เดือน ส\.ค\. ━━\n\n1\. นครพันธ์ปลา, นครพันธ์ปลา \(ฉวางกร\) \[F1\]\nชื่อ นายนคร เจริญพร\nวันเกิด วันอังคารที่ 03\/08\/70/);
  assert.match(bot.say('วันเกิด 2'), /ฟาร์มอธิกสุรทิน \[F4\]\nชื่อ คุณ ก\nวันเกิด วันอาทิตย์ที่ 28\/02\/70/);
  assert.match(bot.say('วันเกิด เดือนนี้'), /แจใจส่งเสริมการเกษตร \[F2\]\nชื่อ นายเมธี อำไพพิศ\nวันเกิด [^\n]*\(ผ่านมาแล้ว\)/);
  assert.strictEqual(bot.say('วันเกิด ใครครับ'), null);
});

// ---------- รายงานเอง + AI ----------
test('มีไฟล์ใหม่ → บอทส่งรายงานเข้ากลุ่มเอง (ครั้งเดียวต่อไฟล์) และทุกเขตมีสปีดที่ต้องทำ', () => {
  const bot = mtdBot();
  bot.ctx.importSalesHourly();
  assert.strictEqual(bot.pushes().length, 0, 'ค่าเริ่มต้นไม่ส่งเข้ากลุ่มหลักเอง');
  bot.props.AUTO_REPORT = 'true';
  bot.props.LAST_IMPORT_KEY = '';
  bot.ctx.importSalesHourly();
  assert.strictEqual(bot.pushes().length, 1);
  const t = bot.pushes()[0].body.messages[0].text;
  assert.match(t, /🏢 รวมทุกเขต/);
  assert.match(t, /📍 F1[\s\S]*ต้องทำ [\d.,]+ ตัน\/วัน/);
  assert.match(t, /📍 F3[\s\S]*ต้องทำ [\d.,]+ ตัน\/วัน/);
  assert.strictEqual(bot.pushes()[0].body.messages.length, 1, 'ไม่มีคีย์ AI ต้องไม่มีบทวิเคราะห์');
  bot.ctx.importSalesHourly();
  assert.strictEqual(bot.pushes().length, 1, 'ไฟล์เดิมไม่ส่งซ้ำ');
  bot.props.AUTO_REPORT = 'false';
  bot.driveFiles.push({ id: 'd19', name: 'data_19.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    table: mtdTable(), updated: D(2026, 11, 19, 9) });
  bot.ctx.importSalesHourly();
  assert.strictEqual(bot.pushes().length, 1, 'ปิด AUTO_REPORT แล้วต้องไม่ส่ง');
});

test('AI: ใส่คีย์แล้วรายงานมีบทวิเคราะห์ / cache / ไม่ส่งชื่อลูกค้า / refusal ข้ามไป', () => {
  const bot = mtdBot();
  bot.props.ANTHROPIC_API_KEY = 'sk-test';
  bot.setAiResponse({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: '• F3 ต้องเร่งอีก 20 ตัน/วัน' }] } });
  const imp = bot.say('อัปเดตยอด');
  assert.match(imp, /นำเข้ายอดสะสม[\s\S]*🏢 รวมทุกเขต[\s\S]*🤖 วิเคราะห์โดย AI\n• F3 ต้องเร่งอีก 20 ตัน\/วัน/);
  assert.strictEqual(bot.aiCalls.length, 1);
  const call = bot.aiCalls[0];
  assert.strictEqual(call.body.model, 'claude-opus-5-5');
  assert.strictEqual(call.body.fallbacks, 'default');
  assert.strictEqual(call.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.strictEqual(call.headers['x-api-key'], 'sk-test');
  const sent = JSON.stringify(call.body);
  assert.match(sent, /F3/);
  assert.doesNotMatch(sent, /ร้านบุญสว่าง|วุฒิชัย/);
  assert.match(bot.say('ยอด'), /🤖 วิเคราะห์โดย AI/);
  assert.match(bot.say('วิเคราะห์'), /^🤖 วิเคราะห์โดย AI/);
  assert.strictEqual(bot.aiCalls.length, 1, 'ข้อมูลชุดเดิมใช้ cache ไม่เรียก AI ซ้ำ');

  const r2 = mtdBot();
  r2.props.ANTHROPIC_API_KEY = 'sk-test';
  r2.setAiResponse({ body: { stop_reason: 'refusal', content: [] } });
  r2.say('อัปเดตยอด');
  assert.doesNotMatch(r2.say('ยอด'), /🤖/);
  r2.setAiResponse({ status: 500, body: { error: 'x' } });
  assert.match(r2.say('วิเคราะห์'), /AI วิเคราะห์ไม่สำเร็จ/);
});

test('AI: ไม่มีคีย์ → คำสั่งวิเคราะห์บอกวิธีเปิด และไม่เรียก API', () => {
  const bot = mtdBot();
  bot.say('อัปเดตยอด');
  assert.match(bot.say('วิเคราะห์'), /ANTHROPIC_API_KEY/);
  assert.strictEqual(bot.aiCalls.length, 0);
});

// ---------- ไฟล์รายเขต (Actual/Budget/Challenge/ปีก่อน ฿ + Ton) ----------
const ZONE_HEAD = ['Area', 'PIC', 'Actual 26 (฿)', 'Budget 26 (฿)', 'Challenge 26 (฿)', 'Actual 25 (฿)', 'Budget VS ACT.',
  'Actual 26 (Ton)', 'Budget 26 (Ton)', 'Challenge 26 (Ton)', 'Actual 25 (Ton)', 'Budget VS ACT'];
function zoneTable(f5ton, f5amt) {
  return [ZONE_HEAD,
    ['TFM Fish1 North', 'Total', 3641289.61, 10901712.36, 11991883.59, 4855749.98, 0.33, 114.14, 369.3, 406.23, 155.1, 0.31],
    ['TFM Fish5 South', 'Total', f5amt, 15638458.92, 17202304.81, 16756127.43, 0.87, f5ton, 500, 550, 521.32, 0.78],
    ['Total', '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [],
    ['ตัวกรองที่ใช้:\nGroup_OEM เป็น Fish'],
  ];
}
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('ไฟล์รายเขต: ตัน + ล้านบาท, เป้าจากไฟล์, Challenge, ปีก่อน', () => {
  const { ctx } = createBot();
  const m = ctx.detectMetricColumns_(ZONE_HEAD);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m)),
    { ton: 7, amount: 2, budgetTon: 8, budgetAmt: 3, challengeTon: 9, challengeAmt: 4, lastTon: 10, lastAmt: 5 });

  const bot = createBot({ now: D(2026, 11, 24, 9), props: { IMPORT_FOLDER_ID: 'x' } });
  bot.ctx.setupSalesSheets();
  bot.driveFiles.push({ id: 'z24', name: 'data_24.xlsx', mime: XLSX, table: zoneTable(390.18, 13582442.39), updated: D(2026, 11, 24, 8) });
  const imp = bot.say('อัปเดตยอด');
  assert.match(imp, /ณ อังคาร 24 พ\.ย\. 2569\n2 แถว รวม 504\.32 ตัน/);
  assert.match(imp, /ไฟล์รายเขต: ใช้เป้า \(Budget\) จากไฟล์/);
  assert.doesNotMatch(imp, /ไม่มีคอลัมน์: ลูกค้า/);
  const r = bot.say('ยอด');
  assert.match(r, /วันทำงาน 20\/25 วัน \(เหลือ 5\)/);
  assert.match(r, /🏢 รวมทุกเขต[^\n]*\nตัน: 504\.32 \/ 869\.30/);
  assert.match(r, /มูลค่า: 17\.22 \/ 26\.54 ล้านบาท/);
  assert.match(r, /🎯 Challenge: 956\.23 ตัน → คาดปิด [\d.]+% · 29\.19 ล้านบาท → คาดปิด [\d.]+%/);
  assert.match(r, /📍 F5 🟡\nตัน: 390\.18 \/ 500\.00 \(78\.0%\)\n   สปีด 19\.51 ตัน\/วัน → ปิดเดือน 487\.73 \(97\.5%\)/);
  const f5 = bot.say('F5');
  assert.match(f5, /มูลค่า: 13\.58 \/ 15\.64 ล้านบาท \(86\.9%\)\n   สปีด 0\.68 ล้านบาท\/วัน → ปิดเดือน 16\.98 ล้านบาท \(108\.6%\)/);
  assert.match(f5, /🎯 Challenge: 550\.00 ตัน → คาดปิด 88\.7% · 17\.20 ล้านบาท → คาดปิด 98\.7%\n📅 ปีก่อน: 521\.32 ตัน · 16\.76 ล้านบาท/);
  // แท็บ Targets ที่กรอกเองมีผลเหนือเป้าในไฟล์
  bot.sheets.Targets.data.push(['2026-11', 'F5', '', 400, 14]);
  assert.match(bot.say('F5'), /ตัน: 390\.18 \/ 400\.00/);
});

test('ไฟล์รายเขตวันถัดไป → ยอดรายวันต่อเขต (ทั้งตันและบาท); ไฟล์ห่างหลายวันบอกช่วงวัน', () => {
  const bot = createBot({ now: D(2026, 11, 24, 9), props: { IMPORT_FOLDER_ID: 'x' } });
  bot.ctx.setupSalesSheets();
  bot.driveFiles.push({ id: 'z20', name: 'data_20.xlsx', mime: XLSX, table: zoneTable(300, 10000000), updated: D(2026, 11, 21, 8) });
  bot.say('อัปเดตยอด');
  bot.driveFiles.push({ id: 'z24', name: 'data_24.xlsx', mime: XLSX, table: zoneTable(390.18, 13582442.39), updated: D(2026, 11, 24, 8) });
  bot.say('อัปเดตยอด');
  const d = bot.say('ยอดเมื่อวาน');
  assert.match(d, /📅 ยอด 21–24 พ\.ย\.: 90\.18 ตัน · 3\.58 ล้านบาท/);
  assert.match(d, /• F5 90\.18 ตัน · 3\.58 ล้านบาท/);
  assert.doesNotMatch(d, /F1/);
});

test('ไฟล์รายลูกค้าแล้วตามด้วยไฟล์รายเขต: ยอดเขตถูก, ลูกค้าบอกวันที่ข้อมูลเดิม', () => {
  const bot = mtdBot(); // data_18 รายลูกค้า (F1 55.2, F3 307.46, F4 165.6)
  bot.say('อัปเดตยอด');
  bot.setNow(D(2026, 11, 24, 9));
  bot.driveFiles.push({ id: 'z24', name: 'data_24.xlsx', mime: XLSX, table: zoneTable(390.18, 13582442.39), updated: D(2026, 11, 24, 8) });
  bot.say('อัปเดตยอด');
  const d = bot.say('ยอดเมื่อวาน');
  assert.match(d, /📅 ยอด 19–24 พ\.ย\./);
  assert.match(d, /• F1 58\.94 ตัน/); // 114.14 − 55.2
  assert.match(d, /• F5 390\.18 ตัน/);
  assert.match(bot.say('ยอด'), /ตัน: 504\.32/);
  const c = bot.say('นลินรัตน์ฟาร์ม');
  assert.match(c, /สะสมถึง พ\. 18 พ\.ย\. · วันทำงาน 15\/25/);
  assert.doesNotMatch(c, /มูลค่า|คิดเป็น/);
});

test('ส่งไฟล์ Excel เข้ากลุ่ม → บอทนำเข้าและรายงานทันที / ไฟล์อื่นเงียบ', () => {
  const bot = createBot({ now: D(2026, 11, 24, 9), props: { IMPORT_FOLDER_ID: 'x', GROUP_ID: 'Cgroup1' } });
  bot.ctx.setupSalesSheets();
  const r = bot.sendFile('data_24.xlsx', zoneTable(390.18, 13582442.39));
  assert.match(r, /นำเข้ายอดสะสม ณ อังคาร 24 พ\.ย\. 2569[\s\S]*🏢 รวมทุกเขต[\s\S]*📍 F5/);
  assert.strictEqual(bot.driveFiles.filter((f) => !f.trashed).length, 1, 'เก็บไฟล์ไว้ใน Drive');
  bot.ctx.importSalesHourly();
  assert.strictEqual(bot.pushes().length, 0, 'ไฟล์ที่ส่งในแชทแล้วต้องไม่รายงานซ้ำทุกชั่วโมง');

  assert.strictEqual(bot.sendFile('รายชื่อ.xlsx', [['ชื่อ', 'เบอร์'], ['ก', '1']]), null);
  assert.strictEqual(bot.driveFiles.filter((f) => !f.trashed).length, 1, 'ไฟล์ที่ไม่ใช่ยอดขายถูกลบทิ้ง');
  assert.strictEqual(bot.sendFile('รูป.pdf', []), null);
  assert.strictEqual(bot.sendFile('data_24.xlsx', zoneTable(1, 1), { groupId: 'Cother' }), null);
});

// ---------- กลุ่มอัปโหลด + แจ้งเตือนตามวัน ----------
test('กลุ่มอัปโหลด: ส่งไฟล์ในกลุ่มเล็ก → กลุ่มใหญ่พิมพ์ยอดขายได้ข้อมูลใหม่, ไม่ push เข้ากลุ่มใหญ่', () => {
  const bot = createBot({ now: D(2026, 11, 24, 9), props: { IMPORT_FOLDER_ID: 'x', GROUP_ID: 'Cgroup1' } });
  bot.ctx.setupSalesSheets();
  assert.match(bot.say('กลุ่มอัปโหลด', { groupId: 'Cgroup1' }), /เป็นกลุ่มหลักอยู่แล้ว/);
  assert.match(bot.say('กลุ่มอัปโหลด', { groupId: 'Cmine' }), /ตั้งกลุ่มนี้เป็นกลุ่มอัปโหลดแล้ว/);
  assert.strictEqual(bot.props.UPLOAD_GROUP_ID, 'Cmine');
  const r = bot.sendFile('data_24.xlsx', zoneTable(390.18, 13582442.39), { groupId: 'Cmine' });
  assert.match(r, /นำเข้ายอดสะสม ณ อังคาร 24/);
  assert.strictEqual(bot.pushes().length, 0);
  bot.ctx.importSalesHourly();
  assert.strictEqual(bot.pushes().length, 0);
  assert.match(bot.say('ยอดขาย'), /ตัน: 504\.32/);
  assert.match(bot.say('ยอดขาย', { groupId: 'Cmine' }), /ตัน: 504\.32/);
  assert.strictEqual(bot.say('ยอดขาย', { groupId: 'Cstranger' }), null);
  assert.strictEqual(bot.sendFile('data_24.xlsx', zoneTable(1, 1), { groupId: 'Cstranger' }), null);
});

test('แจ้งเตือนตามวัน: เสาร์ 16:00 ทุกสัปดาห์, ศุกร์เว้นศุกร์ 7:00 เริ่ม 4/12/69', () => {
  const bot = createBot({ now: D(2026, 11, 28, 15, 0), props: { GROUP_ID: 'Cgroup1', BRIEF_ENABLED: 'false', BIRTHDAY_ENABLED: 'false' } });
  bot.ctx.setupReminders();
  const sh = bot.sheets['แจ้งเตือน'];
  sh.data[2][2] = 'อย่าลืมส่งรายงานเยี่ยมลูกค้า 2 สัปดาห์ครับ';
  const at = (d, h, m) => { bot.setNow(D(2026, d[0], d[1], h, m)); bot.ctx.tick(); return bot.pushes().map((p) => p.body.messages[0].text); };
  assert.deepStrictEqual(at([11, 28], 15, 55), []);
  assert.deepStrictEqual(at([11, 28], 16, 3), ['รบกวนทุกคนส่งแผนการทำงานในสัปดาห์หน้าด้วยครับ']);
  assert.strictEqual(at([11, 28], 16, 8).length, 1, 'ไม่ส่งซ้ำวันเดียวกัน');
  assert.strictEqual(at([11, 28], 17, 30).length, 1);
  assert.strictEqual(at([11, 29], 16, 3).length, 1, 'อาทิตย์ไม่ส่ง');
  assert.strictEqual(at([11, 27], 7, 2).length, 1, 'ศุกร์ 27/11 ก่อนวันเริ่ม');
  assert.strictEqual(at([12, 4], 7, 2).length, 2, 'ศุกร์ 4/12 ส่ง');
  assert.strictEqual(at([12, 11], 7, 2).length, 2, 'ศุกร์ 11/12 เว้น');
  assert.strictEqual(at([12, 18], 7, 2).length, 3, 'ศุกร์ 18/12 ส่ง');
  assert.match(bot.pushes()[2].body.messages[0].text, /รายงานเยี่ยมลูกค้า/);
  assert.match(sh.data[2][6], /^ส่งแล้ว/);
});

test('แจ้งเตือน: ข้อความยังไม่กรอกไม่ส่ง, ปิดได้, วันแบบช่วง จ-ส', () => {
  const { ctx } = createBot();
  assert.deepStrictEqual(Array.from(ctx.parseReminderDays_('จ-ส')), [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(Array.from(ctx.parseReminderDays_('จ,พ,ศ')), [1, 3, 5]);
  assert.deepStrictEqual(Array.from(ctx.parseReminderDays_('ทุกวัน')), [0, 1, 2, 3, 4, 5, 6]);
  const bot = createBot({ now: D(2026, 12, 4, 7, 2), props: { GROUP_ID: 'Cgroup1', BRIEF_ENABLED: 'false', BIRTHDAY_ENABLED: 'false' } });
  bot.ctx.setupReminders();
  bot.ctx.tick();
  assert.strictEqual(bot.pushes().length, 0, 'ข้อความศุกร์ยังเป็นตัวอย่าง ไม่ส่ง');
  bot.sheets['แจ้งเตือน'].data.push(['จ-ส', '07:00', 'ทดสอบ', 1, '', false, '']);
  bot.ctx.tick();
  assert.strictEqual(bot.pushes().length, 0, 'ใช้งาน = FALSE ไม่ส่ง');
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ' (มีที่ล้มเหลว)' : ''));
