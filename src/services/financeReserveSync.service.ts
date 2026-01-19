import mongoose from 'mongoose';
import pLimit from 'p-limit';
import Entity from '../models/entities.model';
import FinanceReserveBank from '../models/finance-reserve-bank.model';
import {
  getBankGroupSummaryWithRetry,
  getDynamicsToken,
} from './dynamicsApi.service';
import { getYesterdayDate, isValidDateFormat } from '../utils/dateUtils';

/*                              TYPES                                         */

interface SyncResult {
  success: boolean;
  entitiesProcessed: number;
  recordsSaved: number;
  errors: string[];
  dataSource: string;
}


/*                         DATA TRANSFORMATION                                 */

const transformApiData = (
  apiData: any,
  entityId: mongoose.Types.ObjectId | null,
  date: string,
  dataSource: string
) => {
  let escrow = 0;
  let nonEscrow = 0;
  let other = 0;
  let total = 0;

  const rows = Array.isArray(apiData)
    ? apiData
    : apiData?.data || [];

  for (const row of rows) {
    const group = row.BankGroupId || '';
    const amount = Number(row.totalAmount || 0);

    if (group === 'ES') escrow += amount;
    else if (group === 'NonES') nonEscrow += amount;
    else other += amount;

    total += amount;
  }

  if (total === 0) return [];

  return [{
    entity: entityId,
    date,
    EscrowReserve: escrow,
    NonEscrowReserve: nonEscrow,
    OtherReserve: other,
    TotalReserve: total,
    Currency: 'AED',
    dataSource,
    lastSyncDateTime: new Date(),
  }];
};

/*                           MAIN SYNC FUNCTION                                */

export const syncFinanceReserveData = async (
  date?: string
): Promise<SyncResult> => {

  const DATA_SOURCE = 'MSD Bank Group Summary sync';

  const result: SyncResult = {
    success: true,
    entitiesProcessed: 0,
    recordsSaved: 0,
    errors: [],
    dataSource: DATA_SOURCE,
  };

  try {
    const syncDate = date
      ? isValidDateFormat(date)
        ? date
        : (() => { throw new Error('Invalid date format'); })()
      : getYesterdayDate();

    console.log(`🔄 Sync started for ${syncDate}`);

    const token = await getDynamicsToken();
    if (!token) throw new Error('Failed to acquire Dynamics token');

    const entities = await Entity.find().lean();
    console.log(`📋 Entities found: ${entities.length}`);

    const limit = pLimit(6);
    const bulkOps: any[] = [];

    const tasks = entities.map(entity =>
      limit(async () => {
        const apiData = await getBankGroupSummaryWithRetry(
          token,
          syncDate,
          syncDate,
          entity.entityCode
        );

        if (!apiData) return;

        const records = transformApiData(
          apiData,
          entity._id,
          syncDate,
          DATA_SOURCE
        );

        if (!records.length) return;

        result.entitiesProcessed++;

        for (const record of records) {
          bulkOps.push({
            updateOne: {
              filter: {
                entity: record.entity,
                date: record.date,
                dataSource: record.dataSource,
              },
              update: { $set: record },
              upsert: true,
            },
          });
        }
      })
    );

    await Promise.all(tasks);

    if (bulkOps.length) {
      const writeResult = await FinanceReserveBank.bulkWrite(bulkOps, {
        ordered: false,
      });

      result.recordsSaved = writeResult.upsertedCount + writeResult.modifiedCount;
    }

    /*                           Aggregate Call                                  */

    const aggregateData = await getBankGroupSummaryWithRetry(
      token,
      syncDate,
      syncDate
    );

    if (aggregateData) {
      const aggregateRecords = transformApiData(
        aggregateData,
        null,
        syncDate,
        DATA_SOURCE
      );

      if (aggregateRecords.length) {
        const bulkResult = await FinanceReserveBank.bulkWrite(
          aggregateRecords.map(r => ({
            updateOne: {
              filter: {
                entity: null,
                date: r.date,
                dataSource: r.dataSource,
              },
              update: { $set: r },
              upsert: true,
            },
          })),
          { ordered: false }
        );

        result.recordsSaved += bulkResult.upsertedCount + bulkResult.modifiedCount;
      }
    }

    console.log(`✅ Sync completed in optimized mode`);
    console.log(`   Entities processed: ${result.entitiesProcessed}`);
    console.log(`   Records saved: ${result.recordsSaved}`);

  } catch (error: any) {
    result.success = false;
    result.errors.push(error.message);
    console.error('❌ Sync failed:', error.message);
  }

  return result;
};
