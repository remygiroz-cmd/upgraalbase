/**
 * Hook global pour charger le mode d'affichage des heures depuis AppSettings.
 * Partagé par tous les composants du planning.
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useHoursDisplayMode() {
  const { data = [] } = useQuery({
    queryKey: ['appSettings', 'hours_display_mode'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'hours_display_mode' }),
    staleTime: 60 * 1000
  });

  const mode = data[0]?.hours_display_mode || 'HHMM';
  return mode; // 'HHMM' | 'DECIMAL'
}