/**
 * Flex Message — การ์ด/ตารางที่อ่านง่ายบน LINE
 *  - คอลัมน์ตรงกัน ตัวเลขชิดขวา
 *  - ตัวเลขไม่กลายเป็นลิงก์เบอร์โทร (ข้อความธรรมดา LINE ขีดเส้นใต้ตัวเลขยาว ๆ)
 *  - ถ้า LINE ไม่รับการ์ด ระบบส่งเป็นข้อความธรรมดาแทนให้อัตโนมัติ (ดู Line.gs)
 */

const FX = {
  band: '#1E3A5F',    // แถบหัวการ์ด
  bandText: '#FFFFFF',
  bandSub: '#D6E2F0',
  text: '#1F2937',
  sub: '#6B7280',
  muted: '#9CA3AF',
  line: '#E5E7EB',
  green: '#15803D',
  amber: '#B45309',
  red: '#B91C1C',
};

/** ข้อความ 1 ช่อง — LINE ไม่รับข้อความว่าง จึงแทนด้วย "-" */
function fxText_(text, o) {
  const s = text === null || text === undefined ? '' : String(text);
  const t = { type: 'text', text: s.trim() ? s : '-' };
  if (o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') t[k] = o[k];
    });
  }
  return t;
}

function fxBox_(layout, contents, o) {
  const list = (contents || []).filter(Boolean);
  const b = { type: 'box', layout: layout, contents: list.length ? list : [fxText_('-', { size: 'xs', color: FX.muted })] };
  if (o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') b[k] = o[k];
    });
  }
  return b;
}

function fxSep_(margin) {
  return { type: 'separator', margin: margin || 'md', color: FX.line };
}

/** หัวข้อย่อยในการ์ด เช่น "⚖️ ตัน" */
function fxSection_(title) {
  return fxText_(title, { size: 'sm', weight: 'bold', color: FX.text, margin: 'lg' });
}

/** หมายเหตุตัวเล็กสีเทา */
function fxNote_(text, color) {
  return fxText_(text, { size: 'xs', color: color || FX.muted, wrap: true, margin: 'md' });
}

/** cell: "ข้อความ" หรือ { t, color, bold } */
function fxCell_(cell, col, rowBold) {
  const c = cell !== null && typeof cell === 'object' ? cell : { t: cell };
  return fxText_(c.t, {
    size: col.size || 'sm',
    flex: col.flex || 1,
    align: col.align === 'end' || col.align === 'center' ? col.align : undefined,
    color: c.color || col.color,
    weight: c.bold || rowBold ? 'bold' : undefined,
    wrap: col.wrap ? true : undefined,
  });
}

/**
 * ตาราง: cols = [{ label, flex, align: 'end', wrap }]
 *        rows = [[cell, ...]] หรือ { cells: [...], bold: true } หรือ 'sep' (เส้นคั่น)
 */
function fxTable_(cols, rows, o) {
  const opt = o || {};
  const out = [];
  if (!opt.noHead) {
    out.push(fxBox_('horizontal', cols.map(function (c) {
      return fxText_(c.label, { size: 'xxs', color: FX.muted, flex: c.flex || 1, weight: 'bold',
        align: c.align === 'end' || c.align === 'center' ? c.align : undefined });
    }), { spacing: 'sm' }));
    out.push(fxSep_('sm'));
  }
  rows.forEach(function (r) {
    if (r === 'sep') { out.push(fxSep_('sm')); return; }
    const cells = Array.isArray(r) ? r : r.cells;
    out.push(fxBox_('horizontal', cells.map(function (cell, j) { return fxCell_(cell, cols[j] || {}, !Array.isArray(r) && r.bold); }),
      { spacing: 'sm', margin: 'sm' }));
  });
  return fxBox_('vertical', out, { margin: opt.margin || 'md' });
}

/** รายการ ป้าย : ค่า (ค่าชิดขวา) — pairs = [[label, value, { color, bold }]] */
function fxKV_(pairs, o) {
  return fxBox_('vertical', pairs.filter(Boolean).map(function (p) {
    if (p === 'sep') return fxSep_('sm');
    const st = p[2] || {};
    return fxBox_('horizontal', [
      fxText_(p[0], { size: 'sm', color: FX.sub, flex: 5 }),
      fxText_(p[1], { size: 'sm', color: st.color || FX.text, flex: 6, align: 'end', weight: st.bold ? 'bold' : undefined }),
    ], { margin: 'sm' });
  }), { margin: (o && o.margin) || 'md' });
}

/**
 * การ์ด 1 ใบ: { title, lines: [บรรทัดรองในแถบหัว], body: [components], footer: 'หมายเหตุ' }
 */
function fxBubble_(o) {
  const head = [fxText_(o.title, { size: 'lg', weight: 'bold', color: FX.bandText, wrap: true })];
  (o.lines || []).forEach(function (l) {
    if (l) head.push(fxText_(l, { size: 'xs', color: FX.bandSub, wrap: true, margin: 'xs' }));
  });
  const bubble = {
    type: 'bubble',
    size: o.size || 'giga',
    header: fxBox_('vertical', head, { paddingAll: 'lg', backgroundColor: FX.band }),
    body: fxBox_('vertical', o.body, { paddingAll: 'lg', paddingTop: 'md' }),
  };
  if (o.footer) {
    bubble.footer = fxBox_('vertical', [fxText_(o.footer, { size: 'xs', color: FX.muted, wrap: true })],
      { paddingAll: 'lg', paddingTop: 'none' });
  }
  return bubble;
}

/** ข้อความ Flex — ใหญ่เกินที่ LINE รับ (bubble ≤ 30KB) จะส่งเป็นข้อความธรรมดาแทน */
function fxMessage_(altText, bubble) {
  const alt = truncate_(String(altText || 'รายงาน').replace(/\s+/g, ' ').trim(), 400);
  if (utf8Bytes_(JSON.stringify(bubble)) > FLEX_MAX_BYTES) {
    return { type: 'text', text: truncate_(flexToText_(bubble), 4900) };
  }
  return { type: 'flex', altText: alt, contents: bubble };
}

const FLEX_MAX_BYTES = 25000;

function utf8Bytes_(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** แปลงการ์ดเป็นข้อความธรรมดา (สำรองเมื่อ LINE ไม่รับ / ใช้ในการทดสอบ) */
function flexToText_(node) {
  if (!node) return '';
  if (node.type === 'flex') return flexToText_(node.contents);
  if (node.type === 'carousel') return node.contents.map(flexToText_).join('\n\n');
  if (node.type === 'bubble') {
    return ['header', 'body', 'footer'].map(function (k) { return node[k] ? flexToText_(node[k]) : ''; })
      .filter(Boolean).join('\n\n');
  }
  if (node.type === 'text') return node.text || '';
  if (node.type !== 'box') return '';
  if (node.layout === 'vertical') {
    const out = [];
    node.contents.forEach(function (c) {
      const s = flexToText_(c);
      if (!s) return;
      if (out.length && /^(lg|xl|xxl)$/.test(c.margin || '')) out.push('');
      out.push(s);
    });
    return out.join('\n');
  }
  const cells = node.contents.map(flexToText_).filter(Boolean).map(function (t) { return t.split('\n'); });
  const rows = Math.max.apply(null, cells.map(function (c) { return c.length; }).concat([0]));
  const out = [];
  for (let i = 0; i < rows; i++) {
    out.push(cells.map(function (c) { return c[i] || ''; }).filter(Boolean).join(' · '));
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- ตัวเลขในการ์ด

/** ตัน: ทศนิยม 1 ตำแหน่ง (น้อยกว่า 1 ตัน ใช้ 2 ตำแหน่ง) */
function fmtTon_(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return fmtNum_(n, Math.abs(n) < 1 && n !== 0 ? 2 : 1);
}

/** บาท → ล้านบาท ทศนิยม 2 ตำแหน่ง */
function fmtMB_(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return fmtNum_(n / 1e6, 2);
}

function fmtPct_(p, digits) {
  if (p === null || p === undefined || isNaN(p)) return '-';
  return fmtNum_(p, digits === undefined ? 0 : digits) + '%';
}

/** สัดส่วน: ไม่ถึง 1% แสดง "<1%" (ไม่ให้ดูเหมือน 0) */
function fmtShare_(p) {
  if (p === null || p === undefined || isNaN(p)) return '-';
  return p > 0 && p < 1 ? '<1%' : fmtPct_(p);
}

/** +12.3 / −4.5 */
function fmtSigned_(n, f) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return (n > 0 ? '+' : n < 0 ? '−' : '') + (f || fmtTon_)(Math.abs(n));
}

/** สีตาม % คาดปิด: ≥100 เขียว, 95–99 ส้ม, <95 แดง */
function pctColor_(p) {
  if (p === null || p === undefined || isNaN(p)) return FX.text;
  return p >= 100 ? FX.green : p >= 95 ? FX.amber : FX.red;
}
