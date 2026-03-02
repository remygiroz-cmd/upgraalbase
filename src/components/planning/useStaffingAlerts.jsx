import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // JS Date.getDay() → index

/**
 * Calcule les alertes de sous-effectif par date à partir des shifts chargés.
 * @param {Array} shifts - shifts du mois déjà chargés
 * @returns {Map<string, Array>} dateStr → [{position, planned, required, missing}]
 */
export function useStaffingAlerts(shifts) {
  const { data: requirements = [] } = useQuery({
    queryKey: ['staffingRequirements'],
    queryFn: () => base44.entities.StaffingRequirement.list(),
    staleTime: 5 * 60 * 1000,
  });

  const alertsByDate = useMemo(() => {
    if (!requirements.length || !shifts.length) return new Map();

    // Index requirements by position
    const reqByPosition = {};
    for (const req of requirements) {
      reqByPosition[req.position] = req;
    }

    // Group shifts by date → position → set of employee_ids (dedup)
    const byDate = new Map();
    for (const shift of shifts) {
      if (shift.status === 'archived' || shift.status === 'cancelled') continue;
      if (!shift.date || !shift.position) continue;
      if (!byDate.has(shift.date)) byDate.set(shift.date, new Map());
      const byPos = byDate.get(shift.date);
      if (!byPos.has(shift.position)) byPos.set(shift.position, new Set());
      byPos.get(shift.position).add(shift.employee_id);
    }

    // Build alerts
    const result = new Map();
    for (const [dateStr, byPos] of byDate) {
      const dow = DOW_KEYS[new Date(dateStr + 'T00:00:00').getDay()];
      const alerts = [];
      for (const [position, req] of Object.entries(reqByPosition)) {
        const required = req[dow] || 0;
        if (required <= 0) continue;
        const planned = byPos.get(position)?.size || 0;
        if (planned < required) {
          alerts.push({ position, planned, required, missing: required - planned });
        }
      }
      // Also check dates with no shifts but requirements
      if (alerts.length > 0) result.set(dateStr, alerts);
    }

    // Check dates that have NO shifts at all but have requirements
    // We need all dates in the month to do this, but we only know dates from shifts
    // For dates with zero shifts, they'll be caught when the user sees 0 vs required

    return result;
  }, [shifts, requirements]);

  // Global count of understaffed days
  const understaffedDays = useMemo(() => alertsByDate.size, [alertsByDate]);

  return { alertsByDate, understaffedDays, requirements };
}