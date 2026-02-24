import moment from 'moment';

export function calcLoaStats(vehicle) {
  if (vehicle.propriete !== 'LOA') return null;
  const kmConsumed = (vehicle.km_actuel || 0) - (vehicle.km_initial || 0);
  const kmRestants = (vehicle.loa_km_total_autorises || 0) - kmConsumed;
  const today = moment();
  const dateFinLoa = vehicle.loa_date_fin ? moment(vehicle.loa_date_fin) : null;
  const joursRestants = dateFinLoa ? dateFinLoa.diff(today, 'days') : null;
  const budgetKmJour = joursRestants > 0 ? kmRestants / joursRestants : 0;
  const pctConsumed = vehicle.loa_km_total_autorises > 0
    ? Math.round((kmConsumed / vehicle.loa_km_total_autorises) * 100)
    : 0;

  let risque = 'VERT';
  if (budgetKmJour < 0 || pctConsumed > 95) risque = 'ROUGE';
  else if (pctConsumed > 80 || budgetKmJour < 30) risque = 'ORANGE';

  return { kmConsumed, kmRestants, joursRestants, budgetKmJour: Math.round(budgetKmJour), pctConsumed, risque };
}

export function getStatutBadge(statut) {
  const map = {
    ACTIF: { label: 'Actif', className: 'bg-green-100 text-green-800' },
    INDISPONIBLE: { label: 'Indisponible', className: 'bg-red-100 text-red-800' },
    ATELIER: { label: 'Atelier', className: 'bg-orange-100 text-orange-800' },
    RESERVE: { label: 'Réserve', className: 'bg-blue-100 text-blue-800' },
  };
  return map[statut] || { label: statut, className: 'bg-gray-100 text-gray-700' };
}

export function getRisqueBadge(risque) {
  const map = {
    VERT: { label: '🟢 OK', className: 'bg-green-100 text-green-800' },
    ORANGE: { label: '🟠 Vigilance', className: 'bg-orange-100 text-orange-800' },
    ROUGE: { label: '🔴 Risque', className: 'bg-red-100 text-red-800' },
  };
  return map[risque] || { label: risque, className: 'bg-gray-100 text-gray-700' };
}

export function isDocumentExpiringSoon(doc, daysThreshold = 30) {
  if (!doc.date_expiration) return false;
  const diff = moment(doc.date_expiration).diff(moment(), 'days');
  return diff <= daysThreshold;
}

export function isDocumentExpired(doc) {
  if (!doc.date_expiration) return false;
  return moment(doc.date_expiration).isBefore(moment(), 'day');
}

export function vehicleDisplayName(v) {
  if (!v) return 'Véhicule inconnu';
  return `${v.marque} ${v.modele} — ${v.immatriculation}`;
}

export function scoreVehicleForAssignment(vehicle, assignments30Days, loaStats) {
  let score = 100;
  if (vehicle.statut !== 'ACTIF') return -999;
  if (loaStats) {
    if (loaStats.risque === 'ROUGE') score -= 50;
    else if (loaStats.risque === 'ORANGE') score -= 20;
    if (loaStats.budgetKmJour < 20) score += 30; // Under-used, good to use
  }
  // Recent incident penalty (simple: count recent assignments with incidents)
  const recentWithIncidents = assignments30Days.filter(a =>
    a.vehicule_id === vehicle.id && a.non_conformite
  ).length;
  score -= recentWithIncidents * 10;
  return score;
}