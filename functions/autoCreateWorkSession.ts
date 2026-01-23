import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admin can call this function
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Check if a session already exists for today
    const existingSessions = await base44.asServiceRole.entities.WorkSession.filter({ 
      date: today 
    });

    if (existingSessions.length > 0) {
      return Response.json({ 
        message: 'Session already exists for today',
        session: existingSessions[0]
      });
    }

    // Get all active tasks with auto_schedule enabled
    const allTasks = await base44.asServiceRole.entities.Task.filter({ 
      is_active: true 
    });

    // Get day of week (0 = Sunday, 6 = Saturday)
    const dayOfWeek = new Date().getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayName = dayNames[dayOfWeek];

    // Get current time
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute; // Convert to minutes since midnight

    // Filter tasks that should be added today
    const tasksToAdd = [];
    
    for (const task of allTasks) {
      if (!task.auto_schedule?.enabled) continue;
      if (!task.auto_schedule?.schedules) continue;

      // Check if this task has a schedule for today
      for (const schedule of task.auto_schedule.schedules) {
        if (schedule.trigger_day !== currentDayName) continue;

        // Parse time range
        const [startHour, startMin] = schedule.trigger_time_start.split(':').map(Number);
        const [endHour, endMin] = schedule.trigger_time_end.split(':').map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        // Check if current time is within the trigger window
        if (currentTime >= startTime && currentTime <= endTime) {
          tasksToAdd.push({
            task_id: task.id,
            task_name: task.name,
            category_id: task.category_id,
            is_completed: false,
            added_at: new Date().toISOString(),
            quantity_to_produce: schedule.quantity || 1,
            initial_quantity_to_produce: schedule.quantity || 1
          });
          break; // Only add once per task
        }
      }
    }

    if (tasksToAdd.length === 0) {
      return Response.json({ 
        message: 'No tasks scheduled for this time window',
        time: `${currentHour}:${currentMinute}`
      });
    }

    // Get categories for task names
    const categories = await base44.asServiceRole.entities.Category.list();
    tasksToAdd.forEach(task => {
      const category = categories.find(c => c.id === task.category_id);
      if (category) {
        task.category_name = category.name;
      }
    });

    // Create the work session
    const session = await base44.asServiceRole.entities.WorkSession.create({
      date: today,
      status: 'active',
      tasks: tasksToAdd,
      started_by: user.email,
      started_by_name: user.full_name || user.email,
      started_at: new Date().toISOString()
    });

    return Response.json({ 
      message: 'Work session created successfully',
      session,
      tasksCount: tasksToAdd.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});