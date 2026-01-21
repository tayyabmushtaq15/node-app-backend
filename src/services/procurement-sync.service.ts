import mongoose from 'mongoose';
import pLimit from 'p-limit';
import Entity from '../models/entities.model';
import ProcurementPurchaseOrder from '../models/procurement-purchase-order.model';
import {
  getProcurementDataWithRetry,
  getDynamicsToken,
} from './dynamicsApi.service';
import { getYesterdayDate } from '../utils/dateUtils';

interface SyncResult {
  success: boolean;
  entitiesProcessed: number;
  recordsSaved: number;
  recordsSkipped: number;
  errors: string[];
}

/**
 * Transform API response data to Procurement Purchase Order format
 */
const transformApiData = (
  apiData: any[],
  entityId: mongoose.Types.ObjectId,
  dataAreaId: string
): any[] => {
  if (!Array.isArray(apiData) || apiData.length === 0) {
    return [];
  }

  return apiData.map((item: any) => {
    // Validate required fields
    if (!item.PurchId || !item.vendorAccount || !item.vendorName || item.totalAmount === undefined) {
      return null;
    }

    return {
      purchId: item.PurchId.toUpperCase(),
      entityId: entityId,
      venderAccount: (item.vendorAccount || '').toUpperCase(),
      venderName: item.vendorName || '',
      totalAmount: parseFloat(item.totalAmount) || 0,
      dataAreaId: dataAreaId.toUpperCase(),
      dataSource: 'Dynamics365' as const,
      currency: (item.Currency || 'AED').toUpperCase(),
      purchaseOrderStatus: item.PurchaseOrderStatus || 'None',
      approvalStatus: item.ApprovalStatus || 'Draft',
      createdTimestamp: item.CreatedDateTime ? new Date(item.CreatedDateTime) : new Date(),
      lastSyncDateTime: new Date(),
    };
  }).filter((item: any) => item !== null); // Remove invalid items
};

/**
 * Sync procurement purchase order data for all entities for yesterday's date
 */
export const syncProcurementData = async (): Promise<SyncResult> => {
  const result: SyncResult = {
    success: true,
    entitiesProcessed: 0,
    recordsSaved: 0,
    recordsSkipped: 0,
    errors: [],
  };

  try {
    console.log('🔄 Starting Procurement Purchase Order Sync...');

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

    // Get yesterday's date in yyyy-mm-dd format
    const yesterdayDate = getYesterdayDate();
    console.log(`📅 Syncing data for date: ${yesterdayDate}`);

    // Get all existing purchase order IDs in one query
    const existingPurchIds = await ProcurementPurchaseOrder.find({}, { purchId: 1 }).lean();
    const existingIdsSet = new Set(existingPurchIds.map((order) => order.purchId));
    console.log(`📊 Found ${existingIdsSet.size} existing purchase orders in database`);

    // Use p-limit with concurrency of 20
    const limit = pLimit(20);
    const validItems: any[] = [];

    // Process all entities with concurrency limit
    const taskPromises = entities.map((entity) =>
      limit(async () => {
        try {
          // Call API for this entity and yesterday's date
          const procurementData = await getProcurementDataWithRetry(
            token,
            yesterdayDate,
            yesterdayDate,
            entity.entityCode
          );

          if (!procurementData || procurementData.length === 0) {
            console.log(`⚠️ No procurement data received for entity ${entity.entityCode}`);
            return;
          }

          // Transform API data
          const records = transformApiData(
            procurementData,
            entity._id,
            entity.entityCode
          );

          if (records.length === 0) {
            console.log(`⚠️ No valid records after transformation for entity ${entity.entityCode}`);
            return;
          }

          // Filter out duplicates
          for (const record of records) {
            if (existingIdsSet.has(record.purchId)) {
              result.recordsSkipped++;
            } else {
              validItems.push(record);
              existingIdsSet.add(record.purchId); // Add to set to prevent duplicates within this sync
            }
          }

          result.entitiesProcessed++;
        } catch (error: any) {
          const errorMsg = `Error processing entity ${entity.entityCode}: ${error.message}`;
          result.errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      })
    );

    // Wait for all tasks to complete
    await Promise.all(taskPromises);

    // Perform bulk insert if we have valid items
    if (validItems.length > 0) {
      try {
        console.log(`📝 Performing bulk insert of ${validItems.length} purchase orders...`);
        const insertResult = await ProcurementPurchaseOrder.insertMany(validItems, {
          ordered: false, // Continue inserting even if some fail
        });
        result.recordsSaved = insertResult.length;
        console.log(`✅ Successfully saved ${result.recordsSaved} purchase orders`);
      } catch (error: any) {
        if (error.code === 11000) {
          // Handle duplicate key errors - process individually
          console.log('⚠️ Some records already exist, processing individually...');
          let saved = 0;
          let skipped = 0;

          for (const doc of validItems) {
            try {
              await ProcurementPurchaseOrder.create(doc);
              saved++;
            } catch (individualError: any) {
              if (individualError.code === 11000) {
                skipped++;
              } else {
                console.error(`❌ Error saving purchase order ${doc.purchId}:`, individualError.message);
                result.errors.push(`Error saving ${doc.purchId}: ${individualError.message}`);
              }
            }
          }

          result.recordsSaved = saved;
          result.recordsSkipped += skipped;
        } else {
          console.error('❌ Bulk insert failed:', error.message);
          result.errors.push(`Bulk insert failed: ${error.message}`);
          result.success = false;
        }
      }
    }

    console.log(`✅ Procurement sync completed:`);
    console.log(`   Entities processed: ${result.entitiesProcessed}`);
    console.log(`   Records saved: ${result.recordsSaved}`);
    console.log(`   Records skipped: ${result.recordsSkipped}`);
    console.log(`   Errors: ${result.errors.length}`);

    result.success = result.errors.length === 0 || result.recordsSaved > 0;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Sync failed: ${error.message}`);
    console.error('❌ Critical error in Procurement Sync:', error);
  }

  return result;
};

