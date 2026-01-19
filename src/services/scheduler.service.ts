import cron from 'node-cron';
import { syncFinanceReserveData } from './financeReserveSync.service';

let syncJob: cron.ScheduledTask | null = null;

/**
 * Start the sync scheduler
 * Runs daily at 07:15 AM Dubai time (Asia/Dubai)
 */
export const startSyncScheduler = (): void => {
  // Cron expression: 15 7 * * * (07:15 AM daily)
  // Timezone: Asia/Dubai
  syncJob = cron.schedule(
    '52 17 * * *',
    async () => {
      const startTime = new Date();
      console.log(`\n🕐 Scheduled sync started at ${startTime.toISOString()} (Dubai time: ${startTime.toLocaleString('en-US', { timeZone: 'Asia/Dubai' })})`);
      
      try {
        const result = await syncFinanceReserveData();
        
        const endTime = new Date();
        const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
        
        if (result.success) {
          console.log(`✅ Scheduled sync completed successfully in ${duration}s`);
          console.log(`   Entities processed: ${result.entitiesProcessed}`);
          console.log(`   Records saved: ${result.recordsSaved}`);
          if (result.errors.length > 0) {
            console.log(`   ⚠️  Errors: ${result.errors.length}`);
            result.errors.forEach((error) => console.log(`      - ${error}`));
          }
        } else {
          console.error(`❌ Scheduled sync completed with errors in ${duration}s`);
          console.error(`   Entities processed: ${result.entitiesProcessed}`);
          console.error(`   Records saved: ${result.recordsSaved}`);
          result.errors.forEach((error) => console.error(`   - ${error}`));
        }
      } catch (error: any) {
        const endTime = new Date();
        const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
        console.error(`❌ Scheduled sync failed after ${duration}s:`, error.message || error);
        // Don't throw - let scheduler continue running
      }
    },
    {
      scheduled: true,
      timezone: 'Asia/Dubai',
    }
  );

  // Log next scheduled run time
  const now = new Date();
  const dubaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const nextRun = new Date(dubaiTime);
  nextRun.setHours(7, 15, 0, 0);
  
  // If it's already past 07:15 today, schedule for tomorrow
  if (dubaiTime.getHours() > 7 || (dubaiTime.getHours() === 7 && dubaiTime.getMinutes() >= 15)) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  console.log('📅 Sync scheduler started: Daily at 07:15 AM (Dubai time)');
  console.log(`   Next scheduled run: ${nextRun.toLocaleString('en-US', { timeZone: 'Asia/Dubai', dateStyle: 'full', timeStyle: 'short' })}`);
};

/**
 * Stop the sync scheduler
 */
export const stopSyncScheduler = (): void => {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
    console.log('🛑 Sync scheduler stopped');
  }
};

/**
 * Check if scheduler is running
 */
export const isSchedulerRunning = (): boolean => {
  return syncJob !== null;
};

