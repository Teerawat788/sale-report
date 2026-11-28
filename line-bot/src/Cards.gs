/**
 * การ์ดรายงานยอดขาย (Flex) — ตารางคอลัมน์ตรง อ่านง่ายบนมือถือ
 * ตัวเลข: ตันทศนิยม 1 ตำแหน่ง · มูลค่าเป็นล้านบาท 2 ตำแหน่ง · สีคาดปิด เขียว ≥100% ส้ม 95–99% แดง <95%
 */

const ROWS_PER_CARD = 30;
const PCT_LEGEND = 'สี: เขียว ≥100% · ส้ม 95–99% · แดง <95%';

/** ข้อมูลครบทุกวันทำงานของเดือน → แสดงเป็น "ปิดเดือน" (ยอดจริง ไม่ใช่คาดการณ์) · detail = วันของไฟล์รายลูกค้า */
function isClosed_(snap, detail) {
  if (snap.forceClosed) return true;
  return detail && snap.detailAsOf ? !!snap.detailClosed : !!snap.closed;
}

/** "พ.ย. 69" */
function monthLabel_(d) {
  return TH_MONTHS_SHORT[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(-2);
}

/** +12.3% / −4.5% เทียบปีก่อน (มีสี) */
function growthCell_(cur, last) {
  if (!last) return '-';
  const g = (cur / last - 1) * 100;
  return { t: (g > 0 ? '+' : g < 0 ? '−' : '') + fmtNum_(Math.abs(g), 1) + '%', color: g >= 0 ? FX.green : FX.red };
}

function cardWd_(snap, detail) {
  return detail && snap.detailWd ? snap.detailWd : { passed: snap.workingDaysPassed, total: snap.workingDaysTotal };
}

/** บรรทัดรองใต้หัวการ์ด: วันที่ข้อมูล + วันทำงาน + Time gone */
function cardDateLines_(snap, detail) {
  const asOf = detail && snap.detailAsOf ? snap.detailAsOf : snap.asOf;
  const wd = cardWd_(snap, detail);
  if (isClosed_(snap, detail)) {
    return ['ข้อมูลถึง ' + fmtDateShortYear_(asOf),
      wd.passed >= wd.total ? 'ครบเดือน · วันทำงาน ' + wd.passed + '/' + wd.total : '⚠️ ข้อมูลยังไม่ครบเดือน · วันทำงาน ' + wd.passed + '/' + wd.total];
  }
  return ['ข้อมูลถึง ' + fmtDateShortYear_(asOf),
    'วันทำงาน ' + wd.passed + '/' + wd.total + ' · เหลือ ' + (wd.total - wd.passed) + ' วัน · Time gone ' + fmtPct_(wd.passed / wd.total * 100)];
}

/** ⚠️ ไฟล์ยอดเก่าเกิน 2 วัน (ลืมส่งไฟล์) */
function staleNote_(snap) {
  const age = Math.round((startOfDay_(now_()) - startOfDay_(snap.asOf)) / 86400000);
  return age > 2 ? fxText_('⚠️ ยอดยังไม่อัปเดต — ข้อมูลล่าสุด ' + age + ' วันก่อน', { size: 'sm', weight: 'bold', color: FX.red, wrap: true }) : null;
}

/** สถานะคาดปิดเดือน (ตัวใหญ่ มีสี) */
function statusRow_(m, closed) {
  const a = closed ? m.achievement : m.forecastPct;
  const b = closed ? m.achievementAmt : m.forecastPctAmt;
  const p = a !== null && a !== undefined ? a : b;
  if (p === null || p === undefined) return null;
  const word = p >= 100 ? 'ถึงเป้า' : p >= 95 ? 'ใกล้เป้า' : 'ต่ำกว่าเป้า';
  return fxBox_('horizontal', [
    fxText_(closed ? 'ปิดเดือน' : 'คาดปิดเดือน', { size: 'sm', color: FX.sub, flex: 4, gravity: 'center' }),
    fxText_(fmtPct_(p, 1) + ' · ' + word, { size: 'lg', weight: 'bold', color: pctColor_(p), flex: 7, align: 'end' }),
  ], { margin: 'sm' });
}

/** ตารางตัวเลขหลัก (ภาพรวม / เขต): ตัน | ล้านบาท */
function metricsTable_(m, snap, last, closed) {
  const amt = !!(snap.hasAmount || m.budgetAmt);
  const cols = [{ label: 'รายการ', flex: 6, wrap: true }, { label: 'ตัน', flex: 5, align: 'end' }];
  if (amt) cols.push({ label: 'ล้านบาท', flex: 4, align: 'end' });
  const rows = [];
  const add = function (label, ton, mb, bold) {
    const cells = [label, ton];
    if (amt) cells.push(mb);
    rows.push(bold ? { cells: cells, bold: true } : cells);
  };
  const hasBudget = !!(m.budgetTon || m.budgetAmt);
  if (closed) {
    // ปิดเดือน: ยอดจริงทั้งเดือน เทียบเป้า / Challenge / ปีก่อน (ไม่มีสปีด–คาดปิดแล้ว)
    add('ยอดปิดเดือน', fmtTon_(m.actualTon), fmtMB_(m.actualAmt), true);
    if (hasBudget) {
      add('เป้า', m.budgetTon ? fmtTon_(m.budgetTon) : '-', m.budgetAmt ? fmtMB_(m.budgetAmt) : '-');
      add('% เป้า', { t: fmtPct_(m.achievement, 1), color: pctColor_(m.achievement), bold: true },
        { t: fmtPct_(m.achievementAmt, 1), color: pctColor_(m.achievementAmt), bold: true });
    }
    if (flag_('SHOW_CHALLENGE', false) && (m.challengeTon || m.challengeAmt)) {
      rows.push('sep');
      add('Challenge', m.challengeTon ? fmtTon_(m.challengeTon) : '-', m.challengeAmt ? fmtMB_(m.challengeAmt) : '-');
      add('% Challenge', fmtPct_(pctOrNull_(m.actualTon, m.challengeTon), 1), fmtPct_(pctOrNull_(m.actualAmt, m.challengeAmt), 1));
    }
    if (m.lastTon || m.lastAmt) {
      rows.push('sep');
      add('ปีก่อน', m.lastTon ? fmtTon_(m.lastTon) : '-', m.lastAmt ? fmtMB_(m.lastAmt) : '-');
      add('เทียบปีก่อน', growthCell_(m.actualTon, m.lastTon), growthCell_(m.actualAmt, m.lastAmt));
    }
    if (last) {
      rows.push('sep');
      add(last.label, fmtSigned_(last.ton), last.amt === null ? '-' : fmtSigned_(last.amt, fmtMB_));
    }
    return fxTable_(cols, rows, { margin: 'lg' });
  }
  add('ทำได้', fmtTon_(m.actualTon), fmtMB_(m.actualAmt), true);
  if (hasBudget) {
    add('เป้า', m.budgetTon ? fmtTon_(m.budgetTon) : '-', m.budgetAmt ? fmtMB_(m.budgetAmt) : '-');
    add('สำเร็จ', fmtPct_(m.achievement, 1), fmtPct_(m.achievementAmt, 1));
  }
  rows.push('sep');
  add('สปีด / วัน', fmtTon_(m.currentSpeed), fmtMB_(m.speedAmt));
  if (hasBudget) {
    const gapT = m.requiredSpeed !== undefined ? m.currentSpeed - m.requiredSpeed : null;
    const gapA = m.requiredAmt !== undefined ? m.speedAmt - m.requiredAmt : null;
    const tone = function (g) { return g === null ? FX.text : g >= 0 ? FX.green : FX.red; };
    add('ต้องทำ / วัน', { t: m.requiredSpeed !== undefined ? fmtTon_(m.requiredSpeed) : '-', color: tone(gapT) },
      { t: m.requiredAmt !== undefined ? fmtMB_(m.requiredAmt) : '-', color: tone(gapA) });
    add('ส่วนต่าง / วัน', { t: gapT === null ? '-' : fmtSigned_(gapT), color: tone(gapT) },
      { t: gapA === null ? '-' : fmtSigned_(gapA, fmtMB_), color: tone(gapA) });
  }
  rows.push('sep');
  add('คาดปิดเดือน', fmtTon_(m.forecastTon), fmtMB_(m.forecastAmt), true);
  if (hasBudget) {
    add('คาดปิด % เป้า', { t: fmtPct_(m.forecastPct, 1), color: pctColor_(m.forecastPct), bold: true },
      { t: fmtPct_(m.forecastPctAmt, 1), color: pctColor_(m.forecastPctAmt), bold: true });
  }
  if (flag_('SHOW_CHALLENGE', false) && (m.challengeTon || m.challengeAmt)) {
    rows.push('sep');
    add('Challenge', m.challengeTon ? fmtTon_(m.challengeTon) : '-', m.challengeAmt ? fmtMB_(m.challengeAmt) : '-');
    add('คาดปิด % Challenge', fmtPct_(m.challengePct, 1), fmtPct_(m.challengePctAmt, 1));
  }
  if (m.lastTon || m.lastAmt) {
    rows.push('sep');
    add('ปีก่อน', m.lastTon ? fmtTon_(m.lastTon) : '-', m.lastAmt ? fmtMB_(m.lastAmt) : '-');
  }
  if (last) {
    rows.push('sep');
    add(last.label, fmtSigned_(last.ton), last.amt === null ? '-' : fmtSigned_(last.amt, fmtMB_));
  }
  return fxTable_(cols, rows, { margin: 'lg' });
}

/** ยอดวันล่าสุดของ รวม/เขต (null = ยังไม่มีไฟล์วันก่อนหน้า) */
function lastDayInfo_(snap, teamName) {
  const ld = snap.lastDay;
  if (ld.unavailable) return null;
  let ton = ld.total;
  let amt = ld.totalAmt;
  if (teamName) {
    const e = ld.byTeam.find(function (x) { return x.name === teamName; });
    ton = e ? e.ton : 0;
    amt = e ? e.amt : 0;
  }
  return { label: lastDayLabel_(ld) === 'วันล่าสุด' ? 'วันล่าสุด ' + fmtDate_(ld.date).replace(/^\S+ /, '') : lastDayLabel_(ld),
    ton: ton, amt: snap.hasAmount && !ld.amtUnknown ? amt : null };
}

// ---------------------------------------------------------------- ภาพรวม + รายเขต

function overviewCard_(snap, opt) {
  const o = opt || {};
  const t = snap.total;
  const closed = isClosed_(snap);
  const body = [snap.forceClosed ? null : staleNote_(snap), statusRow_(t, closed), metricsTable_(t, snap, lastDayInfo_(snap, null), closed)];
  if (snap.lastDay.unavailable) body.push(fxNote_('ยอดรายวันจะเริ่มคิดเมื่อมีไฟล์ของวันถัดไป'));
  const lines = cardDateLines_(snap);
  const month = monthLabel_(snap.asOf);
  const title = o.greeting ? '☀️ สวัสดีตอนเช้าค่ะ' : closed ? '🏁 ปิดเดือน ' + month + ' · ทุกเขต' : '📊 ยอดขายสะสม · ทุกเขต';
  if (o.greeting) lines.unshift(fmtDateLong_(o.greeting) + (closed ? ' · สรุปปิดเดือน ' + month : ' · ยอดขายสะสมทุกเขต'));
  const footer = snap.forceClosed ? 'ยอดเดือนนี้: พิมพ์ ยอดขาย · ปิดเดือน F3 ดูรายเขต'
    : 'พิมพ์ F1–F5 ดูรายเขต · ชื่อเซลส์ / ชื่อลูกค้า ดูรายคน' +
      (!closed && snap.asOf.getDate() <= 7 ? '\nสรุปยอดเดือนก่อน: พิมพ์ ปิดเดือน' : '');
  const alt = closed
    ? '🏁 ปิดเดือน ' + month + ': ' + fmtTon_(t.actualTon) + ' ตัน' + (t.budgetTon ? ' (' + fmtPct_(t.achievement, 1) + ' ของเป้า)' : '')
    : '📊 ยอดขายสะสม ถึง ' + fmtDate_(snap.asOf) + ': ' + fmtTon_(t.actualTon) + ' ตัน' +
      (t.budgetTon ? ' (' + fmtPct_(t.achievement, 1) + ') คาดปิด ' + fmtPct_(t.forecastPct, 1) : '');
  return fxMessage_(alt, fxBubble_({ title: title, lines: lines, body: body, footer: footer }));
}

function zonesCard_(snap) {
  const teams = snap.teams;
  const total = snap.total;
  const closed = isClosed_(snap);
  const tonB = teams.some(function (z) { return z.budgetTon; });
  const amtB = teams.some(function (z) { return z.budgetAmt; });
  const amt = !!(snap.hasAmount || amtB);
  const body = [snap.forceClosed ? null : staleNote_(snap)];
  // แถวของทุกเขต + แถวรวม (ตัวหนา)
  const all = function (fn) {
    return teams.map(function (z) { return fn(z, z.name); }).concat(['sep', { cells: fn(total, 'รวม'), bold: true }]);
  };
  const pctCell = function (p) { return { t: fmtPct_(p), color: pctColor_(p), bold: true }; };
  const share = function (v, sum) { return fmtShare_(sum ? v / sum * 100 : null); };
  const done = closed ? 'ปิดเดือน' : 'ทำได้';

  // ยอดทำได้ (ตัน / ล้านบาท): เทียบเป้า หรือ (ไม่มีเป้า) สปีด/สัดส่วน
  const actualTable = function (title, f, fmt, budgetKey, achKey, hasB, speedKey) {
    body.push(fxSection_(title));
    if (hasB) {
      body.push(fxTable_([{ label: 'เขต', flex: 2 }, { label: done, flex: 4, align: 'end' }, { label: 'เป้า', flex: 4, align: 'end' },
        { label: closed ? '% เป้า' : 'สำเร็จ', flex: 3, align: 'end' }], all(function (z, n) {
        return [n, fmt(z[f]), z[budgetKey] ? fmt(z[budgetKey]) : '-', closed ? pctCell(z[achKey]) : fmtPct_(z[achKey])];
      }), { margin: 'sm' }));
    } else {
      body.push(fxTable_([{ label: 'เขต', flex: 2 }, { label: done, flex: 4, align: 'end' },
        { label: closed ? 'สัดส่วน' : 'สปีด/วัน', flex: 3, align: 'end' }], all(function (z, n) {
        return [n, fmt(z[f]), closed ? share(z[f], total[f]) : fmt(z[speedKey])];
      }), { margin: 'sm' }));
    }
  };
  actualTable(closed ? '⚖️ ยอดปิดเดือน (ตัน)' : '⚖️ ยอด (ตัน)', 'actualTon', fmtTon_, 'budgetTon', 'achievement', tonB, 'currentSpeed');
  if (amt) actualTable(closed ? '💰 มูลค่าปิดเดือน (ล้านบาท)' : '💰 มูลค่า (ล้านบาท)', 'actualAmt', fmtMB_, 'budgetAmt', 'achievementAmt', amtB, 'speedAmt');

  if (closed) {
    if (teams.some(function (z) { return z.lastTon || z.lastAmt; })) {
      body.push(fxSection_('📈 เทียบปีก่อน'));
      const cols = [{ label: 'เขต', flex: 2 }, { label: 'ตัน', flex: 4, align: 'end' }];
      if (amt) cols.push({ label: 'ล้านบาท', flex: 4, align: 'end' });
      body.push(fxTable_(cols, all(function (z, n) {
        const c = [n, growthCell_(z.actualTon, z.lastTon)];
        if (amt) c.push(growthCell_(z.actualAmt, z.lastAmt));
        return c;
      }), { margin: 'sm' }));
    }
  } else {
    // 🏁 คาดปิดเดือน = ยอดที่จะได้ ณ สิ้นเดือนถ้าขายได้เท่าสปีดปัจจุบัน — ทั้งตันและมูลค่า
    body.push(fxSection_('🏁 คาดปิดเดือน'));
    const cols = [{ label: 'เขต', flex: 2 }, { label: 'ตัน', flex: 4, align: 'end' }];
    if (tonB) cols.push({ label: '% เป้า', flex: 3, align: 'end' });
    if (amt) cols.push({ label: 'ล้านบาท', flex: 4, align: 'end' });
    if (amt && amtB) cols.push({ label: '% เป้า', flex: 3, align: 'end' });
    body.push(fxTable_(cols, all(function (z, n) {
      const c = [n, fmtTon_(z.forecastTon)];
      if (tonB) c.push(pctCell(z.forecastPct));
      if (amt) c.push(fmtMB_(z.forecastAmt));
      if (amt && amtB) c.push(pctCell(z.forecastPctAmt));
      return c;
    }), { margin: 'sm' }));

    if (tonB) {
      const gapCell = function (z) {
        if (z.requiredSpeed === undefined) return '-';
        const g = z.currentSpeed - z.requiredSpeed;
        return { t: fmtSigned_(g), color: g >= 0 ? FX.green : FX.red };
      };
      body.push(fxSection_('🚀 สปีด (ตัน / วัน)'));
      body.push(fxTable_([{ label: 'เขต', flex: 2 }, { label: 'ทำได้', flex: 3, align: 'end' }, { label: 'ต้องทำ', flex: 3, align: 'end' },
        { label: 'ส่วนต่าง', flex: 3, align: 'end' }], all(function (z, n) {
        return [n, fmtTon_(z.currentSpeed), z.requiredSpeed !== undefined ? fmtTon_(z.requiredSpeed) : '-', gapCell(z)];
      }), { margin: 'sm' }));
    }
  }
  const month = monthLabel_(snap.asOf);
  const hasB = tonB || amtB;
  const alt = closed
    ? '🏁 ปิดเดือน ' + month + ' รายเขต: ' + teams.map(function (z) {
      return z.name + ' ' + (z.achievement !== null && z.achievement !== undefined ? fmtPct_(z.achievement) : fmtTon_(z.actualTon));
    }).join(' · ')
    : '📍 รายเขต F1–F5 ถึง ' + fmtDate_(snap.asOf) + ': ' + teams.map(function (z) {
      return z.name + ' ' + (z.forecastPct !== null && z.forecastPct !== undefined ? fmtPct_(z.forecastPct) : fmtTon_(z.actualTon));
    }).join(' · ');
  const footer = closed
    ? 'ปิดเดือน = ยอดสะสมทั้งเดือน' + (hasB ? '\n' + PCT_LEGEND : '') + '\n' + (snap.forceClosed ? 'ยอดเดือนนี้: พิมพ์ ยอดขาย' : 'พิมพ์ F1–F5 ดูละเอียดรายเขต')
    : 'คาดปิด = ยอดที่จะได้ ณ สิ้นเดือน ถ้าขายได้เท่าสปีดปัจจุบัน' + (hasB ? '\n' + PCT_LEGEND : '') + '\nพิมพ์ F1–F5 ดูละเอียดรายเขต';
  return fxMessage_(alt, fxBubble_({ title: closed ? '🏁 ปิดเดือน ' + month + ' · รายเขต' : '📍 รายเขต F1–F5',
    lines: cardDateLines_(snap), body: body, footer: footer }));
}

function zoneDetailCard_(snap, team) {
  const closed = isClosed_(snap);
  const body = [snap.forceClosed ? null : staleNote_(snap), statusRow_(team, closed), metricsTable_(team, snap, lastDayInfo_(snap, team.name), closed)];
  if (snap.lastDay.unavailable) body.push(fxNote_('ยอดรายวันจะเริ่มคิดเมื่อมีไฟล์ของวันถัดไป'));
  const members = snap.salesList.filter(function (s) { return s.team === team.name && Math.abs(s.actualTon) > 1e-9; });
  if (members.length) {
    const withBudget = members.some(function (s) { return s.budgetTon; });
    body.push(fxSection_('👥 เซลส์ในเขต ' + members.length + ' คน' + (snap.detailAsOf ? ' (ถึง ' + fmtDate_(snap.detailAsOf) + ')' : '')));
    const done = isClosed_(snap, true);
    const cols = [{ label: 'เซลส์', flex: 7, wrap: true }, { label: 'ตัน', flex: 3, align: 'end' }];
    if (!done) cols.push({ label: 'คาดปิด', flex: 3, align: 'end' });
    cols.push({ label: withBudget ? '% เป้า' : 'สัดส่วน', flex: 3, align: 'end' });
    body.push(fxTable_(cols, members.map(function (s) {
      const p = done ? s.achievement : s.forecastPct;
      const c = [s.name, fmtTon_(s.actualTon)];
      if (!done) c.push(fmtTon_(s.forecastTon));
      c.push(withBudget ? { t: fmtPct_(p), color: pctColor_(p) } : fmtShare_(team.actualTon ? s.actualTon / team.actualTon * 100 : null));
      return c;
    }), { margin: 'sm' }));
  }
  const month = monthLabel_(snap.asOf);
  if (closed) {
    return fxMessage_('🏁 ' + team.name + ' ปิดเดือน ' + month + ': ' + fmtTon_(team.actualTon) + ' ตัน' +
      (team.achievement !== null && team.achievement !== undefined ? ' (' + fmtPct_(team.achievement, 1) + ' ของเป้า)' : ''),
    fxBubble_({ title: '🏁 ' + team.name + ' · ปิดเดือน ' + month, lines: cardDateLines_(snap), body: body,
      footer: snap.forceClosed ? 'ยอดเดือนนี้: พิมพ์ ' + team.name : 'พิมพ์ชื่อเซลส์ ดูลูกค้ารายคน · ลูกค้า ' + team.name + ' ดูลูกค้าทั้งเขต' }));
  }
  return fxMessage_('📊 ' + team.name + ' ถึง ' + fmtDate_(snap.asOf) + ': ' + fmtTon_(team.actualTon) + ' ตัน' +
    (team.forecastPct !== null && team.forecastPct !== undefined ? ' คาดปิด ' + fmtPct_(team.forecastPct, 1) : ''),
  fxBubble_({ title: '📊 ' + team.name + ' · ยอดสะสม', lines: cardDateLines_(snap), body: body,
    footer: 'พิมพ์ชื่อเซลส์ ดูลูกค้ารายคน · ลูกค้า ' + team.name + ' ดูลูกค้าทั้งเขต' }));
}

// ---------------------------------------------------------------- รายคน / ลูกค้า

/**
 * ตารางลูกค้าแบ่งหลายการ์ด (การ์ดละ 30 ราย)
 * rows = [{ name, ton, pct, extra }] · opts: { extraLabel, footer, startNo (เลขลำดับเริ่มต่อจาก), maxCards }
 */
function customerTableCards_(title, lines, rows, opts) {
  const o = opts || {};
  const start = o.startNo || 0;
  const totalCount = start + rows.length;
  const cols = [{ label: '#', flex: 1, align: 'end' }, { label: 'ลูกค้า', flex: o.extraLabel ? 7 : 9, wrap: true },
    { label: 'ตัน', flex: 3, align: 'end' }, { label: '%', flex: 2, align: 'end' }];
  if (o.extraLabel) cols.push({ label: o.extraLabel, flex: 3, wrap: true });
  const cells = rows.map(function (r, i) {
    const c = [String(start + i + 1), r.name, fmtTon_(r.ton), fmtShare_(r.pct)];
    if (o.extraLabel) c.push(r.extra || '-');
    return c;
  });
  const maxCards = o.maxCards || 5;
  const cards = [];
  for (let i = 0; i < cells.length && cards.length < maxCards; i += ROWS_PER_CARD) {
    const part = cells.slice(i, i + ROWS_PER_CARD);
    const cont = start + i > 0;
    const isLast = i + ROWS_PER_CARD >= cells.length || cards.length + 1 === maxCards;
    const more = cells.length - (i + part.length);
    const footer = isLast ? (more > 0 ? '…และอีก ' + more + ' ราย' : o.footer) : undefined;
    cards.push(fxMessage_(title + (cont ? ' (ต่อ)' : ''), fxBubble_({
      title: title + (cont ? ' (ต่อ)' : ''),
      lines: cont ? ['ลำดับ ' + (start + i + 1) + '–' + (start + i + part.length) + ' จาก ' + totalCount] : lines,
      body: [fxTable_(cols, part, { margin: 'none' })],
      footer: footer,
    })));
  }
  return cards;
}

function personCards_(snap, person) {
  const rows = snap.monthRows.filter(function (r) { return r.sales === person.name; });
  const zone = person.team ? snap.teams.find(function (t) { return t.name === person.team; }) : null;
  const wd = cardWd_(snap, true);
  const remain = wd.total - wd.passed;
  const closed = isClosed_(snap, true);
  // มูลค่ารายเซลส์: มีเมื่อไฟล์รายลูกค้ามีคอลัมน์มูลค่า (บาท)
  const amtKnown = Math.abs(person.actualAmt || 0) > 1e-9;
  const kv = [[closed ? 'ยอดปิดเดือน' : 'ยอดเดือนนี้', fmtTon_(person.actualTon) + ' ตัน', { bold: true }]];
  if (amtKnown) kv.push(['มูลค่า', fmtMB_(person.actualAmt) + ' ล้านบาท']);
  if (zone && zone.actualTon) kv.push(['สัดส่วนในเขต ' + zone.name, fmtPct_(person.actualTon / zone.actualTon * 100)]);
  if (!closed) {
    kv.push(['สปีด / วัน', fmtTon_(person.currentSpeed) + ' ตัน']);
    kv.push(['คาดปิดเดือน', fmtTon_(person.forecastTon) + ' ตัน', { bold: true }]);
    if (amtKnown) kv.push(['คาดปิด มูลค่า', fmtMB_(person.forecastAmt) + ' ล้านบาท', { bold: true }]);
  }
  if (person.budgetTon) {
    kv.push('sep');
    kv.push(['เป้า', fmtTon_(person.budgetTon) + ' ตัน']);
    if (closed) {
      kv.push(['% เป้า', fmtPct_(person.achievement, 1), { color: pctColor_(person.achievement), bold: true }]);
    } else {
      kv.push(['สำเร็จ', fmtPct_(person.achievement, 1)]);
      kv.push(['คาดปิด % เป้า', fmtPct_(person.forecastPct, 1), { color: pctColor_(person.forecastPct), bold: true }]);
    }
    if (!closed && remain > 0 && person.actualTon < person.budgetTon) {
      kv.push(['ต้องทำ / วัน', fmtTon_((person.budgetTon - person.actualTon) / remain) + ' ตัน', { color: FX.red }]);
    }
  }
  const lastRows = rows.filter(function (r) { return r.date.getTime() === snap.asOf.getTime(); });
  if (!snap.lastDay.unavailable && lastRows.length && !lastRows.some(function (r) { return r.firstSnap; })) {
    kv.push(['วันล่าสุด ' + fmtDate_(snap.asOf).replace(/^\S+ /, ''), fmtSigned_(lastRows.reduce(function (a, r) { return a + r.ton; }, 0)) + ' ตัน']);
  }
  const cust = sortedEntries_(sumBy_(rows.filter(function (r) { return r.customer; }), 'customer'))
    .filter(function (e) { return Math.abs(e.ton) > 1e-9; });
  const total = cust.reduce(function (a, e) { return a + e.ton; }, 0);
  const custRows = cust.map(function (e) { return { name: e.name, ton: e.ton, pct: total ? e.ton / total * 100 : null }; });
  const lines = [(person.team ? 'เขต ' + person.team + ' · ' : '') + 'ข้อมูลถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf),
    closed ? 'ปิดเดือน ' + monthLabel_(snap.detailAsOf || snap.asOf) + ' · วันทำงาน ' + wd.passed + '/' + wd.total
      : 'วันทำงาน ' + wd.passed + '/' + wd.total + ' · เหลือ ' + remain + ' วัน'];
  const body = [fxKV_(kv, { margin: 'none' })];
  const FIRST = 15;
  if (custRows.length) {
    body.push(fxSection_('👥 ลูกค้า ' + custRows.length + ' ราย'));
    body.push(fxTable_([{ label: '#', flex: 1, align: 'end' }, { label: 'ลูกค้า', flex: 9, wrap: true },
      { label: 'ตัน', flex: 3, align: 'end' }, { label: '%', flex: 2, align: 'end' }],
    custRows.slice(0, FIRST).map(function (r, i) { return [String(i + 1), r.name, fmtTon_(r.ton), fmtShare_(r.pct)]; }), { margin: 'sm' }));
  }
  const prod = sortedEntries_(sumBy_(rows.filter(function (r) { return r.product; }), 'product'));
  if (prod.length) {
    body.push(fxSection_('📦 สินค้า'));
    body.push(fxTable_([{ label: 'สินค้า', flex: 9, wrap: true }, { label: 'ตัน', flex: 3, align: 'end' }],
      prod.slice(0, 5).map(function (e) { return [e.name, fmtTon_(e.ton)]; }), { margin: 'sm' }));
  }
  const cards = [fxMessage_('👤 ' + person.name + ': ' + fmtTon_(person.actualTon) + ' ตัน · ลูกค้า ' + custRows.length + ' ราย',
    fxBubble_({ title: '👤 ' + person.name, lines: lines, body: body,
      footer: custRows.length > FIRST ? 'ลูกค้าลำดับ ' + (FIRST + 1) + ' เป็นต้นไป อยู่ในข้อความถัดไป' : '% = สัดส่วนในยอดของเซลส์คนนี้' }))];
  if (custRows.length > FIRST) {
    customerTableCards_('👥 ลูกค้าของ ' + person.name.split(' ')[0], [], custRows.slice(FIRST),
      { startNo: FIRST, maxCards: 4, footer: '% = สัดส่วนในยอดของเซลส์คนนี้' }).forEach(function (c) { cards.push(c); });
  }
  return cards.length === 1 ? cards[0] : cards;
}

function zoneCustomerCards_(snap, zone) {
  const cust = {};
  snap.monthRows.forEach(function (r) {
    if (!r.customer || r.team !== zone) return;
    const c = cust[r.customer] || (cust[r.customer] = { name: r.customer, sales: r.sales, ton: 0 });
    c.ton += r.ton;
  });
  const list = Object.keys(cust).map(function (k) { return cust[k]; })
    .filter(function (c) { return Math.abs(c.ton) > 1e-9; })
    .sort(function (a, b) { return b.ton - a.ton; });
  if (!list.length) return 'ยังไม่มียอดรายลูกค้าของ ' + zone + ' ค่ะ';
  const sum = list.reduce(function (a, c) { return a + c.ton; }, 0);
  const t = snap.teams.find(function (x) { return x.name === zone; });
  const zoneTon = t && t.actualTon ? t.actualTon : sum;
  const cards = customerTableCards_('👥 ลูกค้า ' + zone,
    [list.length + ' ราย · รวม ' + fmtTon_(sum) + ' ตัน', 'ข้อมูลถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf)],
    list.map(function (c) { return { name: c.name, ton: c.ton, pct: c.ton / zoneTon * 100 }; }),
    { footer: '% = สัดส่วนในยอดเขต ' + zone + ' · พิมพ์ชื่อลูกค้า หรือชื่อเซลส์ ดูรายละเอียด' });
  return cards.length === 1 ? cards[0] : cards;
}

function customerCard_(snap, name) {
  const rows = snap.monthRows.filter(function (r) { return r.customer === name; });
  if (!rows.length) return '🏪 ' + name + '\nยังไม่มียอดเดือนนี้ค่ะ';
  const ton = sumField_(rows, 'ton');
  const amt = sumField_(rows, 'amount');
  const wd = cardWd_(snap, true);
  const m = salesMetrics_(name, ton, amt, null, null, wd);
  const zones = uniq_(rows.map(function (r) { return r.team; }));
  const pics = sortedEntries_(sumBy_(rows.filter(function (r) { return r.sales; }), 'sales'))
    .filter(function (e) { return Math.abs(e.ton) > 1e-9; }).map(function (e) { return e.name; });
  const custHasAmt = snap.hasAmount && rows.some(function (r) { return typeof r.amount === 'number' && !isNaN(r.amount) && r.amount !== 0; });
  const closed = isClosed_(snap, true);
  const kv = [[closed ? 'ยอดปิดเดือน' : 'ยอดเดือนนี้', fmtTon_(ton) + ' ตัน', { bold: true }]];
  if (custHasAmt) kv.push(['มูลค่า', fmtMB_(amt) + ' ล้านบาท']);
  if (!closed) {
    kv.push(['สปีด / วัน', fmtTon_(m.currentSpeed) + ' ตัน']);
    kv.push(['คาดปิดเดือน', fmtTon_(m.forecastTon) + ' ตัน', { bold: true }]);
    if (custHasAmt) kv.push(['คาดปิด มูลค่า', fmtMB_(m.forecastAmt) + ' ล้านบาท']);
  }
  if (zones.length === 1) {
    const z = snap.teams.find(function (t) { return t.name === zones[0]; });
    if (z && z.actualTon) kv.push(['สัดส่วนในเขต ' + z.name, fmtPct_(ton / z.actualTon * 100, 1)]);
  }
  const body = [fxKV_(kv, { margin: 'none' })];
  // รายวัน (จากผลต่างยอดสะสม) — ไม่นับไฟล์รายลูกค้าไฟล์แรกของเดือน (เป็นยอดสะสมทั้งก้อน)
  const byDay = {};
  const firstDays = {};
  rows.forEach(function (r) {
    const k = r.date.getTime();
    if (r.firstSnap) firstDays[k] = true;
    const d = byDay[k] || (byDay[k] = { ton: 0, amt: 0, amtKnown: false });
    d.ton += r.ton;
    if (typeof r.amount === 'number' && !isNaN(r.amount) && !r.amtLump) { d.amt += r.amount; d.amtKnown = true; }
  });
  const days = Object.keys(byDay).map(Number).sort(function (a, b) { return b - a; })
    .filter(function (t) { return t !== snap.lastDay.firstSnapshot && !firstDays[t]; });
  if (days.length) {
    const showAmt = custHasAmt && days.some(function (t) { return byDay[t].amtKnown; });
    const cols = [{ label: 'วันที่', flex: 5 }, { label: 'ตัน', flex: 4, align: 'end' }];
    if (showAmt) cols.push({ label: 'ล้านบาท', flex: 4, align: 'end' });
    body.push(fxSection_('📅 รายวันล่าสุด'));
    body.push(fxTable_(cols, days.slice(0, 7).map(function (t) {
      const d = byDay[t];
      const c = [fmtDate_(new Date(t)), fmtSigned_(d.ton)];
      if (showAmt) c.push(d.amtKnown ? fmtSigned_(d.amt, fmtMB_) : '-');
      return c;
    }), { margin: 'sm' }));
  }
  return fxMessage_('🏪 ' + name + ': ' + fmtTon_(ton) + ' ตัน (ถึง ' + fmtDate_(snap.detailAsOf || snap.asOf) + ')',
    fxBubble_({ title: '🏪 ' + name,
      lines: [(zones.join(', ') || '-') + (pics.length ? ' · 👤 ' + pics.join(', ') : ''),
        'ข้อมูลถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf) + ' · วันทำงาน ' + wd.passed + '/' + wd.total],
      body: body }));
}

// ---------------------------------------------------------------- อันดับ / ท็อป / ยอดเมื่อวาน

function rankCards_(snap) {
  if (!snap.salesList || !snap.salesList.length) return 'ยังไม่มียอดรายเซลส์ค่ะ (ต้องใช้ไฟล์ยอดรายลูกค้า)';
  const list0 = snap.salesList.filter(function (s) { return Math.abs(s.actualTon) > 1e-9 || s.budgetTon; });
  const anyTarget = list0.some(function (s) { return s.budgetTon; });
  const list = anyTarget
    ? list0.slice().sort(function (a, b) { return (b.achievement || -1) - (a.achievement || -1) || b.actualTon - a.actualTon; })
    : list0;
  const tg = timeGonePct_(snap);
  const closed = isClosed_(snap, true);
  const sum = list.reduce(function (a, s) { return a + s.actualTon; }, 0);
  const cols = [{ label: '#', flex: 1, align: 'end' }, { label: 'เซลส์', flex: 9, wrap: true }, { label: 'เขต', flex: 2 },
    { label: 'ตัน', flex: 3, align: 'end' }, { label: anyTarget ? '% เป้า' : closed ? 'สัดส่วน' : 'คาดปิด', flex: 3, align: 'end' }];
  const rows = list.map(function (s, i) {
    const last = anyTarget
      ? { t: fmtPct_(s.achievement), color: closed ? pctColor_(s.achievement)
        : s.achievement === null ? FX.text : s.achievement >= tg ? FX.green : s.achievement >= tg - 10 ? FX.amber : FX.red }
      : closed ? fmtShare_(sum ? s.actualTon / sum * 100 : null) : fmtTon_(s.forecastTon);
    return [String(i + 1), s.name, s.team || '-', fmtTon_(s.actualTon), last];
  });
  const cards = [];
  for (let i = 0; i < rows.length && cards.length < 5; i += ROWS_PER_CARD) {
    cards.push(fxMessage_('🏆 อันดับเซลส์ ถึง ' + fmtDate_(snap.detailAsOf || snap.asOf), fxBubble_({
      title: '🏆 อันดับเซลส์' + (i ? ' (ต่อ)' : ''),
      lines: i ? [] : closed
        ? ['ปิดเดือน ' + monthLabel_(snap.detailAsOf || snap.asOf) + ' · ' + list.length + ' คน']
        : ['เดือนนี้ ถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf) + ' · ' + list.length + ' คน', 'Time gone ' + fmtPct_(tg)],
      body: [fxTable_(cols, rows.slice(i, i + ROWS_PER_CARD), { margin: 'none' })],
      footer: closed ? (anyTarget ? PCT_LEGEND : 'สัดส่วน = ส่วนของยอดรวมทุกเซลส์') + ' · พิมพ์ชื่อเซลส์ ดูลูกค้า'
        : anyTarget ? 'สี % เป้า: เขียว ทันเวลา · ส้ม ช้าไม่เกิน 10% · แดง ช้ากว่านั้น' : 'คาดปิด = ตันที่คาดว่าจะได้เมื่อสิ้นเดือน · พิมพ์ชื่อเซลส์ ดูลูกค้า',
    })));
  }
  return cards.length === 1 ? cards[0] : cards;
}

function topCard_(snap, key, n) {
  const rows = snap.monthRows.filter(function (r) { return r[key]; });
  if (!rows.length) return key === 'customer' ? 'ยังไม่มียอดรายลูกค้าค่ะ (ต้องใช้ไฟล์ยอดรายลูกค้า)' : 'ไฟล์ยอดยังไม่มีข้อมูลรายสินค้าค่ะ';
  const entries = sortedEntries_(sumBy_(rows, key)).filter(function (e) { return Math.abs(e.ton) > 1e-9; });
  const zoneOf = {};
  rows.forEach(function (r) { if (r.team && !zoneOf[r[key]]) zoneOf[r[key]] = r.team; });
  const isCust = key === 'customer';
  const top = entries.slice(0, n || 10);
  const title = (isCust ? '👥 ลูกค้าท็อป ' : '📦 สินค้าท็อป ') + top.length;
  const cols = [{ label: '#', flex: 1, align: 'end' }, { label: isCust ? 'ลูกค้า' : 'สินค้า', flex: 9, wrap: true }];
  if (isCust) cols.push({ label: 'เขต', flex: 2 });
  cols.push({ label: 'ตัน', flex: 3, align: 'end' });
  return fxMessage_(title + ' ถึง ' + fmtDate_(snap.detailAsOf || snap.asOf), fxBubble_({
    title: title,
    lines: ['เดือนนี้ ถึง ' + fmtDateShortYear_(snap.detailAsOf || snap.asOf) + ' · ทั้งหมด ' + entries.length + (isCust ? ' ราย' : ' รายการ')],
    body: [fxTable_(cols, top.map(function (e, i) {
      const c = [String(i + 1), e.name];
      if (isCust) c.push(zoneOf[e.name] || '-');
      c.push(fmtTon_(e.ton));
      return c;
    }), { margin: 'none' })],
    footer: isCust ? 'ดูลูกค้าทั้งเขต พิมพ์: ลูกค้า F3' : undefined,
  }));
}

function lastDayCard_(snap) {
  const ld = snap.lastDay;
  if (ld.unavailable) {
    return '📅 ยอดรายวันยังไม่มีค่ะ\nจะเริ่มคิดเมื่อมีไฟล์ของวันถัดไป (ยอดวันนี้ = ไฟล์วันนี้ − ไฟล์ก่อนหน้า)\n\n' +
      'สะสมเดือนนี้ ถึง ' + fmtDate_(ld.date) + ': ' + fmtTon_(snap.total.actualTon) + ' ตัน' +
      (snap.total.budgetTon ? ' (' + fmtPct_(snap.total.achievement, 1) + ' ของเป้า)' : '');
  }
  const amt = snap.hasAmount && !ld.amtUnknown;
  const label = lastDayLabel_(ld) === 'วันล่าสุด' ? 'ยอดขายวันที่ ' + fmtDate_(ld.date) : lastDayLabel_(ld);
  const body = [];
  const zoneCols = [{ label: 'เขต', flex: 3 }, { label: 'ตัน', flex: 4, align: 'end' }];
  if (amt) zoneCols.push({ label: 'ล้านบาท', flex: 4, align: 'end' });
  const zoneRows = ld.byTeam.slice().sort(function (a, b) { return zoneCompare_(a.name, b.name); }).map(function (t) {
    const c = [t.name, fmtSigned_(t.ton)];
    if (amt) c.push(fmtSigned_(t.amt, fmtMB_));
    return c;
  });
  const totalCells = ['รวม', fmtSigned_(ld.total)];
  if (amt) totalCells.push(fmtSigned_(ld.totalAmt, fmtMB_));
  body.push(fxTable_(zoneCols, zoneRows.concat(['sep', { cells: totalCells, bold: true }]), { margin: 'none' }));
  const top = function (entries, n, head) {
    body.push(fxSection_(head));
    body.push(fxTable_([{ label: '#', flex: 1, align: 'end' }, { label: 'ชื่อ', flex: 9, wrap: true }, { label: 'ตัน', flex: 3, align: 'end' }],
      entries.slice(0, n).map(function (e, i) { return [String(i + 1), e.name, fmtSigned_(e.ton)]; }), { margin: 'sm' }));
  };
  if (ld.bySales.length) top(ld.bySales, 10, '🏅 เซลส์ ' + Math.min(10, ld.bySales.length) + ' อันดับ');
  if (ld.byCustomer.length) top(ld.byCustomer, 5, '👥 ลูกค้า ' + Math.min(5, ld.byCustomer.length) + ' อันดับ');
  const t = snap.total;
  return fxMessage_('📅 ' + label + ': ' + fmtTon_(ld.total) + ' ตัน', fxBubble_({
    title: '📅 ' + label,
    lines: ['รวม ' + fmtSigned_(ld.total) + ' ตัน' + (amt ? ' · ' + fmtSigned_(ld.totalAmt, fmtMB_) + ' ล้านบาท' : '')],
    body: body,
    footer: 'สะสมเดือนนี้ ' + fmtTon_(t.actualTon) + (t.budgetTon ? ' / ' + fmtTon_(t.budgetTon) : '') + ' ตัน' +
      (t.budgetTon ? ' (' + fmtPct_(t.achievement, 1) + ')' : '') +
      (snap.hasAmount ? ' · ' + fmtMB_(t.actualAmt) + ' ล้านบาท' + (t.budgetAmt ? ' (' + fmtPct_(t.achievementAmt, 1) + ')' : '') : ''),
  }));
}

// ---------------------------------------------------------------- ปิดเดือน

/**
 * "ปิดเดือน" — สรุปยอดปิดเดือนล่าสุดที่ครบเดือน (ตัน + ล้านบาท เทียบเป้า/ปีก่อน)
 * "ปิดเดือน ต.ค." / "ปิดเดือน เดือนก่อน" / "ปิดเดือน F3" / "ปิดเดือน ต.ค. F3"
 * คืน null เมื่อพิมพ์ต่อท้ายด้วยคำที่ไม่ใช่เดือน/เขต (แชทปกติ)
 */
function monthCloseCommand_(argText, now) {
  let zoneQ = '';
  const monthWords = [];
  String(argText || '').split(/\s+/).filter(Boolean).forEach(function (t) {
    if (/^(?:f|fish|เขต)\s*[1-9]$/i.test(t)) zoneQ = t;
    else monthWords.push(t);
  });
  const monthQ = monthWords.join(' ');
  let month = null;
  if (monthQ) {
    month = /^(เดือน)?(ก่อน|ที่แล้ว|แล้ว)$/.test(monthQ) ? -1 : parseMonthArg_(monthQ, now);
    if (!month) return null;
  }
  const latest = getSalesSnapshot_();
  if (!latest || latest.source !== 'sheet') return NO_SHEET_SALES_TEXT;
  let snap;
  if (month === null && latest.closed) {
    snap = latest;
  } else {
    let end;
    if (month === null || month === -1) {
      end = new Date(latest.asOf.getFullYear(), latest.asOf.getMonth(), 0);
    } else {
      // เดือนที่ระบุ: ครั้งล่าสุดที่ไม่เกินเดือนของข้อมูลล่าสุด
      const y = month - 1 > latest.asOf.getMonth() ? latest.asOf.getFullYear() - 1 : latest.asOf.getFullYear();
      end = new Date(y, month, 0);
    }
    if (monthKey_(end) === latest.monthKey) {
      if (!latest.closed) {
        return '📊 เดือน ' + monthLabel_(end) + ' ยังไม่ปิดค่ะ (ข้อมูลถึง ' + fmtDate_(latest.asOf) + ' · วันทำงาน ' +
          latest.workingDaysPassed + '/' + latest.workingDaysTotal + ')\nดูยอดคาดปิดได้ที่: ยอดขาย';
      }
      snap = latest;
    } else {
      snap = salesSnapshotAt_(end);
      if (!snap || snap.monthKey !== monthKey_(end)) return 'ยังไม่มีข้อมูลยอดของเดือน ' + monthLabel_(end) + ' ค่ะ';
      snap.forceClosed = true;
    }
  }
  const out = [];
  if (snap.workingDaysPassed < snap.workingDaysTotal) {
    const last = new Date(snap.asOf.getFullYear(), snap.asOf.getMonth() + 1, 0);
    out.push('⚠️ ไฟล์ยอดสุดท้ายของเดือน ' + monthLabel_(snap.asOf) + ' ถึง ' + fmtDate_(snap.asOf) + ' (วันทำงาน ' +
      snap.workingDaysPassed + '/' + snap.workingDaysTotal + ') — ยังไม่ใช่ยอดปิดเดือนจริงค่ะ\n' +
      'ส่งไฟล์ยอดวันสุดท้ายของเดือนในห้องสั่งการ แล้วพิมพ์: อัปเดตยอด ' + last.getDate() + '/' + (last.getMonth() + 1));
  }
  if (zoneQ) {
    const team = findTeam_(snap, zoneQ);
    if (!team) return 'ไม่มียอดของ ' + zoneQ.toUpperCase() + ' ในเดือน ' + monthLabel_(snap.asOf) + ' ค่ะ';
    out.push(zoneDetailCard_(snap, team));
  } else {
    out.push(overviewCard_(snap));
    out.push(zonesCard_(snap));
  }
  return out;
}
