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
 * Returns yesterday vs day before, total collection
 */
export const getSalesCollectionSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const entityId = req.query.entityId as string | undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    // Day before yesterday
    const dayBeforeYesterday = new Date(yesterday);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 1);
    dayBeforeYesterday.setHours(0, 0, 0, 0);

    const match: any = {
      // Exclude special types
      $or: [
        { specialType: { $exists: false } },
        { specialType: null },
        { specialType: { $nin: ['Grand Summary', 'No Value'] } },
      ],
    };

    if (entityId) {
      match.entity = new mongoose.Types.ObjectId(entityId);
    }

    // Helper to aggregate total collections for a specific date
    const aggregateTotalCollections = async (targetDate: Date): Promise<number> => {
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await SalesCollection.aggregate([
        {
          $match: {
            ...match,
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: { $add: ['$escrowCollection', '$nonEscrowCollection'] },
            },
          },
        },
      ]);

      return result[0]?.total || 0;
    };

    // Get yesterday's and day before yesterday's totals
    const [yesterdayTotal, dayBeforeTotal] = await Promise.all([
      aggregateTotalCollections(yesterday),
      aggregateTotalCollections(dayBeforeYesterday),
    ]);

    // Calculate percentage change
    const changePercent =
      dayBeforeTotal > 0
        ? Number((((yesterdayTotal - dayBeforeTotal) / dayBeforeTotal) * 100).toFixed(1))
        : 0;

    res.status(200).json({
      success: true,
      message: 'Sales collection summary retrieved successfully',
      data: {
        totalCollection: yesterdayTotal,
        yesterdayData: {
          amount: yesterdayTotal,
          changePercent,
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

