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

/** ข้อมูลยอด: ใช้แท็บ SalesData (จาก Power BI) ถ้ามี ไม่งั้นใช้ dashboard.json */
function getSalesSnapshot_() {
  const rows = readSalesRows_();
  const snap = rows.length ? buildSalesSnapshot_(rows, now_()) : null;
  return snap || fetchDashboard_();
}

function normName_(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

function teamsOf_(d) {
  if (Array.isArray(d.teams)) return d.teams;
  const t = [];
  if (d.fish4) t.push(Object.assign({ name: 'Fish 4' }, d.fish4));
  if (d.fish5) t.push(Object.assign({ name: 'Fish 5' }, d.fish5));
  return t;
}

/** "fish4", "f4", "Fish 4" → ทีม */
function findTeam_(d, q) {
  let n = normName_(q);
  if (/^f\d+$/.test(n)) n = 'fish' + n.slice(1);
  return teamsOf_(d).find(function (t) { return normName_(t.name) === n; }) || null;
}

function teamLine_(t) {
  return '🐟 ' + t.name + ': ' + fmtNum_(t.actualTon) +
    (t.budgetTon ? ' / ' + fmtNum_(t.budgetTon) + ' ตัน (' + fmtNum_(t.achievement) + '%)' : ' ตัน');
}

/** team: null = ภาพรวม หรือ object ทีมจาก findTeam_ */
function formatSales_(d, team) {
  const total = d.total || {};
  const passed = Number(d.workingDaysPassed) || 0;
  const all = Number(d.workingDaysTotal) || 0;
  const timeGone = pct_(passed, all);
  const lines = ['📊 สรุปยอดขาย Fish — ข้อมูล ณ ' + (d.date || '-')];
  if (all) lines.push('วันทำงาน ' + passed + '/' + all + ' (Time gone ' + fmtNum_(timeGone, 0) + '%)');
  lines.push('━━━━━━━━━━');

  if (team) {
    lines.push(teamLine_(team));
    if (timeGone !== null && team.budgetTon) lines.push(gapVsTimeLine_(team.achievement, timeGone));
    const remainDays = all - passed;
    if (team.budgetTon && remainDays > 0) {
      lines.push('🎯 ต้องทำอีก ' + fmtNum_(team.budgetTon - team.actualTon) + ' ตัน ≈ ' +
        fmtNum_((team.budgetTon - team.actualTon) / remainDays) + ' ตัน/วัน');
    }
    if (d.salesList) {
      const members = d.salesList.filter(function (s) { return s.team === team.name; });
      if (members.length) {
        lines.push('');
        members.forEach(function (s, i) {
          lines.push((i + 1) + '. ' + s.name + ' — ' + tonVsTarget_(s.actualTon, s.budgetTon, s.achievement) +
            paceIcon_(s.achievement, timeGone));
        });
      }
    }
  } else {
    lines.push('รวม: ' + fmtNum_(total.actualTon) +
      (total.budgetTon ? ' / ' + fmtNum_(total.budgetTon) + ' ตัน (' + fmtNum_(total.achievement) + '%)' : ' ตัน'));
    if (timeGone !== null && total.budgetTon && total.achievement !== undefined) lines.push(gapVsTimeLine_(total.achievement, timeGone));
    if (total.forecastTon !== undefined) {
      lines.push('🔮 คาดการณ์สิ้นเดือน ' + fmtNum_(total.forecastTon) + ' ตัน' +
        (total.budgetTon ? ' (' + fmtNum_(pct_(total.forecastTon, total.budgetTon), 1) + '%)' : '') +
        (total.gapTon !== undefined ? ' | Gap ' + fmtNum_(total.gapTon) : ''));
    }
    if (total.currentSpeed !== undefined && total.requiredSpeed !== undefined) {
      const diff = total.currentSpeed - total.requiredSpeed;
      lines.push('🚀 สปีด ' + fmtNum_(total.currentSpeed) + ' ตัน/วัน | ต้องการ ' + fmtNum_(total.requiredSpeed));
      lines.push(diff >= 0 ? '✅ เร็วกว่าเป้า +' + fmtNum_(diff) + ' ตัน/วัน'
        : '⚠️ ต้องเร่งอีก ' + fmtNum_(-diff) + ' ตัน/วัน');
    } else if (total.currentSpeed !== undefined) {
      lines.push('🚀 สปีด ' + fmtNum_(total.currentSpeed) + ' ตัน/วัน');
    }
    const teams = teamsOf_(d);
    if (teams.length) {
      lines.push('━━━━━━━━━━');
      teams.forEach(function (t) { lines.push(teamLine_(t)); });
    }
    if (d.lastDay) lines.push('📅 วันล่าสุด (' + fmtDate_(d.lastDay.date) + ') ' + fmtNum_(d.lastDay.total) + ' ตัน');
    if (d.status) {
      lines.push('สถานะ: ' + Object.keys(d.status).map(function (k) { return k + ' ' + d.status[k]; }).join(' · '));
    }
    appendBullets_(lines, '💡 โอกาส', d.opportunity);
    appendBullets_(lines, '👀 ต้องระวัง', d.watchout);
    appendBullets_(lines, '📝 สรุป', d.summary);
  }
  if (d.source === 'sheet') {
    lines.push('ดูเพิ่ม: ยอดเมื่อวาน | ยอดเซลส์ | ยอดลูกค้า | ยอดสินค้า | ยอด <ชื่อเซลส์>');
  } else {
    lines.push('🔗 ' + CONFIG.DASHBOARD_PAGE);
  }
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
  const parts = ['📊 ยอด ' + fmtNum_(t.actualTon) + (t.budgetTon ? '/' + fmtNum_(t.budgetTon) + ' ตัน (' + fmtNum_(t.achievement) + '%)' : ' ตัน')];
  if (t.forecastTon !== undefined) parts.push('คาดการณ์ ' + fmtNum_(t.forecastTon));
  if (t.currentSpeed !== undefined && t.requiredSpeed !== undefined) {
    const diff = t.currentSpeed - t.requiredSpeed;
    parts.push(diff >= 0 ? 'สปีดผ่านเป้า ✅' : 'ต้องเร่ง +' + fmtNum_(-diff) + ' ตัน/วัน ⚠️');
  }
  let s = parts.join(' | ') + ' (ข้อมูล ' + (d.date || '-') + ')';
  if (d.lastDay) {
    s += '\n📅 ยอดวันที่ ' + fmtDate_(d.lastDay.date) + ' ' + fmtNum_(d.lastDay.total) + ' ตัน';
    if (d.lastDay.bySales.length) {
      s += ' · ท็อป: ' + d.lastDay.bySales.slice(0, 3).map(function (e) { return e.name + ' ' + fmtNum_(e.ton, 1); }).join(', ');
    }
  }
  return s;
}

function safeSalesShort_() {
  try { return formatSalesShort_(getSalesSnapshot_()); } catch (e) {
    console.error(e);
    return '📊 ยอด: โหลดข้อมูลไม่ได้';
  }
}

/** ใช้ในสรุปสัปดาห์: 5 อันดับเซลส์ */
function safeSalesTop_() {
  try {
    const snap = getSalesSnapshot_();
    if (!snap.salesList || !snap.salesList.length) return '';
    const tg = timeGonePct_(snap);
    return '🏆 ท็อปเซลส์เดือนนี้\n' + snap.salesList.slice(0, 5).map(function (s, i) {
      return (i + 1) + '. ' + s.name + ' — ' + tonVsTarget_(s.actualTon, s.budgetTon, s.achievement) + paceIcon_(s.achievement, tg);
    }).join('\n');
  } catch (e) {
    return '';
  }
}
