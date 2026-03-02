import React, { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const FR_DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${FR_DAYS[d.getDay()]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
}

function getWeekBounds() {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const diffToMon = (dow === 0) ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { weekStart: fmt(mon), weekEnd: fmt(sun) };
}

function buildSignature(weekStart, alertDays) {
  const parts = alertDays.flatMap(({ dateStr, alerts }) =>
    alerts.map(a => `${dateStr}:${a.position}:${a.missing}`)
  ).sort();
  return `${weekStart}|${parts.join('|')}`;
}

/**
 * Bandeau sous-effectif semaine en cours pour managers/admins.
 * Props:
 *   shifts: Array — shifts du mois déjà chargés (évite re-fetch)
 *   currentUser: object
 */
export default function WeeklyStaffingAlert({ shifts = [], currentUser }) {
  const navigate = useNavigate();
  const { weekStart, weekEnd } = useMemo(() => getWeekBounds(), []);

  const { data: requirements = [] } = useQuery({
    queryKey: ['staffingRequirements'],
    queryFn: () => base44.entities.StaffingRequirement.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Calculate alerts for the current week
  const alertDays = useMemo(() => {
    if (!requirements.length) return [];

    const reqByPosition = {};
    for (const req of requirements) {
      reqByPosition[req.position] = req;
    }

    // Group shifts in the week by date → position → employee_ids (dedup)
    const byDate = new Map();
    for (const shift of shifts) {
      if (shift.status === 'archived' || shift.status === 'cancelled') continue;
      if (!shift.date || !shift.position) continue;
      if (shift.date < weekStart || shift.date > weekEnd) continue;
      if (!byDate.has(shift.date)) byDate.set(shift.date, new Map());
      const byPos = byDate.get(shift.date);
      if (!byPos.has(shift.position)) byPos.set(shift.position, new Set());
      byPos.get(shift.position).add(shift.employee_id);
    }

    // Generate all days of the week to also catch days with 0 shifts
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      days.push(ds);
    }

    const result = [];
    for (const dateStr of days) {
      const dow = DOW_KEYS[new Date(dateStr + 'T00:00:00').getDay()];
      const byPos = byDate.get(dateStr) || new Map();
      const alerts = [];
      for (const [position, req] of Object.entries(reqByPosition)) {
        const required = req[dow] || 0;
        if (required <= 0) continue;
        const planned = byPos.get(position)?.size || 0;
        if (planned < required) {
          alerts.push({ position, planned, required, missing: required - planned });
        }
      }
      if (alerts.length > 0) {
        // Sort alerts by missing desc
        alerts.sort((a, b) => b.missing - a.missing);
        result.push({ dateStr, alerts });
      }
    }

    return result;
  }, [shifts, requirements, weekStart, weekEnd]);

  const signature = useMemo(() => buildSignature(weekStart, alertDays), [weekStart, alertDays]);

  // Dismiss logic
  const storageKey = `dismissed_week_staffing_signature_${currentUser?.email || 'unknown'}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === signature && signature !== `${weekStart}|`;
    } catch { return false; }
  });

  // Re-check if signature changed (new manques)
  const isDismissed = dismissed && (() => {
    try { return localStorage.getItem(storageKey) === signature; } catch { return false; }
  })();

  const handleDismiss = useCallback((e) => {
    e.stopPropagation();
    try { localStorage.setItem(storageKey, signature); } catch {}
    setDismissed(true);
  }, [storageKey, signature]);

  const handleClick = useCallback(() => {
    // Navigate to Planning, ideally focused on the first alert day
    const firstAlertDate = alertDays[0]?.dateStr;
    const token = Date.now();
    const url = createPageUrl('Planning') + (firstAlertDate ? `?focus=${firstAlertDate}&t=${token}` : `?focus=today&t=${token}`);
    navigate(url);
  }, [alertDays, navigate]);

  if (!alertDays.length || isDismissed) return null;

  return (
    <div
      onClick={handleClick}
      className="relative cursor-pointer rounded-xl border border-orange-300 bg-orange-50 px-4 py-4 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-full text-orange-400 hover:text-orange-700 hover:bg-orange-100 transition-colors"
        title="Masquer"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pr-6">
        <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
        <h3 className="font-bold text-orange-800 text-sm">
          Sous-effectif détecté cette semaine
        </h3>
      </div>

      {/* Detail per day */}
      <div className="space-y-3 mb-3">
        {alertDays.map(({ dateStr, alerts }) => (
          <div key={dateStr}>
            <p className="font-semibold text-orange-900 text-xs mb-1">
              {formatDayLabel(dateStr)}
            </p>
            <ul className="space-y-0.5 pl-3">
              {alerts.map((a) => (
                <li key={a.position} className="text-xs text-orange-800 flex items-center gap-1.5">
                  <span className="text-orange-400">•</span>
                  <span className="font-medium">{a.position}</span>
                  <span className="text-red-600 font-bold">-{a.missing}</span>
                  <span className="text-orange-600">({a.planned} / {a.required})</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-900 transition-colors">
        <span>Ouvrir le planning</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}