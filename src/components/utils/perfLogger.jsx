/**
 * UpGraal — Perf Logger
 * =====================
 * Mesure la durée, le nombre d'items et la source (cache vs réseau) de chaque fetch
 * React Query critique.
 *
 * Usage :
 *   import { perfFetch, printPerfReport } from '@/components/utils/perfLogger';
 *
 *   queryFn: () => perfFetch('employees', () => base44.entities.Employee.list()),
 *
 * En console, après le chargement, tapez :
 *   __perfReport()
 * pour afficher le top-10 des appels les plus lents.
 *
 * Activation : toujours actif en développement.
 *              En prod : localStorage.setItem('PERF_LOG', '1') pour activer.
 */

const enabled = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || localStorage.getItem('PERF_LOG') === '1');

// Registry des mesures — persiste entre les re-renders
const _registry = [];

/**
 * Wrapper autour d'une queryFn.
 *
 * @param {string}   label    - Nom lisible du fetch (ex: 'shifts', 'employees')
 * @param {function} fetchFn  - La vraie queryFn qui retourne une Promise<data>
 * @param {object}   [meta]   - Infos supplémentaires loggées ({page, monthKey, ...})
 * @returns {Promise<any>}    - Résultat de fetchFn (pass-through)
 */
export async function perfFetch(label, fetchFn, meta = {}) {
  if (!enabled()) return fetchFn();

  const t0 = performance.now();
  const result = await fetchFn();
  const ms = Math.round(performance.now() - t0);

  const count = Array.isArray(result) ? result.length : (result ? 1 : 0);
  const entry = { label, ms, count, meta, ts: Date.now() };

  _registry.push(entry);

  const metaStr = Object.keys(meta).length
    ? ' ' + Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';

  const badge = ms > 2000 ? '🔴' : ms > 800 ? '🟡' : '🟢';
  console.log(`${badge} [Perf] ${label.padEnd(28)} ${String(ms).padStart(5)}ms   ${String(count).padStart(5)} items${metaStr}`);

  return result;
}

/**
 * Affiche le rapport complet trié par durée décroissante.
 * Appelable depuis la console : __perfReport()
 */
export function printPerfReport() {
  if (!_registry.length) {
    console.log('[Perf] Aucune mesure enregistrée. Activez avec localStorage.setItem("PERF_LOG","1")');
    return;
  }

  const sorted = [..._registry].sort((a, b) => b.ms - a.ms);
  const total = sorted.reduce((s, e) => s + e.ms, 0);

  console.group(`\n📊 UpGraal Perf Report — ${sorted.length} fetch(es) — total séquentiel: ${total}ms`);
  console.log('Rang  Label                        Durée   Items   Infos');
  console.log('─'.repeat(70));

  sorted.slice(0, 10).forEach((e, i) => {
    const metaStr = Object.entries(e.meta).map(([k, v]) => `${k}=${v}`).join(', ');
    const badge = e.ms > 2000 ? '🔴' : e.ms > 800 ? '🟡' : '🟢';
    console.log(
      `${badge} #${String(i + 1).padEnd(3)} ${e.label.padEnd(28)} ${String(e.ms).padStart(5)}ms  ${String(e.count).padStart(5)}  ${metaStr}`
    );
  });

  console.log('─'.repeat(70));
  console.log(`💡 Top coûteux: "${sorted[0]?.label}" (${sorted[0]?.ms}ms, ${sorted[0]?.count} items)`);
  console.groupEnd();
}

/**
 * Remet à zéro le registry (utile lors des changements de page).
 */
export function resetPerfRegistry() {
  _registry.length = 0;
}

// Exposer globalement pour usage console
if (typeof window !== 'undefined') {
  window.__perfReport = printPerfReport;
  window.__perfReset = resetPerfRegistry;
  window.__perfRegistry = _registry;
}