import { Response } from 'express';
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

