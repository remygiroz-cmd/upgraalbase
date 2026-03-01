/**
 * PlanningExportCapture
 * Composant offscreen pour la capture PNG HD du planning mensuel.
 * Pas de compression A4 — taille naturelle, font lisible, zoomable.
 * html2canvas capture scrollWidth × scrollHeight à scale 2.5.
 */
import React from 'react';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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

  // Jours du mois
  const daysArray = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = getDayOfWeekAdj(date);
    daysArray.push({ day: d, date, dow, dayLabel: DAYS_FR[dow], dateStr: getLocalDateStr(year, month, d) });
  }

  // Lookups
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

  const empCount = employees.length;
  // Largeur colonne : assez large pour "18:45–21:55" en police 11px
  const colW = Math.max(120, Math.min(180, Math.floor(1600 / Math.max(empCount, 1))));

  const fontSize = 11;
  const fontSizeSmall = 11;
  const fontSizeXS = 10;

  const dayColW = 58;
  const totalWidth = dayColW + empCount * colW + 24;

  // Format export : "L. BAKRI"
  const empLabel = (emp) => {
    const initial = emp.first_name?.trim()?.[0]?.toUpperCase();
    const nom = emp.last_name?.trim()?.toUpperCase() || '';
    return initial ? `${initial}. ${nom}` : nom;
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: '-99999px',
        top: 0,
        background: '#ffffff',
        width: `${totalWidth}px`,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: `${fontSize}px`,
        color: '#111111',
        zIndex: -1,
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Titre */}
      <div style={{
        marginBottom: 10,
        fontWeight: 'bold',
        fontSize: 16,
        borderBottom: '2px solid #1f2937',
        paddingBottom: 5,
        color: '#1f2937',
      }}>
        Planning {monthName} {year}
        <span style={{ fontWeight: 'normal', fontSize: 11, color: '#6b7280', marginLeft: 12 }}>
          — Généré le {new Date().toLocaleDateString('fr-FR')} via UpGraal
        </span>
      </div>

      {/* Tableau */}
      <table style={{
        borderCollapse: 'collapse',
        width: '100%',
        tableLayout: 'fixed',
      }}>
        <colgroup>
          <col style={{ width: dayColW }} />
          {employees.map(e => <col key={e.id} style={{ width: colW }} />)}
        </colgroup>

        {/* En-tête employés */}
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{
              border: '1px solid #d1d5db',
              padding: '4px 5px',
              textAlign: 'left',
              fontSize: fontSizeSmall,
              fontWeight: 'bold',
              color: '#374151',
              whiteSpace: 'nowrap',
            }}>
              Jour
            </th>
            {employees.map(emp => (
              <th key={emp.id} style={{
                border: '1px solid #d1d5db',
                padding: '3px 3px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: fontSizeSmall,
                color: '#1f2937',
                whiteSpace: 'nowrap',
              }}>
                {empLabel(emp)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {daysArray.map(({ day, dow, dayLabel, dateStr }) => {
            const isWeekend = dow >= 5;
            const isHoliday = holidaySet.has(dateStr);
            const rowBg = isHoliday ? '#faf5ff' : isWeekend ? '#fff7ed' : '#ffffff';
            const dayColor = isHoliday ? '#7c3aed' : isWeekend ? '#ea580c' : '#374151';

            return (
              <tr key={day} style={{ background: rowBg }}>
                {/* Colonne jour */}
                <td style={{
                  border: '1px solid #e5e7eb',
                  padding: '3px 5px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  fontSize: fontSizeSmall,
                  color: dayColor,
                }}>
                  {dayLabel} {day}
                  {isHoliday && (
                    <span style={{ fontSize: fontSizeXS, marginLeft: 3 }}>★</span>
                  )}
                </td>

                {/* Colonnes employés */}
                {employees.map(emp => {
                  const dayShifts = shiftsLookup[`${emp.id}_${dateStr}`] || [];
                  const dayNonShifts = nonShiftLookup[`${emp.id}_${dateStr}`] || [];

                  return (
                    <td key={emp.id} style={{
                      border: '1px solid #e5e7eb',
                      padding: '2px 2px',
                      verticalAlign: 'top',
                      overflow: 'visible',
                    }}>
                      {/* Non-shifts */}
                      {dayNonShifts.map(ns => {
                        const type = (nonShiftTypes || []).find(t => t.id === ns.non_shift_type_id);
                        const bg = type?.color || '#fee2e2';
                        return (
                          <div key={ns.id} style={{
                            display: 'block',
                            width: '100%',
                            boxSizing: 'border-box',
                            background: bg,
                            borderRadius: 2,
                            padding: '1px 3px',
                            marginBottom: 1,
                            fontSize: fontSizeSmall,
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            overflow: 'visible',
                            color: '#1f2937',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {type?.code || type?.label?.substring(0, 4) || 'ABS'}
                          </div>
                        );
                      })}

                      {/* Shifts */}
                      {dayShifts.map(s => {
                        const pos = (positions || []).find(p => p.id === s.position || p.name === s.position);
                        const bg = pos?.color || '#dbeafe';
                        return (
                          <div key={s.id} style={{
                            display: 'block',
                            width: '100%',
                            boxSizing: 'border-box',
                            background: bg,
                            borderRadius: 2,
                            padding: '1px 3px',
                            marginBottom: 1,
                            fontSize: fontSizeSmall,
                            whiteSpace: 'nowrap',
                            overflow: 'visible',
                            color: '#1f2937',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {s.start_time?.substring(0, 5)}–{s.end_time?.substring(0, 5)}
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
    </div>
  );
});

export default PlanningExportCapture;