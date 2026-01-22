import mongoose from 'mongoose';
import SalesCollection from '../models/sales-collection.model';
import Project from '../models/project.model';
import Entity from '../models/entities.model';
import {
  getSalesCollectionDataWithRetry,
  getZohoToken,
} from './zohoAnalytics.service';

interface SyncResult {
  success: boolean;
  recordsSaved: number;
  recordsSkipped: number;
  errors: string[];
  dataSource: string;
}

const DATA_SOURCE = 'ZOHO SALES API';

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
 * Normalize date to start of day (00:00:00)
 * @param date - Date string or Date object
 * @returns Normalized Date object
 */
const normalizeDate = (date: string | Date): Date => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const normalized = new Date(dateObj);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

/**
 * Find or create project by name
 * @param projectName - Project name
 * @returns Project document
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
 * Transform Zoho API record to Sales Collection model format
 * @param record - Raw record from Zoho API
 * @param syncDate - Date to use if record doesn't have date
 * @returns Transformed record or null if invalid
 */
const transformApiRecord = async (
  record: any,
  syncDate: string
): Promise<any | null> => {
  try {
    const projectNameRaw = record['Project Name']?.trim();
    const paymentDateRaw = record['Payment Date'] || record['Date'] || syncDate;

    if (!projectNameRaw || !paymentDateRaw) {
      console.warn('⚠️ Skipping invalid record — missing project name or date');
      return null;
    }

    const projectName = projectNameRaw.replace(/\s+/g, ' ').trim();
    const isNoValue = /no\s*value/i.test(projectName);
    const isGrandTotal = /grand\s*summary/i.test(projectName);

    // Normalize date
    const normalizedDate = normalizeDate(paymentDateRaw);

    // Parse amounts
    const toNum = (val: any): number => parseAmount(val);

    const baseDoc = {
      date: normalizedDate,
      escrowCollection: toNum(record['Escrow Collection (AED)'] || record['Escrow']),
      nonEscrowCollection: toNum(record['Non-Escrow Collection (AED)'] || record['Non Escrow']),
      mtdEscrowCollection: toNum(record['MTD Escrow Collection (AED)']),
      mtdNonEscrowCollection: toNum(record['MTD Non-Escrow Collection (AED)']),
      dataSource: DATA_SOURCE,
      lastSyncDateTime: new Date(),
    };

    // Handle special types (Grand Summary / No Value)
    if (isGrandTotal || isNoValue) {
      const specialType = isGrandTotal ? 'Grand Summary' : 'No Value';

      return {
        ...baseDoc,
        entity: null,
        project: null,
        specialType: specialType,
      };
    }

    // Handle normal project records
    const projectId = await findOrCreateProject(projectName);
    if (!projectId) {
      console.warn(`⚠️ Skipping record — Could not create project: ${projectName}`);
      return null;
    }

    // Get project to find entity
    const project = await Project.findById(projectId).lean();
    if (!project) {
      console.warn(`⚠️ Skipping record — Project not found: ${projectName}`);
      return null;
    }

    const entityId = project.entity;

    // For normal records, do NOT include specialType (matching old implementation)
    return {
      ...baseDoc,
      entity: entityId,
      project: projectId,
      // specialType is not included for normal records
    };
  } catch (error: any) {
    console.error('❌ Error transforming record:', error.message);
    return null;
  }
};

/**
 * Sync sales collection data from Zoho Analytics for a date range
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @returns Sync result
 */
export const syncSalesCollectionData = async (
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
    console.log(`🔄 Starting Sales Collection Sync: ${fromDate} → ${toDate}`);

    // Get token
    const token = await getZohoToken();
    if (!token) {
      throw new Error('Failed to acquire Zoho Analytics token');
    }

    // Fetch data from Zoho API
    const records = await getSalesCollectionDataWithRetry(token, fromDate, toDate);

    if (!records || records.length === 0) {
      console.warn('⚠️ No sales collection data received from Zoho');
      return result;
    }

    console.log(`📊 Processing ${records.length} sales collection records...`);

    // Process records individually (matching old API implementation)
    for (const record of records) {
      try {
        const transformed = await transformApiRecord(record, fromDate);

        if (!transformed) {
          result.recordsSkipped++;
          continue;
        }

        // Build filter and update based on record type (matching old API logic)
        let filter: any;
        let updateDoc: any;

        if (transformed.specialType) {
          // CASE 1: GRAND SUMMARY / NO VALUE
          // Filter: only specialType and date (matching old implementation)
          filter = {
            specialType: transformed.specialType,
            date: transformed.date,
          };

          // Update: include entity: null, project: null, specialType
          updateDoc = {
            ...transformed,
            entity: null,
            project: null,
            specialType: transformed.specialType,
          };
        } else {
          // CASE 2: NORMAL PROJECT
          // Filter: entity, project, date (NO specialType in filter - matching old implementation)
          filter = {
            entity: transformed.entity,
            project: transformed.project,
            date: transformed.date,
          };

          // Update: include all fields from transformed (specialType is already not included)
          updateDoc = transformed;
        }

        // Use individual updateOne operation (matching old API implementation)
        await SalesCollection.updateOne(filter, { $set: updateDoc }, { upsert: true });

        result.recordsSaved++;
      } catch (error: any) {
        const errorMsg = `Error processing record: ${error.message}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
        result.recordsSkipped++;
      }
    }

    console.log(`✅ Sales Collection Sync Completed`);
    console.log(`   Records saved: ${result.recordsSaved}`);
    console.log(`   Records skipped: ${result.recordsSkipped}`);
    console.log(`   Errors: ${result.errors.length}`);

    result.success = result.errors.length === 0 || result.recordsSaved > 0;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Sync failed: ${error.message}`);
    console.error('❌ Critical error in Sales Collection Sync:', error);
  }

  return result;
};

/**
 * Sync yesterday's sales collection data (for daily cron job)
 * @returns Sync result
 */
export const syncYesterdayCollectionData = async (): Promise<SyncResult> => {
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

  console.log(`📅 Syncing Sales Collection for: ${dateStr}`);

  return syncSalesCollectionData(dateStr, dateStr);
};

