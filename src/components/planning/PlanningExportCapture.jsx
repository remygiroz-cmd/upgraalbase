/**
 * PlanningExportCapture
 * Composant offscreen pour la capture PNG du planning mensuel.
 * Rendu en position fixe hors écran, fond blanc, police compressée.
 * Ref transmise au parent pour html2canvas.
 */
import React from 'react';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function getLocalDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDayOfWeekAdj(date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

const PlanningExportCapture = React.forwardRef(function PlanningExportCapture(
  { year, month, employees, shifts, nonShiftEvents, nonShiftTypes, positions, holidayDates, monthName },
  ref
) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build array of all days
  const daysArray = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = getDayOfWeekAdj(date);
    daysArray.push({ day: d, date, dow, dayLabel: DAYS_FR[dow], dateStr: getLocalDateStr(year, month, d) });
  }

  // Build lookup
  const shiftsLookup = {};
  for (const s of shifts) {
    const key = `${s.employee_id}_${s.date}`;
    if (!shiftsLookup[key]) shiftsLookup[key] = [];
    shiftsLookup[key].push(s);
  }
  const nonShiftLookup = {};
  for (const ns of nonShiftEvents) {
    const key = `${ns.employee_id}_${ns.date}`;
    if (!nonShiftLookup[key]) nonShiftLookup[key] = [];
    nonShiftLookup[key].push(ns);
  }

  const holidaySet = new Set((holidayDates || []).map(h => h.date || h));

  // Adaptive font size based on employee count
  const empCount = employees.length;
  const colW = Math.max(50, Math.min(90, Math.floor(900 / (empCount + 1))));
  const fontSize = empCount > 20 ? 7 : empCount > 14 ? 8 : 9;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: '-9999px',
        top: 0,
        background: '#ffffff',
        width: `${Math.max(900, (empCount + 1) * colW + 80)}px`,
        fontFamily: 'Arial, sans-serif',
        fontSize: `${fontSize}px`,
        color: '#111',
        zIndex: -1,
        padding: '12px',
      }}
    >
      {/* Title */}
      <div style={{ marginBottom: 6, fontWeight: 'bold', fontSize: 13, borderBottom: '2px solid #333', paddingBottom: 4 }}>
        Planning {monthName} {year}
      </div>

      {/* Table */}
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 52 }} />
          {employees.map(e => <col key={e.id} style={{ width: colW }} />)}
        </colgroup>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ border: '1px solid #ccc', padding: '2px 3px', textAlign: 'left', fontSize: fontSize - 1 }}>Jour</th>
            {employees.map(emp => (
              <th key={emp.id} style={{ border: '1px solid #ccc', padding: '2px 3px', textAlign: 'center', fontWeight: 'bold', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: fontSize - 1 }}>
                {emp.first_name} {emp.last_name?.charAt(0)}.
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {daysArray.map(({ day, dow, dayLabel, dateStr }) => {
            const isWeekend = dow >= 5;
            const isHoliday = holidaySet.has(dateStr);
            const rowBg = isHoliday ? '#fdf4ff' : isWeekend ? '#fff7ed' : '#fff';
            return (
              <tr key={day} style={{ background: rowBg }}>
                {/* Day cell */}
                <td style={{ border: '1px solid #e5e7eb', padding: '1px 3px', fontWeight: 'bold', whiteSpace: 'nowrap', fontSize: fontSize - 1 }}>
                  <span style={{ color: isHoliday ? '#7c3aed' : isWeekend ? '#ea580c' : '#374151' }}>
                    {dayLabel} {day}
                  </span>
                </td>
                {employees.map(emp => {
                  const dayShifts = shiftsLookup[`${emp.id}_${dateStr}`] || [];
                  const dayNonShifts = nonShiftLookup[`${emp.id}_${dateStr}`] || [];
                  return (
                    <td key={emp.id} style={{ border: '1px solid #e5e7eb', padding: '1px 2px', verticalAlign: 'top', overflow: 'hidden' }}>
                      {dayNonShifts.map(ns => {
                        const type = (nonShiftTypes || []).find(t => t.id === ns.non_shift_type_id);
                        return (
                          <div key={ns.id} style={{ background: type?.color || '#fee2e2', borderRadius: 2, padding: '0 2px', marginBottom: 1, fontSize: fontSize - 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {type?.code || type?.label?.substring(0,3) || 'ABS'}
                          </div>
                        );
                      })}
                      {dayShifts.map(s => {
                        const pos = (positions || []).find(p => p.id === s.position || p.name === s.position);
                        const bg = pos?.color || '#dbeafe';
                        return (
                          <div key={s.id} style={{ background: bg, borderRadius: 2, padding: '0 2px', marginBottom: 1, fontSize: fontSize - 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                            {s.start_time?.substring(0,5)}–{s.end_time?.substring(0,5)}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ marginTop: 6, fontSize: fontSize - 2, color: '#9ca3af', textAlign: 'right' }}>
        Généré le {new Date().toLocaleDateString('fr-FR')} via UpGraal
      </div>
    </div>
  );
});

export default PlanningExportCapture;