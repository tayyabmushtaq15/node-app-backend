import cron from 'node-cron';
import { syncFinanceReserveData } from './financeReserveSync.service';
import { syncYesterdayCollectionData } from './sales-collection.service';
import { syncYesterdayRevenueData } from './revenue-reservation.service';
import { syncProcurementData } from './procurement-sync.service';
import { syncExpensePaidoutData } from './expense-paidout-sync.service';
import { syncInstagramData } from './instagram-sync.service';

interface SyncResult {
  name: string;
  success: boolean;
  duration: number;
  recordsSaved?: number;
  recordsSkipped?: number;
  entitiesProcessed?: number;
  errors: string[];
}

let syncJob: cron.ScheduledTask | null = null;

/**
 * Log summary of all sync results
 */
const logSyncSummary = (results: SyncResult[], overallStartTime: Date): void => {
  const overallEndTime = new Date();
  const totalDuration = Math.round((overallEndTime.getTime() - overallStartTime.getTime()) / 1000);
  
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalRecordsSaved = results.reduce((sum, r) => sum + (r.recordsSaved || 0), 0);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SYNC SUMMARY');
  console.log('='.repeat(60));
  console.log(`⏱️  Total Duration: ${totalDuration}s`);
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  console.log(`📝 Total Records Saved: ${totalRecordsSaved.toLocaleString()}`);
  console.log('-'.repeat(60));
  
  results.forEach((result) => {
    const status = result.success ? '✅' : '❌';
    const recordsInfo = result.recordsSaved !== undefined 
      ? `Records: ${result.recordsSaved.toLocaleString()}` 
      : result.entitiesProcessed !== undefined 
        ? `Entities: ${result.entitiesProcessed}, Records: ${(result.recordsSaved || 0).toLocaleString()}`
        : '';
    
    console.log(`${status} ${result.name.padEnd(25)} | ${result.duration}s | ${recordsInfo}`);
    
    if (result.errors.length > 0) {
      result.errors.slice(0, 3).forEach((error) => {
        console.log(`   ⚠️  ${error}`);
      });
      if (result.errors.length > 3) {
        console.log(`   ... and ${result.errors.length - 3} more errors`);
      }
    }
  });
  
  console.log('='.repeat(60) + '\n');
};

/**
 * Start the sync scheduler
 * Runs daily at 09:30 AM Dubai time (Asia/Dubai)
 */
export const startSyncScheduler = (): void => {
  // Cron expression: 30 09 * * * (07:15 AM daily)
  // Timezone: Asia/Dubai
  syncJob = cron.schedule(
    '30 09 * * *',
    async () => {
      const overallStartTime = new Date();
      console.log(`\n🕐 Scheduled sync started at ${overallStartTime.toISOString()} (Dubai time: ${overallStartTime.toLocaleString('en-US', { timeZone: 'Asia/Dubai' })})`);
      
      const results: SyncResult[] = [];
      
      // Sync 1: Finance Reserve
      let syncStartTime = new Date();
      try {
        syncStartTime = new Date();
        console.log('\n📊 Starting Finance Reserve sync...');
        const result = await syncFinanceReserveData();
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        
        results.push({
          name: 'Finance Reserve',
          success: result.success,
          duration,
          recordsSaved: result.recordsSaved,
          entitiesProcessed: result.entitiesProcessed,
          errors: result.errors,
        });
        
        if (result.success) {
          console.log(`✅ Finance Reserve sync completed in ${duration}s`);
        } else {
          console.error(`❌ Finance Reserve sync completed with errors in ${duration}s`);
        }
      } catch (error: any) {
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        console.error(`❌ Finance Reserve sync failed after ${duration}s:`, error.message || error);
        results.push({
          name: 'Finance Reserve',
          success: false,
          duration,
          errors: [error.message || 'Unknown error'],
        });
      }
      
      // Sync 2: Sales Collection
      syncStartTime = new Date();
      try {
        syncStartTime = new Date();
        console.log('\n📊 Starting Sales Collection sync...');
        const result = await syncYesterdayCollectionData();
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        
        results.push({
          name: 'Sales Collection',
          success: result.success,
          duration,
          recordsSaved: result.recordsSaved,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
        });
        
        if (result.success) {
          console.log(`✅ Sales Collection sync completed in ${duration}s`);
        } else {
          console.error(`❌ Sales Collection sync completed with errors in ${duration}s`);
        }
      } catch (error: any) {
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        console.error(`❌ Sales Collection sync failed after ${duration}s:`, error.message || error);
        results.push({
          name: 'Sales Collection',
          success: false,
          duration,
          errors: [error.message || 'Unknown error'],
        });
      }
      
      // Sync 3: Revenue Reservation
      syncStartTime = new Date();
      try {
        syncStartTime = new Date();
        console.log('\n📊 Starting Revenue Reservation sync...');
        const result = await syncYesterdayRevenueData();
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        
        results.push({
          name: 'Revenue Reservation',
          success: result.success,
          duration,
          recordsSaved: result.recordsSaved,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
        });
        
        if (result.success) {
          console.log(`✅ Revenue Reservation sync completed in ${duration}s`);
        } else {
          console.error(`❌ Revenue Reservation sync completed with errors in ${duration}s`);
        }
      } catch (error: any) {
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        console.error(`❌ Revenue Reservation sync failed after ${duration}s:`, error.message || error);
        results.push({
          name: 'Revenue Reservation',
          success: false,
          duration,
          errors: [error.message || 'Unknown error'],
        });
      }
      
      // Sync 4: Procurement
      syncStartTime = new Date();
      try {
        syncStartTime = new Date();
        console.log('\n📊 Starting Procurement sync...');
        const result = await syncProcurementData();
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        
        results.push({
          name: 'Procurement',
          success: result.success,
          duration,
          recordsSaved: result.recordsSaved,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
        });
        
        if (result.success) {
          console.log(`✅ Procurement sync completed in ${duration}s`);
        } else {
          console.error(`❌ Procurement sync completed with errors in ${duration}s`);
        }
      } catch (error: any) {
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        console.error(`❌ Procurement sync failed after ${duration}s:`, error.message || error);
        results.push({
          name: 'Procurement',
          success: false,
          duration,
          errors: [error.message || 'Unknown error'],
        });
      }
      
      // Sync 5: Expense Paidout (sync last 30 days)
      syncStartTime = new Date();
      try {
        syncStartTime = new Date();
        console.log('\n📊 Starting Expense Paidout sync (30 days)...');
        const result = await syncExpensePaidoutData(30);
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        
        results.push({
          name: 'Expense Paidout',
          success: result.success,
          duration,
          recordsSaved: result.recordsSaved,
          entitiesProcessed: result.entitiesProcessed,
          errors: result.errors,
        });
        
        if (result.success) {
          console.log(`✅ Expense Paidout sync completed in ${duration}s`);
        } else {
          console.error(`❌ Expense Paidout sync completed with errors in ${duration}s`);
        }
      } catch (error: any) {
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        console.error(`❌ Expense Paidout sync failed after ${duration}s:`, error.message || error);
        results.push({
          name: 'Expense Paidout',
          success: false,
          duration,
          errors: [error.message || 'Unknown error'],
        });
      }
      
      // Sync 6: Instagram
      syncStartTime = new Date();
      try {
        syncStartTime = new Date();
        console.log('\n📊 Starting Instagram sync...');
        await syncInstagramData();
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        
        // Instagram sync returns void, so if no exception is thrown, consider it successful
        results.push({
          name: 'Instagram',
          success: true,
          duration,
          recordsSaved: 1, // Assume 1 record saved if sync completes without error
          errors: [],
        });
        
        console.log(`✅ Instagram sync completed in ${duration}s`);
      } catch (error: any) {
        const syncEndTime = new Date();
        const duration = Math.round((syncEndTime.getTime() - syncStartTime.getTime()) / 1000);
        console.error(`❌ Instagram sync failed after ${duration}s:`, error.message || error);
        results.push({
          name: 'Instagram',
          success: false,
          duration,
          errors: [error.message || 'Unknown error'],
        });
      }
      
      // Log summary
      logSyncSummary(results, overallStartTime);
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
  nextRun.setHours(9, 30, 0, 0);
  
  console.log('📅 Sync scheduler started: Daily at 09:30 AM (Dubai time)');
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

