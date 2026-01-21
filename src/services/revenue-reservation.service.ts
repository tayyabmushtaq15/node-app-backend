import mongoose from 'mongoose';
import RevenueReservation from '../models/revenue-reservation.model';
import Project from '../models/project.model';
import Entity from '../models/entities.model';
import {
  getRevenueReservationDataWithRetry,
  getZohoToken,
} from './zohoAnalytics.service';

interface SyncResult {
  success: boolean;
  recordsSaved: number;
  recordsSkipped: number;
  errors: string[];
  dataSource: string;
}

const DATA_SOURCE = 'ZohoAnalytics';

/**
 * Parse amount string (e.g., "AED 739,451.37" -> 739451.37)
 * @param amountStr - Amount string
 * @returns Parsed amount as number
 */
const parseAmount = (amountStr: string | number | undefined): number => {
  if (typeof amountStr === 'number') return amountStr || 0;
  if (!amountStr || amountStr.toString().trim() === '') return 0;

  // Remove currency symbols and commas, then parse
  const cleaned = amountStr.toString().replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
};

/**
 * Parse date string (e.g., "11 Sep, 2025" -> Date object)
 * @param dateStr - Date string
 * @returns Parsed Date object
 */
const parseDate = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  if (!dateStr) return new Date();

  // Handle format like "11 Sep, 2025"
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? new Date() : date;
};

/**
 * Normalize date to start of day (00:00:00)
 * @param date - Date string or Date object
 * @returns Normalized Date object
 */
const normalizeDate = (date: string | Date): Date => {
  const dateObj = typeof date === 'string' ? parseDate(date) : date;
  const normalized = new Date(dateObj);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

/**
 * Find or create project by name
 * @param projectName - Project name
 * @returns Project document ID
 */
const findOrCreateProject = async (projectName: string): Promise<mongoose.Types.ObjectId | null> => {
  try {
    // Try to find existing project by projectName (case-insensitive)
    const project = await Project.findOne({
      projectName: { $regex: new RegExp(`^${projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).lean();

    if (project) {
      return project._id;
    }

    // Generate project code and short name from project name
    const projectCode = projectName
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10)
      .toUpperCase() || 'PROJECT';
    const projectShortName = projectCode;

    // Get or create a default entity (LDP)
    let defaultEntity = await Entity.findOne({ entityCode: 'LDP' }).lean();

    let entityId: mongoose.Types.ObjectId;

    if (!defaultEntity) {
      // Create default LDP entity if it doesn't exist
      const newEntity = await Entity.create({
        entityName: 'Leos Development Projects',
        entityCode: 'LDP',
        entityType: 1,
        entityCurrency: 'AED',
      });
      entityId = newEntity._id;
      console.log('✅ Created default LDP entity');
    } else {
      entityId = defaultEntity._id;
    }

    // Create new project with all required fields
    const newProject = await Project.create({
      projectName: projectName.trim(),
      projectShortName: projectShortName,
      projectCode: projectCode,
      entity: entityId,
      status: 'Planning',
      type: 'Residential',
      isAvailable: true,
      totalUnits: 0,
    });

    console.log(`✅ Created new project: ${projectName}`);
    return newProject._id;
  } catch (error: any) {
    console.error(`❌ Error finding/creating project ${projectName}:`, error.message);
    throw error;
  }
};

/**
 * Transform Zoho API record to Revenue Reservation model format
 * @param record - Raw record from Zoho API
 * @param syncDate - Date to use if record doesn't have date
 * @returns Transformed record or null if invalid
 */
const transformApiRecord = async (
  record: any,
  syncDate: string
): Promise<any | null> => {
  try {
    // Validate required fields
    if (!record['Project Name'] || !record['ST Name'] || !record['Date']) {
      console.warn('⚠️ Skipping invalid record (missing required fields):', record);
      return null;
    }

    const projectName = record['Project Name'].trim();
    const dateRaw = record['Date'] || syncDate;

    // Normalize date
    const normalizedDate = normalizeDate(dateRaw);

    // Find or create project
    const projectId = await findOrCreateProject(projectName);
    if (!projectId) {
      console.warn(`⚠️ Skipping record — Could not create project: ${projectName}`);
      return null;
    }

    // Get project to get projectShortName
    const project = await Project.findById(projectId).lean();
    if (!project) {
      console.warn(`⚠️ Skipping record — Project not found: ${projectName}`);
      return null;
    }

    // Parse amounts and units
    const reservedAmount = parseAmount(record['Reserved AED']);
    const reservedUnits = parseInt(record['Reserved Units']) || 0;
    const cancelledAmount = parseAmount(record['Cancelled AED']);
    const cancelledUnits = parseInt(record['Cancelled Units']) || 0;

    // Parse optional fields
    const salesManagerName = record['Sales Manager Name']?.trim() || '';
    const salesDirectorName = record['Sales Director Name']?.trim() || '';

    // Log warnings for data inconsistencies but don't skip
    if (cancelledUnits > reservedUnits) {
      console.log(
        `ℹ️ Note: Cancelled units (${cancelledUnits}) exceed reserved units (${reservedUnits}) for ${projectName} - ${record['ST Name']} - ${dateRaw}`
      );
    }

    if (cancelledAmount > reservedAmount) {
      console.log(
        `ℹ️ Note: Cancelled amount (${cancelledAmount}) exceeds reserved amount (${reservedAmount}) for ${projectName} - ${record['ST Name']} - ${dateRaw}`
      );
    }

    return {
      projectId: projectId,
      projectName: project.projectName,
      projectShortName: project.projectShortName,
      date: normalizedDate,
      stName: record['ST Name'].trim(),
      salesManagerName: salesManagerName,
      salesDirectorName: salesDirectorName,
      reservedAmount: reservedAmount,
      reservedUnits: reservedUnits,
      cancelledAmount: cancelledAmount,
      cancelledUnits: cancelledUnits,
      type: 'Reservation',
      dataSource: DATA_SOURCE,
      currency: 'AED',
    };
  } catch (error: any) {
    console.error('❌ Error transforming record:', error.message);
    return null;
  }
};

/**
 * Sync revenue reservation data from Zoho Analytics for a date range
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @returns Sync result
 */
export const syncRevenueReservationData = async (
  fromDate: string,
  toDate: string
): Promise<SyncResult> => {
  const result: SyncResult = {
    success: true,
    recordsSaved: 0,
    recordsSkipped: 0,
    errors: [],
    dataSource: DATA_SOURCE,
  };

  try {
    console.log(`🔄 Starting Revenue Reservation Sync: ${fromDate} → ${toDate}`);

    // Get token
    const token = await getZohoToken();
    if (!token) {
      throw new Error('Failed to acquire Zoho Analytics token');
    }

    // Fetch data from Zoho API
    const records = await getRevenueReservationDataWithRetry(token, fromDate, toDate);

    if (!records || records.length === 0) {
      console.warn('⚠️ No revenue reservation data received from Zoho');
      return result;
    }

    console.log(`📊 Processing ${records.length} revenue reservation records...`);

    // Transform and prepare bulk operations
    const bulkOps: any[] = [];

    for (const record of records) {
      try {
        const transformed = await transformApiRecord(record, fromDate);

        if (!transformed) {
          result.recordsSkipped++;
          continue;
        }

        // Build filter for upsert (unique combination: projectId + stName + date)
        const filter = {
          projectId: transformed.projectId,
          stName: transformed.stName,
          date: transformed.date,
        };

        bulkOps.push({
          updateOne: {
            filter,
            update: { $set: transformed },
            upsert: true,
          },
        });
      } catch (error: any) {
        const errorMsg = `Error processing record: ${error.message}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
        result.recordsSkipped++;
      }
    }

    // Execute bulk write
    if (bulkOps.length > 0) {
      const writeResult = await RevenueReservation.bulkWrite(bulkOps, {
        ordered: false,
      });

      result.recordsSaved = writeResult.upsertedCount + writeResult.modifiedCount;
    }

    console.log(`✅ Revenue Reservation Sync Completed`);
    console.log(`   Records saved: ${result.recordsSaved}`);
    console.log(`   Records skipped: ${result.recordsSkipped}`);
    console.log(`   Errors: ${result.errors.length}`);

    result.success = result.errors.length === 0 || result.recordsSaved > 0;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Sync failed: ${error.message}`);
    console.error('❌ Critical error in Revenue Reservation Sync:', error);
  }

  return result;
};

/**
 * Sync yesterday's revenue reservation data (for daily cron job)
 * @returns Sync result
 */
export const syncYesterdayRevenueData = async (): Promise<SyncResult> => {
  // Get yesterday's date in Dubai timezone (UTC+4)
  const now = new Date();
  const dubaiTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const yesterday = new Date(dubaiTime);
  yesterday.setDate(yesterday.getDate() - 1);

  // Format as YYYY-MM-DD
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  console.log(`📅 Syncing Revenue Reservation for: ${dateStr}`);

  return syncRevenueReservationData(dateStr, dateStr);
};

