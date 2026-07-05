import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ─── Event color palette ──────────────────────────────────────────────────────
const EVENT_COLORS = {
  payment_paid:      { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-800 border-green-200',  icon: 'payments',        label: 'Paiement' },
  payment_late:      { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-800 border-red-200',        icon: 'warning',         label: 'Paiement en retard' },
  payment_upcoming:  { dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-800 border-amber-200',  icon: 'schedule',        label: 'Paiement à venir' },
  contract:          { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800 border-orange-200', icon: 'description',   label: 'Contrat' },
  inspection:        { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-800 border-blue-200',     icon: 'fact_check',      label: 'Inspection' },
  maintenance:       { dot: 'bg-red-600',    badge: 'bg-red-100 text-red-800 border-red-200',        icon: 'build',           label: 'Maintenance' },
  insurance:         { dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800 border-purple-200', icon: 'shield',        label: 'Assurance' },
};

const LEGEND = [
  { key: 'payment_upcoming', label: 'Paiements' },
  { key: 'contract',         label: 'Contrats' },
  { key: 'inspection',       label: 'Inspections' },
  { key: 'maintenance',      label: 'Maintenance' },
  { key: 'insurance',        label: 'Assurances' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDate(str) {
  if (!str) return null;
  // ISO: yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    // force local date to avoid UTC shift
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  // dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const [day, month, year] = str.split('/');
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return null;
}

function toKey(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  d.setDate(1);
  return d;
}

// Returns Monday-based weekday index (0=Mon … 6=Sun)
function mondayWeekday(date) {
  return (date.getDay() + 6) % 7;
}

const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

// ─── Collect all events from app state ────────────────────────────────────────
function collectEvents({ contracts = [], payments = [], inspections = [], tickets = [], insurances = [] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const events = [];

  // Payments
  for (const p of payments) {
    const date = parseDate(p.dueDate);
    if (!date) continue;
    const key = toKey(date);
    let type = 'payment_upcoming';
    if (p.status === 'Payé') type = 'payment_paid';
    else if (p.status === 'Impayé' || p.status === 'En retard') type = 'payment_late';
    events.push({
      key, date, type,
      title: `Loyer — ${p.tenantName || p.propertyName || ''}`,
      sub: p.amount ? fmt(p.amount) : (p.status || ''),
      raw: p,
      sortDate: date,
    });
  }

  // Contracts expiring
  for (const c of contracts) {
    const date = parseDate(c.endDate);
    if (!date) continue;
    const key = toKey(date);
    events.push({
      key, date, type: 'contract',
      title: `Fin de bail — ${c.propertyName || ''}`,
      sub: c.tenant || c.status || '',
      raw: c,
      sortDate: date,
    });
  }

  // Inspections
  for (const i of inspections) {
    const date = parseDate(i.date);
    if (!date) continue;
    const key = toKey(date);
    events.push({
      key, date, type: 'inspection',
      title: `Inspection — ${i.propertyName || ''}`,
      sub: i.type || i.tenantName || '',
      raw: i,
      sortDate: date,
    });
  }

  // Maintenance tickets (urgent only shown in red, others also included)
  for (const t of tickets) {
    const date = parseDate(t.createdAt);
    if (!date) continue;
    const key = toKey(date);
    events.push({
      key, date, type: 'maintenance',
      title: `Ticket — ${t.title || t.property || ''}`,
      sub: t.priority || t.status || '',
      raw: t,
      sortDate: date,
    });
  }

  // Insurances expiring
  for (const ins of insurances) {
    const date = parseDate(ins.endDate);
    if (!date) continue;
    const key = toKey(date);
    events.push({
      key, date, type: 'insurance',
      title: `Assurance — ${ins.propertyName || ''}`,
      sub: ins.insurer || '',
      raw: ins,
      sortDate: date,
    });
  }

  return events;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function EventDot({ type }) {
  const cfg = EVENT_COLORS[type] || EVENT_COLORS.payment_upcoming;
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />;
}

function EventBadge({ event }) {
  const cfg = EVENT_COLORS[event.type] || EVENT_COLORS.payment_upcoming;
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 ${cfg.badge}`}>
      <Icon name={cfg.icon} size={18} className="flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm leading-tight truncate">{event.title}</p>
        {event.sub && (
          <p className="text-xs mt-0.5 opacity-75 truncate">{event.sub}</p>
        )}
        <p className="text-xs mt-0.5 opacity-60">
          {event.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
    </div>
  );
}

function DayCell({ day, isCurrentMonth, isToday, isSelected, events, onClick }) {
  const visible = events.slice(0, 3);
  const overflow = events.length - 3;

  return (
    <button
      onClick={onClick}
      className={[
        'relative min-h-[72px] p-1.5 rounded-lg border text-left transition-all duration-150 w-full',
        isCurrentMonth ? 'bg-surface hover:bg-surface-container' : 'bg-transparent opacity-40',
        isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-outline-variant/40',
        isToday && !isSelected ? 'border-primary/60 bg-primary/5' : '',
      ].join(' ')}
    >
      <span className={[
        'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold mb-1',
        isToday ? 'bg-primary text-white' : 'text-on-surface',
      ].join(' ')}>
        {day}
      </span>
      <div className="flex flex-wrap gap-0.5">
        {visible.map((ev, i) => <EventDot key={i} type={ev.type} />)}
        {overflow > 0 && (
          <span className="text-[10px] text-on-surface-variant leading-none self-center">+{overflow}</span>
        )}
      </div>
    </button>
  );
}

// ─── Main Calendar Component ──────────────────────────────────────────────────
export default function Calendar() {
  const { state } = useApp();
  const { contracts = [], payments = [], inspections = [], tickets = [], insurances = [] } = state;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState(null); // "YYYY-MM-DD" key

  // All events indexed by day key
  const allEvents = useMemo(
    () => collectEvents({ contracts, payments, inspections, tickets, insurances }),
    [contracts, payments, inspections, tickets, insurances]
  );

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of allEvents) {
      if (!map[ev.key]) map[ev.key] = [];
      map[ev.key].push(ev);
    }
    return map;
  }, [allEvents]);

  // Calendar grid
  const { calendarDays, daysInMonth } = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const dim = new Date(year, month + 1, 0).getDate();
    const firstWeekday = mondayWeekday(new Date(year, month, 1));

    const cells = [];
    // Leading empty cells
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    // Actual days
    for (let d = 1; d <= dim; d++) cells.push(d);
    // Trailing empty cells to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    return { calendarDays: cells, daysInMonth: dim };
  }, [currentMonth]);

  // Upcoming events (next 10 from today)
  const upcomingEvents = useMemo(() => {
    return allEvents
      .filter(ev => ev.sortDate >= today)
      .sort((a, b) => a.sortDate - b.sortDate)
      .slice(0, 10);
  }, [allEvents, today]);

  // Selected day events
  const selectedEvents = useMemo(() => {
    if (!selectedDay) return [];
    return eventsByDay[selectedDay] || [];
  }, [selectedDay, eventsByDay]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const todayKey = toKey(today);

  function goToPrev() { setCurrentMonth(m => addMonths(m, -1)); setSelectedDay(null); }
  function goToNext() { setCurrentMonth(m => addMonths(m, 1)); setSelectedDay(null); }
  function goToToday() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setCurrentMonth(d);
    setSelectedDay(todayKey);
  }

  function handleDayClick(day) {
    if (!day) return;
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDay(prev => prev === key ? null : key);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h5 font-bold text-on-surface flex items-center gap-2">
            <Icon name="calendar_month" size={28} />
            Calendrier
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Vue d'ensemble de toutes les échéances</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrev}
            className="p-2 rounded-lg border border-outline-variant hover:bg-surface-container transition-colors"
            title="Mois précédent"
          >
            <Icon name="chevron_left" size={20} />
          </button>
          <button
            onClick={goToToday}
            className="px-4 py-2 rounded-lg border border-outline-variant text-sm font-medium hover:bg-surface-container transition-colors text-on-surface"
          >
            Mois en cours
          </button>
          <button
            onClick={goToNext}
            className="p-2 rounded-lg border border-outline-variant hover:bg-surface-container transition-colors"
            title="Mois suivant"
          >
            <Icon name="chevron_right" size={20} />
          </button>
        </div>
      </div>

      {/* ── Month title ── */}
      <h2 className="text-xl font-semibold text-on-surface capitalize">
        {MONTH_NAMES[month]} {year}
      </h2>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4">
        {LEGEND.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5 text-sm text-on-surface-variant">
            <span className={`w-2.5 h-2.5 rounded-full ${EVENT_COLORS[key].dot}`} />
            {label}
          </div>
        ))}
      </div>

      <div className="flex gap-4 items-start">
        {/* ── Calendar grid ── */}
        <div className="flex-1 min-w-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-on-surface-variant py-1">
                {d}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="min-h-[72px]" />;
              }
              const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const events = eventsByDay[key] || [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              return (
                <DayCell
                  key={key}
                  day={day}
                  isCurrentMonth={true}
                  isToday={isToday}
                  isSelected={isSelected}
                  events={events}
                  onClick={() => handleDayClick(day)}
                />
              );
            })}
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="w-72 flex-shrink-0 space-y-4">
          {/* Selected day panel */}
          {selectedDay && (
            <div className="bg-surface-container rounded-xl border border-outline-variant p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-on-surface text-sm">
                  {(() => {
                    const [y, m, d] = selectedDay.split('-');
                    return new Date(Number(y), Number(m) - 1, Number(d))
                      .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                  })()}
                </h3>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="p-1 rounded hover:bg-surface-container-highest transition-colors"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              {selectedEvents.length === 0 ? (
                <div className="text-center py-6 text-on-surface-variant">
                  <Icon name="event_available" size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun événement ce jour</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedEvents.map((ev, i) => (
                    <EventBadge key={i} event={ev} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upcoming events */}
          <div className="bg-surface-container rounded-xl border border-outline-variant p-4">
            <h3 className="font-semibold text-on-surface text-sm mb-3 flex items-center gap-2">
              <Icon name="upcoming" size={18} />
              Prochaines échéances
            </h3>
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-6 text-on-surface-variant">
                <Icon name="event_available" size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Aucune échéance à venir</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {upcomingEvents.map((ev, i) => (
                  <button
                    key={i}
                    className="w-full text-left"
                    onClick={() => {
                      // Navigate to the month of this event and select the day
                      const evMonth = new Date(ev.date.getFullYear(), ev.date.getMonth(), 1);
                      setCurrentMonth(evMonth);
                      setSelectedDay(ev.key);
                    }}
                  >
                    <EventBadge event={ev} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
