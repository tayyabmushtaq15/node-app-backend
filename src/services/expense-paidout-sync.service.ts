import mongoose from 'mongoose';
import pLimit from 'p-limit';
import Entity from '../models/entities.model';
import FinanceExpensePaidout from '../models/finance-expense-paidout.model';
import {
  getPaidoutSummaryWithRetry,
  getDynamicsToken,
} from './dynamicsApi.service';

interface SyncResult {
  success: boolean;
  entitiesProcessed: number;
  recordsSaved: number;
  errors: string[];
  dataSource: string;
}

const DATA_SOURCE = 'MSD Paidout API sync';

/**
 * Transform API response data to Finance Expense Paidout format
 */
const transformApiData = (
  apiData: any[],
  entityId: mongoose.Types.ObjectId | null,
  date: Date,
  dataSource: string
): any => {
  // Find data for the specific entity if entityId is provided
  let entityData = null;
  
  if (entityId && apiData.length > 0) {
    // If we have entityId, try to find matching company data
    // Note: API might return filtered data when DataAreaId is used
    entityData = apiData.find((item: any) => {
      // If API filtered by DataAreaId, first item should be the entity data
      return item.Company || apiData[0];
    }) || apiData[0];
  } else if (apiData.length > 0) {
    // Aggregate data - use first item or sum all
    entityData = apiData[0];
  }

  if (!entityData) {
    // Return empty record if no data
    return {
      entity: entityId,
      date,
      Ops_Expenses: 0,
      Land_Expenses: 0,
      Construction_Expenses: 0,
      cash_expense: 0,
      Currency: 'AED',
      data_source: dataSource,
      last_sync_date_time: new Date(),
    };
  }

  return {
    entity: entityId,
    date,
    Ops_Expenses: parseFloat(entityData.OperationPaidout || 0) || 0,
    Land_Expenses: parseFloat(entityData.LandPurchasePaidout || 0) || 0,
    Construction_Expenses: parseFloat(entityData.ConstructionPaidout || 0) || 0,
    cash_expense: parseFloat(entityData.CashExpense || 0) || 0,
    Currency: 'AED',
    data_source: dataSource,
    last_sync_date_time: new Date(),
  };
};

/**
 * Sync expense paidout data for all entities for the past N days
 * @param days Number of days to sync (default: 30)
 */
export const syncExpensePaidoutData = async (
  days: number = 30
): Promise<SyncResult> => {
  const result: SyncResult = {
    success: true,
    entitiesProcessed: 0,
    recordsSaved: 0,
    errors: [],
    dataSource: DATA_SOURCE,
  };

  try {
    console.log(`🔄 Starting Expense Paidout Sync for ${days} days...`);

    // Get token once
    const token = await getDynamicsToken();
    if (!token) {
      throw new Error('Failed to acquire Dynamics token');
    }

    // Fetch all entities
    const entities = await Entity.find().lean();
    console.log(`📋 Found ${entities.length} entities to process`);

    if (entities.length === 0) {
      console.warn('⚠️ No entities found in database');
      return result;
    }

    // Generate array of past N days (from yesterday going back)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates: Date[] = [];
    
    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      dates.push(date);
    }

    console.log(
      `📅 Processing ${dates.length} days (from ${dates[dates.length - 1].toISOString().split('T')[0]} to ${dates[0].toISOString().split('T')[0]})`
    );

    // Create tasks for each entity/day combination
    const tasks: Array<{ entity: any; date: Date }> = [];
    for (const entity of entities) {
      for (const date of dates) {
        tasks.push({ entity, date });
      }
    }

    console.log(
      `📦 Created ${tasks.length} tasks (${entities.length} entities × ${dates.length} days)`
    );

    // Use p-limit with concurrency of 20
    const limit = pLimit(20);
    const bulkOps: any[] = [];

    // Process all tasks with concurrency limit
    const taskPromises = tasks.map(({ entity, date }) =>
      limit(async () => {
        try {
          // Set fromDate and toDate to the same value (the target date)
          const fromDate = new Date(date);
          fromDate.setHours(0, 0, 0, 0);
          const toDate = new Date(date);
          toDate.setHours(23, 59, 59, 999);

          // Call API for this entity and date
          const expenseData = await getPaidoutSummaryWithRetry(
            token,
            fromDate,
            toDate,
            entity.entityCode
          );

          if (!expenseData || expenseData.length === 0) {
            // Save empty record to track that we attempted sync
            const emptyRecord = transformApiData(
              [],
              entity._id,
              date,
              DATA_SOURCE
            );
            bulkOps.push({
              updateOne: {
                filter: {
                  entity: entity._id,
                  date: date,
                  data_source: DATA_SOURCE,
                },
                update: { $set: emptyRecord },
                upsert: true,
              },
            });
            return;
          }

          // Transform and add to bulk operations
          const record = transformApiData(
            expenseData,
            entity._id,
            date,
            DATA_SOURCE
          );

          bulkOps.push({
            updateOne: {
              filter: {
                entity: record.entity,
                date: record.date,
                data_source: record.data_source,
              },
              update: { $set: record },
              upsert: true,
            },
          });

          result.entitiesProcessed++;
        } catch (error: any) {
          const errorMsg = `Error processing entity ${entity.entityCode} for date ${date.toISOString().split('T')[0]}: ${error.message}`;
          result.errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      })
    );

    // Wait for all tasks to complete
    await Promise.all(taskPromises);

    // Execute bulk write
    if (bulkOps.length > 0) {
      const writeResult = await FinanceExpensePaidout.bulkWrite(bulkOps, {
        ordered: false,
      });

      result.recordsSaved = writeResult.upsertedCount + writeResult.modifiedCount;
    }

    console.log(`✅ Expense Paidout Sync Completed`);
    console.log(`   Entities processed: ${result.entitiesProcessed}`);
    console.log(`   Records saved: ${result.recordsSaved}`);
    console.log(`   Errors: ${result.errors.length}`);

    result.success = result.errors.length === 0 || result.recordsSaved > 0;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Sync failed: ${error.message}`);
    console.error('❌ Critical error in Expense Paidout Sync:', error);
  }

  return result;
};

