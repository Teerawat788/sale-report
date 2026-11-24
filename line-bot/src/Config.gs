/**
 * การตั้งค่าบอท — ค่าที่เป็นความลับ/เปลี่ยนบ่อยเก็บใน Script Properties
 * (Project Settings > Script Properties) ดูรายละเอียดใน README.md
 *
 *  LINE_CHANNEL_ACCESS_TOKEN  (จำเป็น) token ของ Messaging API channel
 *  BOT_USER_ID                (แนะนำ)  Bot user ID (Uxxxx) ใช้กรอง webhook ปลอม
 *  GROUP_ID                   ตั้งให้อัตโนมัติเมื่อพิมพ์ "ลงทะเบียน" ในกลุ่ม
 *  SHEET_ID                   ว่างได้ถ้าสคริปต์ผูกกับ Google Sheet
 *  CALENDAR_ID                ว่าง = ปฏิทินหลักของเจ้าของสคริปต์
 *  DASHBOARD_URL              URL ของ dashboard.json
 *  MORNING_HOUR               ชั่วโมงส่งสรุปเช้า (ค่าเริ่มต้น 7)
 *  WORK_DAYS                  วันทำงาน 0=อา..6=ส (ค่าเริ่มต้น 1,2,3,4,5,6)
 *  BRIEF_ENABLED / REVIEW_ENABLED / REMINDER_ENABLED  true|false
 *  REMIND_BEFORE_MIN          เตือนก่อนนัดกี่นาที (ค่าเริ่มต้น 30)
 *  BIRTHDAY_SHEET_ID          Google Sheet วันเกิดลูกค้า (แจ้งทุกเช้า)
 *  BIRTHDAY_DAYS_AHEAD        แจ้งล่วงหน้ากี่วัน (ค่าเริ่มต้น 7) / BIRTHDAY_ENABLED true|false
 *  MORNING_TIME / MORNING_DAYS ข้อความเช้า (ค่าเริ่มต้น 07:30 / 1,2,3,4,5,6 = จ.–ส.)
 *  UPLOAD_GROUP_ID            กลุ่มสำหรับส่งไฟล์ยอด (ตั้งด้วยคำสั่ง "กลุ่มอัปโหลด")
 *  AUTO_REPORT                true = มีไฟล์ใหม่ในโฟลเดอร์ Drive แล้วส่งรายงานเข้ากลุ่มหลักทันที (ค่าเริ่มต้น false)
 *  LEGACY_COMMANDS            (ไม่บังคับ) true = เปิดคำสั่งงาน/นัด/งานประจำแบบเดิม (ค่าเริ่มต้นปิด กันคำทั่วไปทำให้บอทตอบ)
 *  LOCK_GROUPS                (ไม่บังคับ) true = ตอบเฉพาะกลุ่มหลัก + ห้องสั่งการ (ค่าเริ่มต้น: ทุกกลุ่มที่มีบอทใช้คำสั่งทีมได้)
 *  GEMINI_API_KEY             (ไม่บังคับ) เปิด AI ด้วย Google Gemini (aistudio.google.com) / GEMINI_MODEL
 *  ANTHROPIC_API_KEY          (ไม่บังคับ) เปิด AI ด้วย Claude / AI_PROVIDER = gemini | claude
 *  FILE_DATE_LAG_DAYS         วันที่ข้อมูล = วันที่ส่งไฟล์ − N วัน (ค่าเริ่มต้น 1 = ยอดถึงเมื่อวาน)
 *  IMPORT_FOLDER_ID           โฟลเดอร์ Google Drive ที่วางไฟล์ export จาก Power BI
 *  HOLIDAYS                   วันหยุดที่ไม่นับเป็นวันทำงาน เช่น 5/12,10/12,31/12
 *  DATE_ORDER                 DMY (ค่าเริ่มต้น) หรือ MDY ถ้าเดาจากไฟล์ไม่ได้
 */
const CONFIG = {
  DASHBOARD_URL: 'https://raw.githubusercontent.com/teerawat788/sale-report/main/dashboard.json',
  DASHBOARD_PAGE: 'https://teerawat788.github.io/sale-report/',
  EVENT_DEFAULT_MINUTES: 60,
  REMIND_BEFORE_MIN: 30,
  MORNING_HOUR: 7,
  REVIEW_DAY: 5,      // ศุกร์
  REVIEW_HOUR: 16,
  WORK_DAYS: '1,2,3,4,5,6',
};

function prop_(key, def) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === undefined || v === '' ? def : v;
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

function flag_(key, def) {
  return String(prop_(key, def === undefined ? 'true' : String(def))).toLowerCase() === 'true';
}

/** แยกไว้เป็นฟังก์ชันเพื่อให้ทดสอบโดยกำหนดเวลาได้ */
function now_() {
  return new Date();
}
