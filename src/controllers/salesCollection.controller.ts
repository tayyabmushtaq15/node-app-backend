import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import SalesCollection from '../models/sales-collection.model';
import { syncSalesCollectionData } from '../services/sales-collection.service';
import { sendErrorResponse } from '../utils/errors';

/**
 * Trigger manual sync of sales collection data
 */
export const syncSalesCollection = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { fromDate, toDate } = req.body;

    console.log('🔄 Manual sales collection sync triggered by user');
    console.log(`📅 Syncing data from ${fromDate} to ${toDate}`);

    const result = await syncSalesCollectionData(fromDate, toDate);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Sales collection data synced successfully',
        data: {
          dateRange: { fromDate, toDate },
          recordsSaved: result.recordsSaved,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors.length > 0 ? result.errors : undefined,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Sync completed with errors',
        data: {
          dateRange: { fromDate, toDate },
          recordsSaved: result.recordsSaved,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
        },
      });
    }
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get sales collection data with pagination and filters
 */
export const getSalesCollectionData = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Filter parameters
    const entityId = req.query.entityId as string;
    const projectId = req.query.projectId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const minTotalCollection = req.query.minTotalCollection as string;
    const maxTotalCollection = req.query.maxTotalCollection as string;

    // Build match query
    const match: any = {
      // Exclude special types
      $or: [
        { specialType: { $exists: false } },
        { specialType: null },
        { specialType: { $nin: ['Grand Summary', 'No Value'] } },
      ],
    };

    // Apply entity filter
    if (entityId && typeof entityId === 'string' && entityId.trim() !== '') {
      if (mongoose.Types.ObjectId.isValid(entityId)) {
        match.entity = new mongoose.Types.ObjectId(entityId);
      }
    }

    // Apply project filter
    if (projectId && typeof projectId === 'string' && projectId.trim() !== '') {
      if (mongoose.Types.ObjectId.isValid(projectId)) {
        match.project = new mongoose.Types.ObjectId(projectId);
      }
    }

    // Date range filter
    if (startDate || endDate) {
      match.date = {};
      if (startDate) {
        match.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          totalCollection: {
            $add: ['$escrowCollection', '$nonEscrowCollection'],
          },
        },
      },
    ];

    // Total collection range filter
    if (minTotalCollection || maxTotalCollection) {
      pipeline.push({
        $match: {
          totalCollection: {
            ...(minTotalCollection ? { $gte: parseFloat(minTotalCollection) } : {}),
            ...(maxTotalCollection ? { $lte: parseFloat(maxTotalCollection) } : {}),
          },
        },
      });
    }

    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await SalesCollection.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Apply sorting, skip, and limit
    pipeline.push({ $sort: { date: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Lookup entity and project
    pipeline.push(
      {
        $lookup: {
          from: 'entities',
          localField: 'entity',
          foreignField: '_id',
          as: 'entityData',
        },
      },
      {
        $lookup: {
          from: 'projects',
          localField: 'project',
          foreignField: '_id',
          as: 'projectData',
        },
      },
      {
        $addFields: {
          entity: {
            $cond: {
              if: { $gt: [{ $size: '$entityData' }, 0] },
              then: {
                _id: { $arrayElemAt: ['$entityData._id', 0] },
                entityName: { $arrayElemAt: ['$entityData.entityName', 0] },
                entityCode: { $arrayElemAt: ['$entityData.entityCode', 0] },
              },
              else: null,
            },
          },
          project: {
            $cond: {
              if: { $gt: [{ $size: '$projectData' }, 0] },
              then: {
                _id: { $arrayElemAt: ['$projectData._id', 0] },
                projectName: { $arrayElemAt: ['$projectData.projectName', 0] },
                projectShortName: {
                  $arrayElemAt: ['$projectData.projectShortName', 0],
                },
              },
              else: null,
            },
          },
        },
      },
      {
        $project: {
          entityData: 0,
          projectData: 0,
        },
      }
    );

    const records = await SalesCollection.aggregate(pipeline);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Sales collection data retrieved successfully',
      data: {
        records,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          entityId: entityId || null,
          projectId: projectId || null,
          startDate: startDate || null,
          endDate: endDate || null,
          minTotalCollection: minTotalCollection || null,
          maxTotalCollection: maxTotalCollection || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get sales collection summary statistics
 * Returns yesterday vs day before yesterday, using Grand Summary records if available
 */
export const getSalesCollectionSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Yesterday
    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setUTCHours(23, 59, 59, 999);
    yesterdayEnd.setUTCMilliseconds(999);

    // Day before yesterday
    const dayBeforeYesterday = new Date(yesterday);
    dayBeforeYesterday.setUTCDate(yesterday.getUTCDate() - 1);
    dayBeforeYesterday.setUTCHours(0, 0, 0, 0);

    const dayBeforeYesterdayEnd = new Date(dayBeforeYesterday);
    dayBeforeYesterdayEnd.setUTCHours(23, 59, 59, 999);
    dayBeforeYesterdayEnd.setUTCMilliseconds(999);

    // Helper to get collection data for a specific date
    // First try to get Grand Summary, if not available, sum regular records
    const getCollectionForDate = async (targetDate: Date, targetDateEnd: Date) => {
      // Try to get Grand Summary record first
      const grandSummaryMatch: any = {
        specialType: 'Grand Summary',
        date: {
          $gte: targetDate,
          $lte: targetDateEnd,
        },
      };

      if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
        // If project filter is provided, we can't use Grand Summary (it's aggregate)
        // Fall through to regular records aggregation
      } else {
        const grandSummary = await SalesCollection.findOne(grandSummaryMatch);
        if (grandSummary) {
          return {
            escrowCollection: grandSummary.escrowCollection || 0,
            nonEscrowCollection: grandSummary.nonEscrowCollection || 0,
            totalCollection: (grandSummary.escrowCollection || 0) + (grandSummary.nonEscrowCollection || 0),
          };
        }
      }

      // Fallback: aggregate regular records (exclude special types)
      const regularMatch: any = {
        $or: [
          { specialType: { $exists: false } },
          { specialType: null },
          { specialType: { $nin: ['Grand Summary', 'No Value'] } },
        ],
        date: {
          $gte: targetDate,
          $lte: targetDateEnd,
        },
      };

      if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
        regularMatch.project = new mongoose.Types.ObjectId(projectId);
      }

      const result = await SalesCollection.aggregate([
        {
          $match: regularMatch,
        },
        {
          $group: {
            _id: null,
            escrowCollection: { $sum: '$escrowCollection' },
            nonEscrowCollection: { $sum: '$nonEscrowCollection' },
            totalCollection: {
              $sum: { $add: ['$escrowCollection', '$nonEscrowCollection'] },
            },
          },
        },
      ]);

      return result[0] || {
        escrowCollection: 0,
        nonEscrowCollection: 0,
        totalCollection: 0,
      };
    };

    // Get data for both days in parallel
    const [yesterdayData, previousDayData] = await Promise.all([
      getCollectionForDate(yesterday, yesterdayEnd),
      getCollectionForDate(dayBeforeYesterday, dayBeforeYesterdayEnd),
    ]);

    const yesterdayTotal = yesterdayData.totalCollection;
    const previousDayTotal = previousDayData.totalCollection;

    // Calculate percentage change
    let percentageChange = 0;
    if (previousDayTotal === 0) {
      percentageChange = yesterdayTotal > 0 ? 100 : 0;
    } else {
      percentageChange = ((yesterdayTotal - previousDayTotal) / previousDayTotal) * 100;
    }

    const changeAmount = yesterdayTotal - previousDayTotal;
    const percentageFormatted = percentageChange >= 0
      ? `+${percentageChange.toFixed(1)}%`
      : `${percentageChange.toFixed(1)}%`;

    res.status(200).json({
      success: true,
      message: 'Sales collection summary retrieved successfully',
      data: {
        yesterday: {
          date: yesterday.toISOString().split('T')[0],
          totalCollection: yesterdayTotal,
          escrowCollection: yesterdayData.escrowCollection,
          nonEscrowCollection: yesterdayData.nonEscrowCollection,
        },
        previousDay: {
          date: dayBeforeYesterday.toISOString().split('T')[0],
          totalCollection: previousDayTotal,
          escrowCollection: previousDayData.escrowCollection,
          nonEscrowCollection: previousDayData.nonEscrowCollection,
        },
        change: {
          amount: changeAmount,
          percentage: percentageChange,
          percentageFormatted: percentageFormatted,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get sales collection detail with date grouping
 * Groups data by date, using Grand Summary for totals and regular records for detail
 */
export const getSalesCollectionDetail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100; // Default to 100 date groups per page
    const skip = (page - 1) * limit;

    // Filter parameters
    const projectId = req.query.projectId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const minTotalCollection = parseFloat(req.query.minTotalCollection as string);
    const maxTotalCollection = parseFloat(req.query.maxTotalCollection as string);

    // Build match query - exclude 'No Value' records
    const match: any = {
      $or: [
        { specialType: { $exists: false } },
        { specialType: null },
        { specialType: { $nin: ['No Value'] } },
      ],
    };

    // Apply project filter (only affects regular records, not Grand Summary)
    if (projectId && projectId.trim() !== '' && mongoose.Types.ObjectId.isValid(projectId)) {
      match.project = new mongoose.Types.ObjectId(projectId);
    } else if (projectId && projectId.trim() !== '' && !mongoose.Types.ObjectId.isValid(projectId)) {
      // If projectId is provided but invalid, return no results
      res.status(200).json({
        success: true,
        message: 'Invalid project ID provided. No results found.',
        data: {
          dateGroups: [],
          pagination: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          filters: { projectId, startDate, endDate, minTotalCollection, maxTotalCollection },
        },
      });
      return;
    }

    // Date range filter
    if (startDate || endDate) {
      match.date = {};
      if (startDate) {
        const from = new Date(startDate);
        from.setUTCHours(0, 0, 0, 0);
        match.date.$gte = from;
      }
      if (endDate) {
        const to = new Date(endDate);
        to.setUTCHours(23, 59, 59, 999);
        to.setUTCMilliseconds(999);
        match.date.$lte = to;
      }
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          totalCollection: {
            $add: ['$escrowCollection', '$nonEscrowCollection'],
          },
        },
      },
    ];

    // Apply total collection range filter if provided
    if (!isNaN(minTotalCollection) || !isNaN(maxTotalCollection)) {
      const collectionMatch: any = {};
      if (!isNaN(minTotalCollection)) {
        collectionMatch.$gte = minTotalCollection;
      }
      if (!isNaN(maxTotalCollection)) {
        collectionMatch.$lte = maxTotalCollection;
      }
      pipeline.push({ $match: { totalCollection: collectionMatch } });
    }

    // Get total count of unique dates matching filters before grouping and pagination
    const countPipeline = [
      ...pipeline,
      { $group: { _id: '$date' } },
      { $count: 'total' }
    ];
    const countResult = await SalesCollection.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Separate Grand Summary records from regular records and group by date
    pipeline.push(
      {
        $group: {
          _id: '$date',
          date: { $first: '$date' },
          // Store Grand Summary record separately
          grandSummaryRecord: {
            $push: {
              $cond: [
                { $eq: ['$specialType', 'Grand Summary'] },
                {
                  _id: '$_id',
                  escrowCollection: '$escrowCollection',
                  nonEscrowCollection: '$nonEscrowCollection',
                  totalCollection: '$totalCollection',
                  Currency: '$Currency',
                  dataSource: '$dataSource',
                  lastSyncDateTime: '$lastSyncDateTime',
                  createdAt: '$createdAt',
                  updatedAt: '$updatedAt',
                },
                '$$REMOVE',
              ],
            },
          },
          // Store regular record IDs (no specialType or specialType != 'Grand Summary')
          regularRecordIds: {
            $push: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$specialType', null] },
                    { $not: { $eq: ['$specialType', 'Grand Summary'] } },
                  ],
                },
                '$_id',
                '$$REMOVE',
              ],
            },
          },
        },
      },
      {
        $addFields: {
          // Extract Grand Summary record (should be only one)
          grandSummary: { $arrayElemAt: ['$grandSummaryRecord', 0] },
        },
      },
      {
        $addFields: {
          // Use Grand Summary for summary totals, fallback to 0 if not exists
          escrowCollection: {
            $ifNull: ['$grandSummary.escrowCollection', 0],
          },
          nonEscrowCollection: {
            $ifNull: ['$grandSummary.nonEscrowCollection', 0],
          },
          totalCollection: {
            $ifNull: ['$grandSummary.totalCollection', 0],
          },
        },
      },
      { $sort: { date: -1 } }, // Sort dates descending
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'salescollections',
          localField: 'regularRecordIds',
          foreignField: '_id',
          as: 'regularRecords',
        },
      },
      {
        $unwind: {
          path: '$regularRecords',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'projects',
          localField: 'regularRecords.project',
          foreignField: '_id',
          as: 'projectData',
        },
      },
      {
        $lookup: {
          from: 'entities',
          localField: 'regularRecords.entity',
          foreignField: '_id',
          as: 'entityData',
        },
      },
      {
        $addFields: {
          'regularRecords.project': {
            $cond: {
              if: { $gt: [{ $size: '$projectData' }, 0] },
              then: {
                _id: { $arrayElemAt: ['$projectData._id', 0] },
                projectName: { $arrayElemAt: ['$projectData.projectName', 0] },
                projectShortName: { $arrayElemAt: ['$projectData.projectShortName', 0] },
              },
              else: null,
            },
          },
          'regularRecords.entity': {
            $cond: {
              if: { $gt: [{ $size: '$entityData' }, 0] },
              then: {
                _id: { $arrayElemAt: ['$entityData._id', 0] },
                entityName: { $arrayElemAt: ['$entityData.entityName', 0] },
                entityCode: { $arrayElemAt: ['$entityData.entityCode', 0] },
              },
              else: null,
            },
          },
        },
      },
      {
        $group: {
          _id: '$date',
          date: { $first: '$date' },
          escrowCollection: { $first: '$escrowCollection' },
          nonEscrowCollection: { $first: '$nonEscrowCollection' },
          totalCollection: { $first: '$totalCollection' },
          records: {
            $push: {
              $cond: [
                { $ne: ['$regularRecords', null] },
                {
                  _id: '$regularRecords._id',
                  entity: '$regularRecords.entity',
                  project: '$regularRecords.project',
                  date: '$regularRecords.date',
                  escrowCollection: '$regularRecords.escrowCollection',
                  nonEscrowCollection: '$regularRecords.nonEscrowCollection',
                  totalCollection: '$regularRecords.totalCollection',
                  Currency: '$regularRecords.Currency',
                  dataSource: '$regularRecords.dataSource',
                  lastSyncDateTime: '$regularRecords.lastSyncDateTime',
                  createdAt: '$regularRecords.createdAt',
                  updatedAt: '$regularRecords.updatedAt',
                },
                '$$REMOVE',
              ],
            },
          },
        },
      },
      {
        $addFields: {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$date',
            },
          },
          records: {
            $map: {
              input: '$records',
              as: 'record',
              in: {
                $mergeObjects: [
                  '$$record',
                  {
                    date: {
                      $cond: {
                        if: { $eq: [{ $type: '$$record.date' }, 'date'] },
                        then: {
                          $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$$record.date',
                          },
                        },
                        else: '$$record.date',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: 1,
          escrowCollection: 1,
          nonEscrowCollection: 1,
          totalCollection: 1,
          records: 1,
        },
      },
      { $sort: { date: -1 } } // Final sort by date descending
    );

    const dateGroups = await SalesCollection.aggregate(pipeline);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Sales collection detail retrieved successfully',
      data: {
        dateGroups,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          projectId: projectId || null,
          startDate: startDate || null,
          endDate: endDate || null,
          minTotalCollection: minTotalCollection || null,
          maxTotalCollection: maxTotalCollection || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get chart data for escrow vs non-escrow totals by project
 */
export const getSalesCollectionChartData = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        message: 'startDate and endDate are required in YYYY-MM-DD format',
      });
      return;
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);

    const result = await SalesCollection.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          $or: [
            { specialType: { $exists: false } },
            { specialType: null },
            { specialType: { $nin: ['Grand Summary', 'No Value'] } },
          ],
        },
      },
      {
        $group: {
          _id: '$project',
          escrow: { $sum: '$escrowCollection' },
          nonEscrow: { $sum: '$nonEscrowCollection' },
        },
      },
      {
        $lookup: {
          from: 'projects',
          localField: '_id',
          foreignField: '_id',
          as: 'project',
        },
      },
      {
        $addFields: {
          projectName: {
            $ifNull: [{ $arrayElemAt: ['$project.projectName', 0] }, 'Unassigned'],
          },
          projectShortName: {
            $ifNull: [{ $arrayElemAt: ['$project.projectShortName', 0] }, 'UNASSIGNED'],
          },
        },
      },
      {
        $project: {
          _id: 0,
          projectId: '$_id',
          project: '$projectName',
          projectShortName: '$projectShortName',
          escrow: 1,
          nonEscrow: 1,
          total: { $add: ['$escrow', '$nonEscrow'] },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const totals = result.reduce(
      (acc, r) => {
        acc.totalEscrow += r.escrow || 0;
        acc.totalNonEscrow += r.nonEscrow || 0;
        return acc;
      },
      { totalEscrow: 0, totalNonEscrow: 0 }
    );

    res.status(200).json({
      success: true,
      message: 'Sales collection chart data retrieved successfully',
      data: {
        projects: result,
        totals,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

