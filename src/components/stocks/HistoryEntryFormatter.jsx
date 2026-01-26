import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Package } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function HistoryEntryFormatter({ entry }) {
  // Parse the details to extract ruptures, check, and à prendre
  const parseDetails = (details) => {
    const parts = {
      aPrendre: null,
      check: [],
      rupture: []
    };

    // Extract "À prendre: X articles"
    const aPrendreMatch = details.match(/À prendre: (\d+) articles/);
    if (aPrendreMatch) {
      parts.aPrendre = parseInt(aPrendreMatch[1]);
    }

    // Extract "Check: ..." and parse items
    const checkMatch = details.match(/Check: ([^|]+)/);
    if (checkMatch) {
      const checkStr = checkMatch[1].trim();
      if (checkStr !== 'Aucun') {
        parts.check = checkStr.split(' | ').map(item => item.trim()).filter(Boolean);
      }
    }

    // Extract "Rupture: ..." and parse items
    const ruptureMatch = details.match(/Rupture: (.+)$/);
    if (ruptureMatch) {
      const ruptureStr = ruptureMatch[1].trim();
      if (ruptureStr !== 'Aucune') {
        parts.rupture = ruptureStr.split(' | ').map(item => item.trim()).filter(Boolean);
      }
    }

    return parts;
  };

  const parsed = parseDetails(entry.details);
  const isCoursesFinished = entry.action === 'Courses terminées' || entry.details.includes('Courses terminées');

  if (!isCoursesFinished) {
    return (
      <div className="flex items-start gap-3 text-xs bg-gray-50 p-3 rounded-lg">
        <div className="flex-1">
          <div className="font-medium text-gray-900">{entry.details}</div>
          <div className="text-gray-500 mt-1">
            {entry.user_name} • {format(new Date(entry.timestamp), 'dd/MM/yyyy à HH:mm', { locale: fr })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-gray-900 text-sm">Courses terminées</h4>
        <Badge className="bg-green-100 text-green-800">✓ Complété</Badge>
      </div>

      {/* À Prendre */}
      {parsed.aPrendre !== null && (
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-gray-500" />
          <span className="text-xs text-gray-600">
            <span className="font-semibold">{parsed.aPrendre}</span> article{parsed.aPrendre > 1 ? 's' : ''} à chercher
          </span>
        </div>
      )}

      {/* Check */}
      {parsed.check.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700">Trouvés ({parsed.check.length})</span>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {parsed.check.map((item, idx) => (
              <Badge key={idx} className="bg-green-100 text-green-800 text-xs">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Rupture */}
      {parsed.rupture.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-xs font-semibold text-red-700">Ruptures ({parsed.rupture.length})</span>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {parsed.rupture.map((item, idx) => (
              <Badge key={idx} className="bg-red-100 text-red-800 text-xs font-semibold">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div className="text-gray-500 text-xs pt-2 border-t border-gray-100">
        {entry.user_name} • {format(new Date(entry.timestamp), 'dd/MM/yyyy à HH:mm', { locale: fr })}
      </div>
    </div>
  );
}