/** สรุปยอดขายจาก dashboard.json (ไฟล์เดียวกับหน้า Sales Command Center) */

function fetchDashboard_() {
  const url = prop_('DASHBOARD_URL', CONFIG.DASHBOARD_URL);
  const res = UrlFetchApp.fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + now_().getTime(),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('โหลด dashboard.json ไม่ได้ (' + res.getResponseCode() + ')');
  return JSON.parse(res.getContentText());
}

function pct_(a, b) {
  return b ? (a / b) * 100 : null;
}

function teamLine_(label, t) {
  if (!t) return null;
  return '🐟 ' + label + ': ' + fmtNum_(t.actualTon) + ' / ' + fmtNum_(t.budgetTon) + ' ตัน (' +
    fmtNum_(t.achievement) + '%)';
}

/** scope: '' | 'fish4' | 'fish5' */
function formatSales_(d, scope) {
  const total = d.total || {};
  const passed = Number(d.workingDaysPassed) || 0;
  const all = Number(d.workingDaysTotal) || 0;
  const timeGone = pct_(passed, all);
  const lines = ['📊 สรุปยอดขาย Fish — ข้อมูล ณ ' + (d.date || '-')];
  if (all) lines.push('วันทำงาน ' + passed + '/' + all + ' (Time gone ' + fmtNum_(timeGone, 0) + '%)');
  lines.push('━━━━━━━━━━');

  if (scope === 'fish4' || scope === 'fish5') {
    const t = d[scope];
    if (!t) return 'ไม่พบข้อมูล ' + scope + ' ใน dashboard.json';
    lines.push(teamLine_(scope === 'fish4' ? 'Fish 4' : 'Fish 5', t));
    if (timeGone !== null) lines.push(gapVsTimeLine_(t.achievement, timeGone));
    const remainDays = all - passed;
    if (remainDays > 0) {
      lines.push('🎯 ต้องทำอีก ' + fmtNum_(t.budgetTon - t.actualTon) + ' ตัน ≈ ' +
        fmtNum_((t.budgetTon - t.actualTon) / remainDays) + ' ตัน/วัน');
    }
  } else {
    lines.push('รวม: ' + fmtNum_(total.actualTon) + ' / ' + fmtNum_(total.budgetTon) + ' ตัน (' +
      fmtNum_(total.achievement) + '%)');
    if (timeGone !== null && total.achievement !== undefined) lines.push(gapVsTimeLine_(total.achievement, timeGone));
    if (total.forecastTon !== undefined) {
      lines.push('🔮 คาดการณ์สิ้นเดือน ' + fmtNum_(total.forecastTon) + ' ตัน (' +
        fmtNum_(pct_(total.forecastTon, total.budgetTon), 1) + '%)' +
        (total.gapTon !== undefined ? ' | Gap ' + fmtNum_(total.gapTon) : ''));
    }
    if (total.currentSpeed !== undefined && total.requiredSpeed !== undefined) {
      const diff = total.currentSpeed - total.requiredSpeed;
      lines.push('🚀 สปีด ' + fmtNum_(total.currentSpeed) + ' ตัน/วัน | ต้องการ ' + fmtNum_(total.requiredSpeed));
      lines.push(diff >= 0 ? '✅ เร็วกว่าเป้า +' + fmtNum_(diff) + ' ตัน/วัน'
        : '⚠️ ต้องเร่งอีก ' + fmtNum_(-diff) + ' ตัน/วัน');
    }
    lines.push('━━━━━━━━━━');
    [teamLine_('Fish 4', d.fish4), teamLine_('Fish 5', d.fish5)].forEach(function (l) { if (l) lines.push(l); });
    if (d.status) {
      lines.push('สถานะ: ' + Object.keys(d.status).map(function (k) { return k + ' ' + d.status[k]; }).join(' · '));
    }
    appendBullets_(lines, '💡 โอกาส', d.opportunity);
    appendBullets_(lines, '👀 ต้องระวัง', d.watchout);
    appendBullets_(lines, '📝 สรุป', d.summary);
  }
  lines.push('🔗 ' + CONFIG.DASHBOARD_PAGE);
  return lines.join('\n');
}

function gapVsTimeLine_(achievement, timeGone) {
  const gap = achievement - timeGone;
  return (gap >= 0 ? '🟢 นำ Time gone +' : '🔴 ตาม Time gone ') + fmtNum_(gap, 1) + ' pts';
}

function appendBullets_(lines, title, list) {
  if (!Array.isArray(list) || !list.length) return;
  lines.push(title);
  list.slice(0, 5).forEach(function (x) { lines.push('• ' + x); });
}

/** บรรทัดสั้นสำหรับสรุปเช้า/สรุปสัปดาห์ */
function formatSalesShort_(d) {
  const t = d.total || {};
  const parts = ['📊 ยอด ' + fmtNum_(t.actualTon) + '/' + fmtNum_(t.budgetTon) + ' ตัน (' + fmtNum_(t.achievement) + '%)'];
  if (t.forecastTon !== undefined) parts.push('คาดการณ์ ' + fmtNum_(t.forecastTon));
  if (t.currentSpeed !== undefined && t.requiredSpeed !== undefined) {
    const diff = t.currentSpeed - t.requiredSpeed;
    parts.push(diff >= 0 ? 'สปีดผ่านเป้า ✅' : 'ต้องเร่ง +' + fmtNum_(-diff) + ' ตัน/วัน ⚠️');
  }
  return parts.join(' | ') + ' (ข้อมูล ' + (d.date || '-') + ')';
}

function safeSalesShort_() {
  try { return formatSalesShort_(fetchDashboard_()); } catch (e) {
    console.error(e);
    return '📊 ยอด: โหลดข้อมูลไม่ได้';
  }
}
