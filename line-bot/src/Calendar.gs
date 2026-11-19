/** ปฏิทิน / agenda — ใช้ Google Calendar */

function calendar_() {
  const id = prop_('CALENDAR_ID', '');
  const cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('ไม่พบปฏิทิน CALENDAR_ID=' + id);
  return cal;
}

function getEvents_(start, end) {
  return calendar_().getEvents(start, end).map(function (ev) {
    return {
      id: ev.getId(),
      title: ev.getTitle(),
      start: toDate_(ev.getStartTime()),
      end: toDate_(ev.getEndTime()),
      allDay: ev.isAllDayEvent(),
      location: ev.getLocation() || '',
    };
  }).sort(function (a, b) { return (b.allDay - a.allDay) || (a.start - b.start); });
}

function createEvent_(ev, attendees, createdBy) {
  const cal = calendar_();
  const desc = 'สร้างจาก LINE โดย ' + createdBy +
    (attendees.length ? '\nผู้เกี่ยวข้อง: ' + attendees.map(function (a) { return a.name; }).join(', ') : '');
  const created = ev.allDay
    ? cal.createAllDayEvent(ev.title, ev.start, { description: desc })
    : cal.createEvent(ev.title, ev.start, ev.end, { description: desc });
  return created.getId();
}

function formatEventLine_(e) {
  const when = e.allDay ? 'ทั้งวัน' : fmtTime_(e.start) + '–' + fmtTime_(e.end);
  return '• ' + when + ' ' + e.title + (e.location ? ' 📍' + e.location : '');
}

function formatAgenda_(title, events, emptyText) {
  if (!events.length) return title + '\n' + (emptyText || 'ไม่มีนัด');
  return title + ' (' + events.length + ')\n' + events.map(formatEventLine_).join('\n');
}

/** agenda หลายวัน จัดกลุ่มตามวัน */
function formatAgendaDays_(title, events, from, days) {
  if (!events.length) return title + '\nไม่มีนัด';
  const out = [title + ' (' + events.length + ')'];
  for (let i = 0; i < days; i++) {
    const day = addDays_(from, i);
    const evs = events.filter(function (e) {
      const s = startOfDay_(e.start);
      const lastDay = e.allDay ? addDays_(startOfDay_(e.end), -1) : startOfDay_(e.end);
      return s <= day && day <= lastDay;
    });
    if (!evs.length) continue;
    out.push('\n' + fmtDate_(day));
    evs.forEach(function (e) { out.push(formatEventLine_(e)); });
  }
  return out.join('\n');
}
