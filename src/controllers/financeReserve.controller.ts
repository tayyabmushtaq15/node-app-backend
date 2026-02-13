import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import FinanceReserveBank from '../models/finance-reserve-bank.model';
import Entity from '../models/entities.model';
import { syncFinanceReserveData } from '../services/financeReserveSync.service';
import { sendErrorResponse } from '../utils/errors';
import { getYesterdayDate, getDayBeforeYesterdayDate } from '../utils/dateUtils';

/**
 * Trigger manual sync of finance reserve data
 */
export const syncFinanceReserve = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { date } = req.body; // Optional date parameter
    
    console.log('🔄 Manual sync triggered by user');
    if (date) {
      console.log(`📅 Using provided date: ${date}`);
    } else {
      console.log(`📅 Using yesterday's date (default)`);
    }
    
    const result = await syncFinanceReserveData(date);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Finance reserve data synced successfully',
        data: {
          date: date || 'yesterday',
          entitiesProcessed: result.entitiesProcessed,
          recordsSaved: result.recordsSaved,
          errors: result.errors.length > 0 ? result.errors : undefined,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Sync completed with errors',
        data: {
          date: date || 'yesterday',
          entitiesProcessed: result.entitiesProcessed,
          recordsSaved: result.recordsSaved,
          errors: result.errors,
        },
      });
    }
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get finance reserve data with pagination and filters
 */
export const getFinanceReserveData = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Filter parameters
    const entityId = req.query.entityId as string;
    const date = req.query.date as string;
    const dataSource = req.query.dataSource as string;
    const fromDate = req.query.fromDate as string;
    const toDate = req.query.toDate as string;

    // Build query
    const query: Record<string, any> = {};

    if (entityId) {
      query.entity = entityId;
    }

    if (date) {
      query.date = date;
    }

    if (dataSource) {
      query.dataSource = dataSource;
    }

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = fromDate;
      if (toDate) query.date.$lte = toDate;
    }

    // Execute query with pagination
    const [records, total] = await Promise.all([
      FinanceReserveBank.find(query)
        .populate('entity', 'entityCode entityName')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      FinanceReserveBank.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Finance reserve data retrieved successfully',
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
          date: date || null,
          dataSource: dataSource || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get all entities
 */
export const getEntities = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const entities = await Entity.find().sort({ entityCode: 1 });

    res.status(200).json({
      success: true,
      message: 'Entities retrieved successfully',
      data: {
        entities,
        count: entities.length,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get entity by ID
 */
export const getEntityById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const entity = await Entity.findById(id);

    if (!entity) {
      res.status(404).json({
        success: false,
        message: 'Entity not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Entity retrieved successfully',
      data: {
        entity,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get liquidity data for dashboard card
 * Returns yesterday's liquidity, day before yesterday's liquidity, and percentage change
 */
export const getLiquidityData = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Get dates
    const yesterday = getYesterdayDate(); // e.g., 2026-01-18
    const dayBeforeYesterday = getDayBeforeYesterdayDate(); // e.g., 2026-01-17

    // Fetch aggregate data (entity = null) for both dates
    // Aggregate data represents total liquidity across all entities
    const [yesterdayData, previousData] = await Promise.all([
      FinanceReserveBank.findOne({
        entity: null,
        date: yesterday,
        dataSource: 'MSD Bank Group Summary sync',
      }),
      FinanceReserveBank.findOne({
        entity: null,
        date: dayBeforeYesterday,
        dataSource: 'MSD Bank Group Summary sync',
      }),
    ]);

    // Calculate liquidity (TotalReserve)
    const liquidity = yesterdayData?.TotalReserve || 0;
    const previousLiquidity = previousData?.TotalReserve || 0;

    // Calculate absolute change
    const change = liquidity - previousLiquidity;

    // Calculate percentage change
    // Handle division by zero: if previousLiquidity is 0, percentage is 0
    let changePercentage = 0;
    if (previousLiquidity > 0) {
      changePercentage = parseFloat(((change / previousLiquidity) * 100).toFixed(2));
    } else if (liquidity > 0 && previousLiquidity === 0) {
      // If we have liquidity but no previous data, show 100% increase
      changePercentage = 100;
    }

    // Get currency from data or default to AED
    const currency = yesterdayData?.Currency || previousData?.Currency || 'AED';

    res.status(200).json({
      success: true,
      message: 'Liquidity data retrieved successfully',
      data: {
        liquidity,
        previousLiquidity,
        change,
        changePercentage,
        yesterdayDate: yesterday,
        previousDate: dayBeforeYesterday,
        currency,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get liquidity summary for dashboard card
 * Returns yesterday's total reserve with percentage change vs day before yesterday
 */
export const getLiquiditySummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Get dates in yyyy-mm-dd format
    const yesterday = getYesterdayDate();
    const dayBeforeYesterday = getDayBeforeYesterdayDate();

    // Fetch aggregate data (entity = null) for both dates
    // Aggregate data represents total liquidity across all entities
    const [yesterdayData, previousDayData] = await Promise.all([
      FinanceReserveBank.findOne({
        entity: null,
        date: yesterday,
        dataSource: 'MSD Bank Group Summary sync',
      }),
      FinanceReserveBank.findOne({
        entity: null,
        date: dayBeforeYesterday,
        dataSource: 'MSD Bank Group Summary sync',
      }),
    ]);

    // Extract values or default to 0
    const yesterdayTotal = yesterdayData?.TotalReserve || 0;
    const yesterdayEscrow = yesterdayData?.EscrowReserve || 0;
    const yesterdayNonEscrow = yesterdayData?.NonEscrowReserve || 0;
    const yesterdayOther = yesterdayData?.OtherReserve || 0;

    const previousDayTotal = previousDayData?.TotalReserve || 0;
    const previousDayEscrow = previousDayData?.EscrowReserve || 0;
    const previousDayNonEscrow = previousDayData?.NonEscrowReserve || 0;
    const previousDayOther = previousDayData?.OtherReserve || 0;

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
      message: 'Liquidity summary retrieved successfully',
      data: {
        yesterday: {
          date: yesterday,
          totalReserve: yesterdayTotal,
          escrowReserve: yesterdayEscrow,
          nonEscrowReserve: yesterdayNonEscrow,
          otherReserve: yesterdayOther,
        },
        previousDay: {
          date: dayBeforeYesterday,
          totalReserve: previousDayTotal,
          escrowReserve: previousDayEscrow,
          nonEscrowReserve: previousDayNonEscrow,
          otherReserve: previousDayOther,
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
 * Get liquidity detail with date grouping
 * Groups data by date and returns paginated results
 */
export const getLiquidityDetail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100; // Default to 100 records per page
    const skip = (page - 1) * limit;

    // Filter parameters
    const entityId = req.query.entityId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const minTotalReserve = parseFloat(req.query.minTotalReserve as string);
    const maxTotalReserve = parseFloat(req.query.maxTotalReserve as string);

    // Build match query
    const match: any = {};

    if (entityId && entityId.trim() !== '' && mongoose.Types.ObjectId.isValid(entityId)) {
      match.entity = new mongoose.Types.ObjectId(entityId);
    } else if (entityId && entityId.trim() !== '' && !mongoose.Types.ObjectId.isValid(entityId)) {
      // If entityId is provided but invalid, return no results
      res.status(200).json({
        success: true,
        message: 'Invalid entity ID provided. No results found.',
        data: {
          dateGroups: [],
          pagination: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          filters: { entityId, startDate, endDate, minTotalReserve, maxTotalReserve },
        },
      });
      return;
    }

    // Date range filter (date is stored as string in yyyy-mm-dd format)
    if (startDate || endDate) {
      match.date = {};
      if (startDate) {
        match.date.$gte = startDate;
      }
      if (endDate) {
        match.date.$lte = endDate;
      }
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          totalReserve: '$TotalReserve',
        },
      },
    ];

    // Apply total reserve range filter if provided
    if (!isNaN(minTotalReserve) || !isNaN(maxTotalReserve)) {
      const reserveMatch: any = {};
      if (!isNaN(minTotalReserve)) {
        reserveMatch.$gte = minTotalReserve;
      }
      if (!isNaN(maxTotalReserve)) {
        reserveMatch.$lte = maxTotalReserve;
      }
      pipeline.push({ $match: { totalReserve: reserveMatch } });
    }

    // Get total count of unique dates matching filters before grouping and pagination
    const countPipeline = [
      ...pipeline,
      { $group: { _id: '$date' } },
      { $count: 'total' }
    ];
    const countResult = await FinanceReserveBank.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Separate aggregate records (entity = null) from entity-specific records (entity != null)
    // Group by date and separate aggregate vs entity records
    pipeline.push(
      {
        $group: {
          _id: '$date',
          date: { $first: '$date' },
          // Store aggregate record (entity = null) separately
          aggregateRecord: {
            $push: {
              $cond: [
                { $eq: ['$entity', null] },
                {
                  _id: '$_id',
                  EscrowReserve: '$EscrowReserve',
                  NonEscrowReserve: '$NonEscrowReserve',
                  OtherReserve: '$OtherReserve',
                  TotalReserve: '$TotalReserve',
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
          // Store entity-specific record IDs (entity != null)
          entityRecordIds: {
            $push: {
              $cond: [
                { $ne: ['$entity', null] },
                '$_id',
                '$$REMOVE',
              ],
            },
          },
        },
      },
      {
        $addFields: {
          // Extract aggregate record (should be only one)
          aggregate: { $arrayElemAt: ['$aggregateRecord', 0] },
        },
      },
      {
        $addFields: {
          // Use aggregate record for summary totals, fallback to 0 if not exists
          escrowReserve: {
            $ifNull: ['$aggregate.EscrowReserve', 0],
          },
          nonEscrowReserve: {
            $ifNull: ['$aggregate.NonEscrowReserve', 0],
          },
          otherReserve: {
            $ifNull: ['$aggregate.OtherReserve', 0],
          },
          totalReserve: {
            $ifNull: ['$aggregate.TotalReserve', 0],
          },
        },
      },
      { $sort: { date: -1 } }, // Sort dates descending
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'financereservebanks',
          localField: 'entityRecordIds',
          foreignField: '_id',
          as: 'entityRecords',
        },
      },
      {
        $unwind: {
          path: '$entityRecords',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'entities',
          localField: 'entityRecords.entity',
          foreignField: '_id',
          as: 'entityData',
        },
      },
      {
        $addFields: {
          'entityRecords.entity': {
            $cond: {
              if: { $gt: [{ $size: '$entityData' }, 0] },
              then: {
                _id: { $arrayElemAt: ['$entityData._id', 0] },
                entityCode: { $arrayElemAt: ['$entityData.entityCode', 0] },
                entityName: { $arrayElemAt: ['$entityData.entityName', 0] },
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
          escrowReserve: { $first: '$escrowReserve' },
          nonEscrowReserve: { $first: '$nonEscrowReserve' },
          otherReserve: { $first: '$otherReserve' },
          totalReserve: { $first: '$totalReserve' },
          records: {
            $push: {
              $cond: [
                { $ne: ['$entityRecords', null] },
                {
                  _id: '$entityRecords._id',
                  entity: '$entityRecords.entity',
                  date: '$entityRecords.date',
                  EscrowReserve: '$entityRecords.EscrowReserve',
                  NonEscrowReserve: '$entityRecords.NonEscrowReserve',
                  OtherReserve: '$entityRecords.OtherReserve',
                  TotalReserve: '$entityRecords.TotalReserve',
                  Currency: '$entityRecords.Currency',
                  dataSource: '$entityRecords.dataSource',
                  lastSyncDateTime: '$entityRecords.lastSyncDateTime',
                  createdAt: '$entityRecords.createdAt',
                  updatedAt: '$entityRecords.updatedAt',
                },
                '$$REMOVE',
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: 1,
          escrowReserve: 1,
          nonEscrowReserve: 1,
          otherReserve: 1,
          totalReserve: 1,
          records: 1,
        },
      },
      { $sort: { date: -1 } } // Final sort by date descending (most recent first)
    );

    const dateGroups = await FinanceReserveBank.aggregate(pipeline);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Liquidity detail retrieved successfully',
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
          entityId: entityId || null,
          startDate: startDate || null,
          endDate: endDate || null,
          minTotalReserve: minTotalReserve || null,
          maxTotalReserve: maxTotalReserve || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

