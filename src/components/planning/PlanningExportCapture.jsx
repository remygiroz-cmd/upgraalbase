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
              <tr key={day}>
                {/* Colonne jour */}
                <td style={{
                  border: '1px solid #dfe3ea',
                  padding: '0 6px',
                  height: 28,
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  fontSize: 10,
                  color: dayColor,
                  background: rowBg,
                  verticalAlign: 'middle',
                }}>
                  {dayLabel} {day}{isHoliday ? ' ★' : ''}
                </td>

                {/* Colonnes employés */}
                {employees.map(emp => {
                  const dayShifts = shiftsLookup[`${emp.id}_${dateStr}`] || [];
                  const dayNonShifts = nonShiftLookup[`${emp.id}_${dateStr}`] || [];

                  // Contenu unique : priorité non-shift, sinon 1er shift (cas rare multi-shifts → concat)
                  if (dayNonShifts.length > 0) {
                    const ns = dayNonShifts[0];
                    const type = (nonShiftTypes || []).find(t => t.id === ns.non_shift_type_id);
                    const bg = type?.color || '#fee2e2';
                    const label = type?.code || type?.label?.substring(0, 4) || 'ABS';
                    return (
                      <td key={emp.id} style={{
                        border: '1px solid #dfe3ea',
                        padding: 0,
                        height: 28,
                        verticalAlign: 'middle',
                        textAlign: 'center',
                        background: bg,
                      }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 'bold',
                          color: '#1f2937',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}>{label}</span>
                      </td>
                    );
                  }

                  if (dayShifts.length === 0) {
                    return (
                      <td key={emp.id} style={{
                        border: '1px solid #dfe3ea',
                        padding: 0,
                        height: 28,
                        background: '#ffffff',
                      }} />
                    );
                  }

                  // 1 ou plusieurs shifts
                  const pos = (positions || []).find(p => p.id === dayShifts[0].position || p.name === dayShifts[0].position);
                  const bg = pos?.color || '#dbeafe';

                  if (dayShifts.length === 1) {
                    const s = dayShifts[0];
                    return (
                      <td key={emp.id} style={{
                        border: '1px solid #dfe3ea',
                        padding: 0,
                        height: 28,
                        verticalAlign: 'middle',
                        textAlign: 'center',
                        background: bg,
                      }}>
                        <span style={{
                          fontSize: 10,
                          color: '#1f2937',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}>{s.start_time?.substring(0, 5)}–{s.end_time?.substring(0, 5)}</span>
                      </td>
                    );
                  }

                  // Multi-shifts : empiler sur 2 lignes, hauteur auto
                  return (
                    <td key={emp.id} style={{
                      border: '1px solid #dfe3ea',
                      padding: 0,
                      verticalAlign: 'middle',
                      textAlign: 'center',
                      background: bg,
                    }}>
                      {dayShifts.map((s, i) => (
                        <div key={s.id} style={{
                          fontSize: 9,
                          color: '#1f2937',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight: '14px',
                        }}>
                          {s.start_time?.substring(0, 5)}–{s.end_time?.substring(0, 5)}
                        </div>
                      ))}
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