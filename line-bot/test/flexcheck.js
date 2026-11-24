// ตรวจ Flex Message ให้ตรงสเปกของ LINE (กันส่งแล้ว LINE ตอบ 400) — เข้มกว่าของจริงเล็กน้อยเพื่อความปลอดภัย
const SPACING = /^(none|xs|sm|md|lg|xl|xxl|\d+px)$/;
const PADDING = /^(none|xs|sm|md|lg|xl|xxl|\d+px|\d+%)$/;
const TEXT_SIZE = /^(xxs|xs|sm|md|lg|xl|xxl|3xl|4xl|5xl|\d+px)$/;
const COLOR = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const KEYS = {
  bubble: ['type', 'size', 'direction', 'header', 'hero', 'body', 'footer', 'styles', 'action'],
  box: ['type', 'layout', 'contents', 'backgroundColor', 'borderColor', 'borderWidth', 'cornerRadius', 'width', 'maxWidth',
    'height', 'maxHeight', 'flex', 'spacing', 'margin', 'paddingAll', 'paddingTop', 'paddingBottom', 'paddingStart',
    'paddingEnd', 'position', 'offsetTop', 'offsetBottom', 'offsetStart', 'offsetEnd', 'action', 'justifyContent', 'alignItems'],
  text: ['type', 'text', 'flex', 'margin', 'size', 'align', 'gravity', 'wrap', 'lineSpacing', 'maxLines', 'weight', 'color',
    'style', 'decoration', 'action', 'adjustMode', 'scaling'],
  separator: ['type', 'margin', 'color'],
};

function fail(path, msg) { throw new Error('Flex ไม่ถูกต้องที่ ' + path + ': ' + msg); }

function bytes(s) { return Buffer.byteLength(s, 'utf8'); }

function checkKeys(node, type, path) {
  Object.keys(node).forEach((k) => { if (KEYS[type].indexOf(k) < 0) fail(path, 'มี key ที่ LINE ไม่รู้จัก: ' + k); });
}

function checkComponent(node, path, parentLayout) {
  if (!node || typeof node !== 'object') fail(path, 'ไม่ใช่ object');
  if (node.type === 'box') {
    checkKeys(node, 'box', path);
    if (['horizontal', 'vertical', 'baseline'].indexOf(node.layout) < 0) fail(path, 'layout ไม่ถูกต้อง ' + node.layout);
    if (!Array.isArray(node.contents) || !node.contents.length) fail(path, 'box ต้องมี contents');
    ['spacing', 'margin'].forEach((k) => { if (node[k] !== undefined && !SPACING.test(node[k])) fail(path, k + ' = ' + node[k]); });
    ['paddingAll', 'paddingTop', 'paddingBottom', 'paddingStart', 'paddingEnd'].forEach((k) => {
      if (node[k] !== undefined && !PADDING.test(node[k])) fail(path, k + ' = ' + node[k]);
    });
    if (node.backgroundColor !== undefined && !COLOR.test(node.backgroundColor)) fail(path, 'backgroundColor');
    if (node.flex !== undefined && !(Number.isInteger(node.flex) && node.flex >= 0)) fail(path, 'flex ต้องเป็นจำนวนเต็ม ≥ 0');
    node.contents.forEach((c, i) => checkComponent(c, path + '.contents[' + i + ']', node.layout));
    return;
  }
  if (node.type === 'text') {
    checkKeys(node, 'text', path);
    if (typeof node.text !== 'string' || !node.text.trim()) fail(path, 'text ว่าง');
    if (node.size !== undefined && !TEXT_SIZE.test(node.size)) fail(path, 'size = ' + node.size);
    if (node.margin !== undefined && !SPACING.test(node.margin)) fail(path, 'margin = ' + node.margin);
    if (node.weight !== undefined && ['regular', 'bold'].indexOf(node.weight) < 0) fail(path, 'weight');
    if (node.align !== undefined && ['start', 'end', 'center'].indexOf(node.align) < 0) fail(path, 'align');
    if (node.gravity !== undefined && ['top', 'bottom', 'center'].indexOf(node.gravity) < 0) fail(path, 'gravity');
    if (node.color !== undefined && !COLOR.test(node.color)) fail(path, 'color = ' + node.color);
    if (node.wrap !== undefined && typeof node.wrap !== 'boolean') fail(path, 'wrap ต้องเป็น boolean');
    if (node.flex !== undefined && !(Number.isInteger(node.flex) && node.flex >= 0)) fail(path, 'flex ต้องเป็นจำนวนเต็ม ≥ 0');
    return;
  }
  if (node.type === 'separator') {
    checkKeys(node, 'separator', path);
    if (parentLayout === 'baseline') fail(path, 'separator ใน baseline ไม่ได้');
    if (node.margin !== undefined && !SPACING.test(node.margin)) fail(path, 'margin');
    if (node.color !== undefined && !COLOR.test(node.color)) fail(path, 'color');
    return;
  }
  fail(path, 'ชนิดไม่รองรับ ' + node.type);
}

function checkBubble(b, path) {
  if (b.type !== 'bubble') fail(path, 'ต้องเป็น bubble');
  checkKeys(b, 'bubble', path);
  if (b.size !== undefined && ['nano', 'micro', 'deca', 'hecto', 'kilo', 'mega', 'giga'].indexOf(b.size) < 0) fail(path, 'size');
  ['header', 'hero', 'body', 'footer'].forEach((k) => { if (b[k]) checkComponent(b[k], path + '.' + k); });
  const size = bytes(JSON.stringify(b));
  if (size > 30000) fail(path, 'ใหญ่เกิน 30KB (' + size + ' bytes)');
}

function checkFlexMessage(m, path) {
  path = path || 'message';
  if (m.type !== 'flex') return;
  Object.keys(m).forEach((k) => { if (['type', 'altText', 'contents', 'quickReply', 'sender'].indexOf(k) < 0) fail(path, 'key ' + k); });
  if (typeof m.altText !== 'string' || !m.altText.trim() || m.altText.length > 400) fail(path, 'altText ต้องมี 1–400 ตัวอักษร');
  const c = m.contents;
  if (c.type === 'carousel') {
    if (!Array.isArray(c.contents) || !c.contents.length || c.contents.length > 12) fail(path, 'carousel 1–12 bubble');
    c.contents.forEach((b, i) => checkBubble(b, path + '.contents[' + i + ']'));
    if (bytes(JSON.stringify(c)) > 50000) fail(path, 'carousel ใหญ่เกิน 50KB');
  } else {
    checkBubble(c, path + '.contents');
  }
}

module.exports = { checkFlexMessage };
