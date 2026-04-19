import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [
    shifts, nonShiftEvents, weeklyRecaps, paidLeave,
    swaps, leaveReqs, templateWeeks, templateShifts
  ] = await Promise.all([
    base44.asServiceRole.entities.Shift.list('-date', 10000),
    base44.asServiceRole.entities.NonShiftEvent.list('-date', 5000),
    base44.asServiceRole.entities.WeeklyRecap.list('-week_start', 2000),
    base44.asServiceRole.entities.PaidLeavePeriod.list('-cp_start_date', 1000),
    base44.asServiceRole.entities.ShiftSwapRequest.list('-created_date', 1000),
    base44.asServiceRole.entities.LeaveRequest.list('-created_date', 1000),
    base44.asServiceRole.entities.TemplateWeek.list(),
    base44.asServiceRole.entities.TemplateShift.list(),
  ]);

  return Response.json({
    Shift: shifts,
    NonShiftEvent: nonShiftEvents,
    WeeklyRecap: weeklyRecaps,
    PaidLeavePeriod: paidLeave,
    ShiftSwapRequest: swaps,
    LeaveRequest: leaveReqs,
    TemplateWeek: templateWeeks,
    TemplateShift: templateShifts,
  });
});