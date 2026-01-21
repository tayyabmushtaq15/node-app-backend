import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import RevenueReservation from '../models/revenue-reservation.model';
import { syncRevenueReservationData } from '../services/revenue-reservation.service';
import { sendErrorResponse } from '../utils/errors';

/**
 * Trigger manual sync of revenue reservation data
 */
export const syncRevenueReservation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { fromDate, toDate } = req.body;

    console.log('🔄 Manual revenue reservation sync triggered by user');
    console.log(`📅 Syncing data from ${fromDate} to ${toDate}`);

    const result = await syncRevenueReservationData(fromDate, toDate);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Revenue reservation data synced successfully',
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
 * Get revenue reservation data with pagination and filters
 */
export const getRevenueReservationData = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Filter parameters
    const projectId = req.query.projectId as string;
    const projectName = req.query.projectName as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const stName = req.query.stName as string;
    const salesManagerName = req.query.salesManagerName as string;
    const salesDirectorName = req.query.salesDirectorName as string;
    const dataSource = req.query.dataSource as string;

    // Build match query
    const match: any = {};

    // Apply project filter
    if (projectId && typeof projectId === 'string' && projectId.trim() !== '') {
      if (mongoose.Types.ObjectId.isValid(projectId)) {
        match.projectId = new mongoose.Types.ObjectId(projectId);
      }
    }

    if (projectName) {
      match.projectName = { $regex: new RegExp(projectName, 'i') };
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

    // Sales team filter
    if (stName) {
      match.stName = { $regex: new RegExp(stName, 'i') };
    }

    // Sales manager filter
    if (salesManagerName) {
      match.salesManagerName = { $regex: new RegExp(salesManagerName, 'i') };
    }

    // Sales director filter
    if (salesDirectorName) {
      match.salesDirectorName = { $regex: new RegExp(salesDirectorName, 'i') };
    }

    // Data source filter
    if (dataSource) {
      match.dataSource = dataSource;
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          netReservedAmount: { $subtract: ['$reservedAmount', '$cancelledAmount'] },
          netReservedUnits: { $subtract: ['$reservedUnits', '$cancelledUnits'] },
        },
      },
    ];

    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await RevenueReservation.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Apply sorting, skip, and limit
    pipeline.push({ $sort: { date: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Lookup project
    pipeline.push(
      {
        $lookup: {
          from: 'projects',
          localField: 'projectId',
          foreignField: '_id',
          as: 'projectData',
        },
      },
      {
        $addFields: {
          project: {
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
        },
      },
      {
        $project: {
          projectData: 0,
        },
      }
    );

    const records = await RevenueReservation.aggregate(pipeline);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Revenue reservation data retrieved successfully',
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
          projectId: projectId || null,
          projectName: projectName || null,
          startDate: startDate || null,
          endDate: endDate || null,
          stName: stName || null,
          salesManagerName: salesManagerName || null,
          salesDirectorName: salesDirectorName || null,
          dataSource: dataSource || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get revenue reservation summary statistics
 */
export const getRevenueReservationSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const projectId = req.query.projectId as string;
    const projectName = req.query.projectName as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const salesManagerName = req.query.salesManagerName as string;
    const salesDirectorName = req.query.salesDirectorName as string;

    // Build match query
    const match: any = {};

    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      match.projectId = new mongoose.Types.ObjectId(projectId);
    }

    if (projectName) {
      match.projectName = { $regex: new RegExp(projectName, 'i') };
    }

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

    if (salesManagerName) {
      match.salesManagerName = { $regex: new RegExp(salesManagerName, 'i') };
    }

    if (salesDirectorName) {
      match.salesDirectorName = { $regex: new RegExp(salesDirectorName, 'i') };
    }

    const summary = await RevenueReservation.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalReservedAmount: { $sum: '$reservedAmount' },
          totalReservedUnits: { $sum: '$reservedUnits' },
          totalCancelledAmount: { $sum: '$cancelledAmount' },
          totalCancelledUnits: { $sum: '$cancelledUnits' },
          netReservedAmount: {
            $sum: { $subtract: ['$reservedAmount', '$cancelledAmount'] },
          },
          netReservedUnits: {
            $sum: { $subtract: ['$reservedUnits', '$cancelledUnits'] },
          },
          totalRecords: { $sum: 1 },
        },
      },
      {
        $addFields: {
          cancellationRate: {
            $cond: {
              if: { $gt: ['$totalReservedUnits', 0] },
              then: {
                $multiply: [{ $divide: ['$totalCancelledUnits', '$totalReservedUnits'] }, 100],
              },
              else: 0,
            },
          },
        },
      },
    ]);

    const result =
      summary.length > 0
        ? summary[0]
        : {
            totalReservedAmount: 0,
            totalReservedUnits: 0,
            totalCancelledAmount: 0,
            totalCancelledUnits: 0,
            netReservedAmount: 0,
            netReservedUnits: 0,
            cancellationRate: 0,
            totalRecords: 0,
          };

    res.status(200).json({
      success: true,
      message: 'Revenue reservation summary retrieved successfully',
      data: {
        summary: result,
        filters: {
          projectId: projectId || null,
          projectName: projectName || null,
          startDate: startDate || null,
          endDate: endDate || null,
          salesManagerName: salesManagerName || null,
          salesDirectorName: salesDirectorName || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get revenue reservation data aggregated by sales manager
 */
export const getRevenueReservationByManager = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build query
    const match: any = {};

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

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$salesManagerName',
          totalReservedAmount: { $sum: '$reservedAmount' },
          totalReservedUnits: { $sum: '$reservedUnits' },
          totalCancelledAmount: { $sum: '$cancelledAmount' },
          totalCancelledUnits: { $sum: '$cancelledUnits' },
          netReservedAmount: {
            $sum: { $subtract: ['$reservedAmount', '$cancelledAmount'] },
          },
          netReservedUnits: {
            $sum: { $subtract: ['$reservedUnits', '$cancelledUnits'] },
          },
          recordCount: { $sum: 1 },
        },
      },
      {
        $addFields: {
          cancellationRate: {
            $cond: {
              if: { $gt: ['$totalReservedUnits', 0] },
              then: {
                $multiply: [{ $divide: ['$totalCancelledUnits', '$totalReservedUnits'] }, 100],
              },
              else: 0,
            },
          },
          salesManagerName: '$_id',
        },
      },
      { $sort: { totalReservedAmount: -1 } },
      {
        $project: {
          _id: 0,
        },
      },
    ];

    const results = await RevenueReservation.aggregate(pipeline);

    res.status(200).json({
      success: true,
      message: 'Revenue reservation data by manager retrieved successfully',
      data: {
        records: results,
        count: results.length,
        filters: { startDate, endDate },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get revenue reservation data aggregated by sales director
 */
export const getRevenueReservationByDirector = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build query
    const match: any = {};

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

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$salesDirectorName',
          totalReservedAmount: { $sum: '$reservedAmount' },
          totalReservedUnits: { $sum: '$reservedUnits' },
          totalCancelledAmount: { $sum: '$cancelledAmount' },
          totalCancelledUnits: { $sum: '$cancelledUnits' },
          netReservedAmount: {
            $sum: { $subtract: ['$reservedAmount', '$cancelledAmount'] },
          },
          netReservedUnits: {
            $sum: { $subtract: ['$reservedUnits', '$cancelledUnits'] },
          },
          recordCount: { $sum: 1 },
        },
      },
      {
        $addFields: {
          cancellationRate: {
            $cond: {
              if: { $gt: ['$totalReservedUnits', 0] },
              then: {
                $multiply: [{ $divide: ['$totalCancelledUnits', '$totalReservedUnits'] }, 100],
              },
              else: 0,
            },
          },
          salesDirectorName: '$_id',
        },
      },
      { $sort: { totalReservedAmount: -1 } },
      {
        $project: {
          _id: 0,
        },
      },
    ];

    const results = await RevenueReservation.aggregate(pipeline);

    res.status(200).json({
      success: true,
      message: 'Revenue reservation data by director retrieved successfully',
      data: {
        records: results,
        count: results.length,
        filters: { startDate, endDate },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get revenue reservation data aggregated by project
 */
export const getRevenueReservationByProject = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const salesManagerName = req.query.salesManagerName as string;

    // Build query
    const match: any = {};

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

    if (salesManagerName) {
      match.salesManagerName = { $regex: new RegExp(salesManagerName, 'i') };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            projectName: '$projectName',
            salesManagerName: '$salesManagerName',
          },
          totalReservedAmount: { $sum: '$reservedAmount' },
          totalCancelledAmount: { $sum: '$cancelledAmount' },
          totalReservedUnits: { $sum: '$reservedUnits' },
          totalCancelledUnits: { $sum: '$cancelledUnits' },
        },
      },
      {
        $addFields: {
          netReservedAmount: { $subtract: ['$totalReservedAmount', '$totalCancelledAmount'] },
          netReservedUnits: { $subtract: ['$totalReservedUnits', '$totalCancelledUnits'] },
          targetAmount: { $multiply: ['$totalReservedAmount', 1.25] },
          achievementPercent: {
            $cond: {
              if: { $gt: ['$totalReservedAmount', 0] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      '$totalReservedAmount',
                      { $multiply: ['$totalReservedAmount', 1.25] },
                    ],
                  },
                  100,
                ],
              },
              else: 0,
            },
          },
        },
      },
      { $sort: { totalReservedAmount: -1 } },
      {
        $project: {
          _id: 0,
          projectName: '$_id.projectName',
          salesManagerName: '$_id.salesManagerName',
          totalReservedAmount: 1,
          totalCancelledAmount: 1,
          totalReservedUnits: 1,
          totalCancelledUnits: 1,
          netReservedAmount: 1,
          netReservedUnits: 1,
          targetAmount: 1,
          achievementPercent: 1,
        },
      },
    ];

    const results = await RevenueReservation.aggregate(pipeline);

    res.status(200).json({
      success: true,
      message: 'Revenue reservation data by project retrieved successfully',
      data: {
        records: results,
        count: results.length,
        filters: { startDate, endDate, salesManagerName },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

