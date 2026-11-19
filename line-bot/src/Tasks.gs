/** งานติดตาม (follow-up tasks) */

function taskFromRow_(r) {
  const v = r.v;
  return {
    row: r.row,
    id: Number(v[0]),
    text: String(v[1]),
    owner: String(v[2] || ''),
    ownerIds: splitIds_(v[3]),
    due: toDate_(v[4]),
    status: String(v[5] || STATUS_OPEN),
    createdBy: String(v[6] || ''),
    createdAt: toDate_(v[7]),
    doneAt: toDate_(v[8]),
    doneBy: String(v[9] || ''),
  };
}

function getTasks_() {
  return rows_(sheet_(TASK_SHEET, TASK_HEADERS)).map(taskFromRow_);
}

function openTasks_() {
  return getTasks_().filter(function (t) { return t.status !== STATUS_DONE; });
}

function addTask_(text, due, owners, createdBy) {
  return withLock_(function () {
    const sh = sheet_(TASK_SHEET, TASK_HEADERS);
    const id = nextId_(sh);
    sh.appendRow([
      id, text,
      owners.map(function (o) { return o.name; }).join(', '),
      owners.map(function (o) { return o.userId; }).filter(Boolean).join(','),
      due || '', STATUS_OPEN, createdBy, now_(), '', '',
    ]);
    return id;
  });
}

/** คืน { done: [task], missing: [id] } */
function completeTasks_(ids, byName) {
  return withLock_(function () {
    const sh = sheet_(TASK_SHEET, TASK_HEADERS);
    const tasks = rows_(sh).map(taskFromRow_);
    const done = [];
    const missing = [];
    ids.forEach(function (id) {
      const t = tasks.find(function (x) { return x.id === id; });
      if (!t || t.status === STATUS_DONE) { missing.push(id); return; }
      sh.getRange(t.row, 6).setValue(STATUS_DONE);
      sh.getRange(t.row, 9).setValue(now_());
      sh.getRange(t.row, 10).setValue(byName);
      done.push(t);
    });
    return { done: done, missing: missing };
  });
}

function deleteTask_(id) {
  return withLock_(function () {
    const sh = sheet_(TASK_SHEET, TASK_HEADERS);
    const t = rows_(sh).map(taskFromRow_).find(function (x) { return x.id === id; });
    if (!t) return null;
    sh.deleteRow(t.row);
    return t;
  });
}

function rescheduleTask_(id, due) {
  return withLock_(function () {
    const sh = sheet_(TASK_SHEET, TASK_HEADERS);
    const t = rows_(sh).map(taskFromRow_).find(function (x) { return x.id === id; });
    if (!t) return null;
    sh.getRange(t.row, 5).setValue(due);
    t.due = due;
    return t;
  });
}

function sortTasks_(tasks) {
  return tasks.slice().sort(function (a, b) {
    if (a.due && b.due) return a.due - b.due || a.id - b.id;
    if (a.due) return -1;
    if (b.due) return 1;
    return a.id - b.id;
  });
}

function formatTaskLine_(t, now) {
  return '#' + t.id + ' ' + t.text + (t.owner ? ' — ' + t.owner : '') + ' (' + dueLabel_(t.due, now) + ')';
}

function formatTaskList_(title, tasks, now, max) {
  if (!tasks.length) return title + '\nไม่มีงานค้าง 🎉';
  const limit = max || 30;
  const sorted = sortTasks_(tasks);
  const lines = sorted.slice(0, limit).map(function (t) { return '• ' + formatTaskLine_(t, now); });
  if (sorted.length > limit) lines.push('…และอีก ' + (sorted.length - limit) + ' งาน');
  const overdue = tasks.filter(function (t) { return t.due && dayDiff_(t.due, now) < 0; }).length;
  return title + ' ' + tasks.length + ' งาน' + (overdue ? ' (เลยกำหนด ' + overdue + ')' : '') + '\n' + lines.join('\n');
}

function isMine_(t, user) {
  if (user.userId && t.ownerIds.indexOf(user.userId) >= 0) return true;
  const names = t.owner.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  // เทียบชื่อเฉพาะงานที่มีผู้รับผิดชอบแบบพิมพ์ชื่อเอง (ไม่มี userId ครบทุกคน)
  if (t.ownerIds.length >= names.length) return false;
  return !!user.name && names.indexOf(user.name) >= 0;
}
