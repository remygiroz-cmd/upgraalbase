import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get current time in Paris timezone
    const now = new Date();
    const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const currentHour = parisTime.getHours();
    const currentMinute = parisTime.getMinutes();
    const today = parisTime.toISOString().split('T')[0];
    
    // Determine time slot - trigger at 14h30 and 23h00
    let timeSlot;
    if (currentHour === 14 && currentMinute >= 30) {
      timeSlot = 'afternoon'; // 14h30
    } else if (currentHour === 23 && currentMinute >= 0) {
      timeSlot = 'evening'; // 23h00
    } else {
      return Response.json({ 
        message: 'Not a scheduled time (14h30 or 23h00)',
        currentHour,
        currentMinute
      });
    }
    
    // Get all snapshots for today
    const snapshots = await base44.asServiceRole.entities.TemperatureSnapshot.filter({ date: today });
    
    // Check if there's already a recording in the time slot (within 1 hour window)
    const hasExistingRecording = snapshots.some(snap => {
      const recordedAt = new Date(snap.recorded_at);
      const recordedHour = recordedAt.getHours();
      
      if (timeSlot === 'afternoon') {
        return recordedHour >= 14 && recordedHour < 15; // 14h00-15h00
      } else {
        return recordedHour >= 22 && recordedHour < 24; // 22h00-00h00
      }
    });
    
    if (hasExistingRecording) {
      return Response.json({ 
        message: 'Recording already exists for this time slot',
        timeSlot 
      });
    }
    
    // Get all active equipment
    const equipment = await base44.asServiceRole.entities.Equipment.filter({ is_active: true }, 'order');
    
    if (equipment.length === 0) {
      return Response.json({ message: 'No active equipment found' });
    }
    
    // Create snapshot with default temperatures
    const snapshot = equipment.map(eq => {
      const defaultTemp = eq.type === 'positive' ? 3 : -18;
      const isCompliant = defaultTemp >= eq.target_min && defaultTemp <= eq.target_max;
      
      return {
        equipment_id: eq.id,
        equipment_name: eq.name,
        equipment_type: eq.type,
        morning_temp: defaultTemp,
        evening_temp: defaultTemp,
        target_min: eq.target_min,
        target_max: eq.target_max,
        morning_compliant: isCompliant,
        evening_compliant: isCompliant
      };
    });
    
    // Save snapshot
    await base44.asServiceRole.entities.TemperatureSnapshot.create({
      date: today,
      snapshot,
      recorded_by: 'système',
      recorded_by_name: 'Enregistrement automatique',
      recorded_at: new Date().toISOString()
    });
    
    // Create/update temperature records with default values
    const tempPromises = equipment.map(async (eq) => {
      const existing = await base44.asServiceRole.entities.Temperature.filter({
        equipment_id: eq.id,
        date: today
      });
      
      const defaultTemp = eq.type === 'positive' ? 3 : -18;
      const isCompliant = defaultTemp >= eq.target_min && defaultTemp <= eq.target_max;
      
      const data = {
        equipment_id: eq.id,
        date: today,
        morning_temp: defaultTemp,
        evening_temp: defaultTemp,
        target_min: eq.target_min,
        target_max: eq.target_max,
        morning_compliant: isCompliant,
        evening_compliant: isCompliant,
        morning_signed_by: 'système',
        morning_signed_by_name: 'Enregistrement automatique',
        morning_signed_at: new Date().toISOString(),
        evening_signed_by: 'système',
        evening_signed_by_name: 'Enregistrement automatique',
        evening_signed_at: new Date().toISOString()
      };
      
      if (existing.length > 0) {
        return base44.asServiceRole.entities.Temperature.update(existing[0].id, data);
      }
      return base44.asServiceRole.entities.Temperature.create(data);
    });
    
    await Promise.all(tempPromises);
    
    return Response.json({ 
      success: true,
      message: 'Automatic temperature recording completed',
      timeSlot,
      equipmentCount: equipment.length
    });
    
  } catch (error) {
    console.error('Error in auto record temperatures:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});