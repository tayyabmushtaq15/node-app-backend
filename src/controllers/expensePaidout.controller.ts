import { Response } from 'express';
import { AuthRequest } from '../types';
import FinanceExpensePaidout from '../models/finance-expense-paidout.model';
import Entity from '../models/entities.model';
import { syncExpensePaidoutData } from '../services/expense-paidout-sync.service';
import { sendErrorResponse } from '../utils/errors';

/**
 * Trigger manual sync of expense paidout data
 */
export const syncExpensePaidout = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { days } = req.body; // Optional days parameter (default: 30)
    const syncDays = days && typeof days === 'number' ? days : 30;
    
    console.log('🔄 Manual expense paidout sync triggered by user');
    console.log(`📅 Syncing ${syncDays} days of data`);
    
    const result = await syncExpensePaidoutData(syncDays);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Expense paidout data synced successfully',
        data: {
          days: syncDays,
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
          days: syncDays,
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
 * Get expense paidout data with pagination and filters
 */
export const getExpensePaidoutData = async (
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
      const dateObj = new Date(date);
      dateObj.setHours(0, 0, 0, 0);
      const nextDay = new Date(dateObj);
      nextDay.setDate(nextDay.getDate() + 1);
      query.date = { $gte: dateObj, $lt: nextDay };
    }

    if (dataSource) {
      query.data_source = { $regex: dataSource, $options: 'i' };
    }

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        query.date.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        query.date.$lte = to;
      }
    }

    // Execute query with pagination
    const [records, total] = await Promise.all([
      FinanceExpensePaidout.find(query)
        .populate('entity', 'entityCode entityName')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      FinanceExpensePaidout.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Expense paidout data retrieved successfully',
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
 * Get expense summary statistics
 * Returns yesterday vs day before, last 30 days vs previous 30 days
 */
export const getExpenseSummary = async (
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

    // Day before yesterday
    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

    // Last 30 days (excluding today)
    const last30From = new Date(today);
    last30From.setDate(last30From.getDate() - 30);
    const last30To = new Date(yesterday);

    // Previous 30 days (31–60 days ago)
    const prev30From = new Date(last30From);
    prev30From.setDate(prev30From.getDate() - 30);
    const prev30To = new Date(last30From);
    prev30To.setDate(prev30To.getDate() - 1);

    const match: any = {};
    if (entityId) match.entity = entityId;

    // Helper to sum expenses
    const aggregateTotal = async (from: Date, to: Date): Promise<number> => {
      const res = await FinanceExpensePaidout.aggregate([
        {
          $match: {
            ...match,
            date: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $add: [
                  '$Ops_Expenses',
                  '$Land_Expenses',
                  '$Construction_Expenses',
                ],
              },
            },
          },
        },
      ]);

      return res[0]?.total || 0;
    };

    const [yesterdayTotal, prevDayTotal, last30Total, prev30Total] =
      await Promise.all([
        aggregateTotal(yesterday, yesterday),
        aggregateTotal(dayBeforeYesterday, dayBeforeYesterday),
        aggregateTotal(last30From, last30To),
        aggregateTotal(prev30From, prev30To),
      ]);

    const dayChange =
      prevDayTotal > 0
        ? parseFloat(
            (((yesterdayTotal - prevDayTotal) / prevDayTotal) * 100).toFixed(1)
          )
        : 0;

    const pnlChange =
      prev30Total > 0
        ? parseFloat(
            (((last30Total - prev30Total) / prev30Total) * 100).toFixed(1)
          )
        : 0;

    res.status(200).json({
      success: true,
      message: 'Expense summary retrieved successfully',
      data: {
        yesterdayPayout: yesterdayTotal,
        dayChangePercent: dayChange,
        last30DaysTotal: last30Total,
        previous30DaysTotal: prev30Total,
        pnlChangePercent: pnlChange,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get expense category summary
 * Returns totals by category (Ops, Land, Construction, Cash)
 */
export const getExpenseCategorySummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const entityId = req.query.entityId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const match: any = {};
    if (entityId) match.entity = entityId;

    // Apply date range filter if provided
    if (startDate && endDate) {
      match.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Aggregate totals by category
    const result = await FinanceExpensePaidout.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOps: { $sum: '$Ops_Expenses' },
          totalLand: { $sum: '$Land_Expenses' },
          totalConstruction: { $sum: '$Construction_Expenses' },
          totalCash: { $sum: '$cash_expense' },
          minDate: { $min: '$date' },
          maxDate: { $max: '$date' },
        },
      },
    ]);

    const totals = result[0] || {
      totalOps: 0,
      totalLand: 0,
      totalConstruction: 0,
      totalCash: 0,
      minDate: startDate ? new Date(startDate) : null,
      maxDate: endDate ? new Date(endDate) : null,
    };

    const totalExpense =
      totals.totalOps +
      totals.totalLand +
      totals.totalConstruction +
      totals.totalCash;

    const categories = [
      {
        category: 'Operations',
        amount: totals.totalOps,
        percentage: totalExpense
          ? parseFloat(((totals.totalOps / totalExpense) * 100).toFixed(1))
          : 0,
      },
      {
        category: 'Land',
        amount: totals.totalLand,
        percentage: totalExpense
          ? parseFloat(((totals.totalLand / totalExpense) * 100).toFixed(1))
          : 0,
      },
      {
        category: 'Construction',
        amount: totals.totalConstruction,
        percentage: totalExpense
          ? parseFloat(
              ((totals.totalConstruction / totalExpense) * 100).toFixed(1)
            )
          : 0,
      },
      {
        category: 'Cash',
        amount: totals.totalCash,
        percentage: totalExpense
          ? parseFloat(((totals.totalCash / totalExpense) * 100).toFixed(1))
          : 0,
      },
    ];

    res.status(200).json({
      success: true,
      message: 'Expense category summary retrieved successfully',
      data: {
        totalExpense,
        categories,
        startDate: startDate || totals.minDate,
        endDate: endDate || totals.maxDate,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

