// รวมไฟล์ src/*.gs เป็นไฟล์เดียว dist/Code.gs สำหรับคัดลอกไปวางใน Apps Script ครั้งเดียว
const fs = require('fs');
const path = require('path');
const ORDER = ['Config', 'Util', 'Parser', 'Line', 'Store', 'Tasks', 'Weekly', 'Calendar', 'Sales', 'SalesData', 'Ai', 'Birthdays', 'Reminders', 'Visits', 'Schedule', 'Main'];
const out = ['// ===== บอท LINE ผู้ช่วยทีมขาย — สร้างจาก line-bot/src ด้วย `npm run build` (อย่าแก้ไฟล์นี้โดยตรง) =====\n']
  .concat(ORDER.map((f) => '// ---------- ' + f + '.gs ----------\n' + fs.readFileSync(path.join(__dirname, 'src', f + '.gs'), 'utf8')));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'Code.gs'), out.join('\n'));
console.log('wrote dist/Code.gs');
