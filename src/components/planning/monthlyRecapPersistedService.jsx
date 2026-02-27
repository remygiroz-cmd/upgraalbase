import { base44 } from '@/api/base44Client';

export async function getRecapPersisted(monthKey, employeeId) {
  const results = await base44.entities.MonthlyRecapPersisted.filter({
    month_key: monthKey,
    employee_id: employeeId
  });
  return results[0] || null;
}

export async function deleteRecapPersisted(monthKey, employeeId) {
  const existing = await getRecapPersisted(monthKey, employeeId);
  if (existing) {
    await base44.entities.MonthlyRecapPersisted.delete(existing.id);
  }
}