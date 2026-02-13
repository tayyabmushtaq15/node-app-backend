import { Response } from 'express';
import mongoose, { PipelineStage } from 'mongoose';
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
 * If no date filters provided, returns yesterday's revenue with percentage change vs previous day
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

    // If no date filters provided, calculate yesterday vs previous day for card
    if (!startDate && !endDate) {
      // Calculate yesterday and previous day dates (UTC, start of day)
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setUTCDate(today.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);

      const previousDay = new Date(yesterday);
      previousDay.setUTCDate(yesterday.getUTCDate() - 1);
      previousDay.setUTCHours(0, 0, 0, 0);

      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setUTCHours(23, 59, 59, 999);
      yesterdayEnd.setUTCMilliseconds(999);

      const previousDayEnd = new Date(previousDay);
      previousDayEnd.setUTCHours(23, 59, 59, 999);
      previousDayEnd.setUTCMilliseconds(999);

      // Build base match query (excluding date)
      const baseMatch: any = {};

      if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
        baseMatch.projectId = new mongoose.Types.ObjectId(projectId);
      }

      if (projectName) {
        baseMatch.projectName = { $regex: new RegExp(projectName, 'i') };
      }

      if (salesManagerName) {
        baseMatch.salesManagerName = { $regex: new RegExp(salesManagerName, 'i') };
      }

      if (salesDirectorName) {
        baseMatch.salesDirectorName = { $regex: new RegExp(salesDirectorName, 'i') };
      }

      // Query yesterday's data
      const yesterdayMatch = {
        ...baseMatch,
        date: {
          $gte: yesterday,
          $lte: yesterdayEnd,
        },
      };

      // Query previous day's data
      const previousDayMatch = {
        ...baseMatch,
        date: {
          $gte: previousDay,
          $lte: previousDayEnd,
        },
      };

      // Get data for both days in parallel
      const [yesterdaySummary, previousDaySummary] = await Promise.all([
        RevenueReservation.aggregate([
          { $match: yesterdayMatch },
          {
            $group: {
              _id: null,
              reservedAmount: { $sum: '$reservedAmount' },
              cancelledAmount: { $sum: '$cancelledAmount' },
              reservedUnits: { $sum: '$reservedUnits' },
              cancelledUnits: { $sum: '$cancelledUnits' },
            },
          },
        ]),
        RevenueReservation.aggregate([
          { $match: previousDayMatch },
          {
            $group: {
              _id: null,
              reservedAmount: { $sum: '$reservedAmount' },
              cancelledAmount: { $sum: '$cancelledAmount' },
              reservedUnits: { $sum: '$reservedUnits' },
              cancelledUnits: { $sum: '$cancelledUnits' },
            },
          },
        ]),
      ]);

      const yesterdayData = yesterdaySummary[0] || {
        reservedAmount: 0,
        cancelledAmount: 0,
        reservedUnits: 0,
        cancelledUnits: 0,
      };

      const previousDayData = previousDaySummary[0] || {
        reservedAmount: 0,
        cancelledAmount: 0,
        reservedUnits: 0,
        cancelledUnits: 0,
      };

      const yesterdayNetAmount = yesterdayData.reservedAmount - yesterdayData.cancelledAmount;
      const previousDayNetAmount = previousDayData.reservedAmount - previousDayData.cancelledAmount;

      // Calculate percentage change
      const changeAmount = yesterdayNetAmount - previousDayNetAmount;
      let percentageChange = 0;
      if (previousDayNetAmount === 0) {
        percentageChange = yesterdayNetAmount > 0 ? 100 : 0;
      } else {
        percentageChange = (changeAmount / previousDayNetAmount) * 100;
      }

      const percentageFormatted = percentageChange >= 0
        ? `+${percentageChange.toFixed(1)}%`
        : `${percentageChange.toFixed(1)}%`;

      // Calculate additional metrics for gauge
      // Total Revenue: All-time total netReservedAmount
      const totalRevenueResult = await RevenueReservation.aggregate([
        {
          $match: baseMatch,
        },
        {
          $group: {
            _id: null,
            totalNetReservedAmount: {
              $sum: { $subtract: ['$reservedAmount', '$cancelledAmount'] },
            },
          },
        },
      ]);
      const totalRevenue = totalRevenueResult[0]?.totalNetReservedAmount || 0;

      // Month to Date: Current month total
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      currentMonthStart.setUTCHours(0, 0, 0, 0);
      const currentMonthEnd = new Date(today);
      currentMonthEnd.setUTCHours(23, 59, 59, 999);
      currentMonthEnd.setUTCMilliseconds(999);

      const monthToDateResult = await RevenueReservation.aggregate([
        {
          $match: {
            ...baseMatch,
            date: {
              $gte: currentMonthStart,
              $lte: currentMonthEnd,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalNetReservedAmount: {
              $sum: { $subtract: ['$reservedAmount', '$cancelledAmount'] },
            },
          },
        },
      ]);
      const monthToDate = monthToDateResult[0]?.totalNetReservedAmount || 0;

      // Year to Date: January 1, 2026 to today
      const yearStart = new Date(2026, 0, 1); // January 1, 2026
      yearStart.setUTCHours(0, 0, 0, 0);

      const yearToDateResult = await RevenueReservation.aggregate([
        {
          $match: {
            ...baseMatch,
            date: {
              $gte: yearStart,
              $lte: currentMonthEnd,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalNetReservedAmount: {
              $sum: { $subtract: ['$reservedAmount', '$cancelledAmount'] },
            },
          },
        },
      ]);
      const yearToDate = yearToDateResult[0]?.totalNetReservedAmount || 0;

      // Target amount: 1 Billion AED
      const targetAmount = 1000000000;

      res.status(200).json({
        success: true,
        message: 'Revenue reservation summary retrieved successfully',
        data: {
          yesterday: {
            date: yesterday.toISOString().split('T')[0],
            netReservedAmount: yesterdayNetAmount,
            reservedAmount: yesterdayData.reservedAmount,
            cancelledAmount: yesterdayData.cancelledAmount,
            reservedUnits: yesterdayData.reservedUnits,
            cancelledUnits: yesterdayData.cancelledUnits,
          },
          previousDay: {
            date: previousDay.toISOString().split('T')[0],
            netReservedAmount: previousDayNetAmount,
            reservedAmount: previousDayData.reservedAmount,
            cancelledAmount: previousDayData.cancelledAmount,
            reservedUnits: previousDayData.reservedUnits,
            cancelledUnits: previousDayData.cancelledUnits,
          },
          change: {
            amount: changeAmount,
            percentage: percentageChange,
            percentageFormatted,
          },
          totalRevenue,
          monthToDate,
          yearToDate,
          targetAmount,
        },
      });
      return;
    }

    // Original behavior when date filters are provided
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
//resolve the error in the pipeline type
    const pipelineTyped: PipelineStage[] = pipeline as PipelineStage[];
    const results = await RevenueReservation.aggregate(pipelineTyped);

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

    const pipelineTyped: PipelineStage[] = pipeline as PipelineStage[];
    const results = await RevenueReservation.aggregate(pipelineTyped);

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
          projectShortName: { $first: '$projectShortName' },
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
          projectShortName: 1,
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

    const pipelineTyped: PipelineStage[] = pipeline as PipelineStage[];
    const results = await RevenueReservation.aggregate(pipelineTyped);

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

/**
 * Get revenue reservation detail with date grouping
 * Groups data by date, calculating totals per date
 */
export const getRevenueReservationDetail = async (
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
    const projectName = req.query.projectName as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const salesManagerName = req.query.salesManagerName as string;
    const salesDirectorName = req.query.salesDirectorName as string;

    // Build match query
    const match: any = {};

    // Apply project filter
    if (projectId && projectId.trim() !== '' && mongoose.Types.ObjectId.isValid(projectId)) {
      match.projectId = new mongoose.Types.ObjectId(projectId);
    } else if (projectId && projectId.trim() !== '' && !mongoose.Types.ObjectId.isValid(projectId)) {
      // If projectId is provided but invalid, return no results
      res.status(200).json({
        success: true,
        message: 'Invalid project ID provided. No results found.',
        data: {
          dateGroups: [],
          pagination: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          filters: { projectId, projectName, startDate, endDate, salesManagerName, salesDirectorName },
        },
      });
      return;
    }

    if (projectName) {
      match.projectName = { $regex: new RegExp(projectName, 'i') };
    }

    if (salesManagerName) {
      match.salesManagerName = { $regex: new RegExp(salesManagerName, 'i') };
    }

    if (salesDirectorName) {
      match.salesDirectorName = { $regex: new RegExp(salesDirectorName, 'i') };
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
          netReservedAmount: {
            $subtract: ['$reservedAmount', '$cancelledAmount'],
          },
        },
      },
    ];

    // Get total count of unique dates matching filters before grouping and pagination
    const countPipeline = [
      ...pipeline,
      {
        $addFields: {
          dateStr: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$date',
            },
          },
        },
      },
      { $group: { _id: '$dateStr' } },
      { $count: 'total' }
    ];
    const countResult = await RevenueReservation.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Group by date and calculate totals
    pipeline.push(
      {
        $addFields: {
          dateStr: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$date',
            },
          },
        },
      },
      {
        $group: {
          _id: '$dateStr',
          date: { $first: '$dateStr' },
          totalAmount: {
            $sum: { $subtract: ['$reservedAmount', '$cancelledAmount'] },
          },
          recordIds: { $push: '$_id' },
        },
      },
      { $sort: { date: -1 } }, // Sort dates descending
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'revenuereservations',
          localField: 'recordIds',
          foreignField: '_id',
          as: 'records',
        },
      },
      {
        $lookup: {
          from: 'projects',
          localField: 'records.projectId',
          foreignField: '_id',
          as: 'projectData',
        },
      },
      {
        $addFields: {
          records: {
            $map: {
              input: '$records',
              as: 'record',
              in: {
                $mergeObjects: [
                  '$$record',
                  {
                    project: {
                      $let: {
                        vars: {
                          matchedProject: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: '$projectData',
                                  as: 'project',
                                  cond: { $eq: ['$$project._id', '$$record.projectId'] },
                                },
                              },
                              0,
                            ],
                          },
                        },
                        in: {
                          $cond: {
                            if: { $ne: ['$$matchedProject', null] },
                            then: {
                              _id: '$$matchedProject._id',
                              projectName: '$$matchedProject.projectName',
                              projectShortName: '$$matchedProject.projectShortName',
                            },
                            else: null,
                          },
                        },
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
          totalAmount: 1,
          records: {
            $map: {
              input: '$records',
              as: 'record',
              in: {
                _id: '$$record._id',
                projectId: '$$record.projectId',
                project: '$$record.project',
                projectName: '$$record.projectName',
                projectShortName: '$$record.projectShortName',
                date: {
                  $cond: {
                    if: { $eq: [{ $type: '$$record.date' }, 'date'] },
                    then: {
                      $dateToString: {
                        format: '%Y-%m-%dT%H:%M:%S.%LZ',
                        date: '$$record.date',
                      },
                    },
                    else: '$$record.date',
                  },
                },
                stName: '$$record.stName',
                salesManagerName: '$$record.salesManagerName',
                salesDirectorName: '$$record.salesDirectorName',
                reservedAmount: '$$record.reservedAmount',
                reservedUnits: '$$record.reservedUnits',
                cancelledUnits: '$$record.cancelledUnits',
                cancelledAmount: '$$record.cancelledAmount',
                netReservedAmount: {
                  $subtract: ['$$record.reservedAmount', '$$record.cancelledAmount'],
                },
                type: '$$record.type',
                dataSource: '$$record.dataSource',
                currency: '$$record.currency',
                createdAt: '$$record.createdAt',
                updatedAt: '$$record.updatedAt',
              },
            },
          },
        },
      },
      { $sort: { date: -1 } } // Final sort by date descending
    );

    const pipelineTyped: PipelineStage[] = pipeline as PipelineStage[];
    const dateGroups = await RevenueReservation.aggregate(pipelineTyped);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Revenue reservation detail retrieved successfully',
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

