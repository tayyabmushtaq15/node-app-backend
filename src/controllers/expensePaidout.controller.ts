import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import FinanceExpensePaidout from '../models/finance-expense-paidout.model';
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
 * Returns current month vs previous month payout with percentage change
 */
export const getExpenseSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const entityId = req.query.entityId as string | undefined;
    const today = new Date();
    
    // Current month start (first day of current month, 00:00:00 UTC)
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    currentMonthStart.setUTCHours(0, 0, 0, 0);

    // Current month end (today, end of day UTC)
    const currentMonthEnd = new Date(today);
    currentMonthEnd.setUTCHours(23, 59, 59, 999);
    currentMonthEnd.setUTCMilliseconds(999);

    // Previous month start (first day of previous month, 00:00:00 UTC)
    const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    previousMonthStart.setUTCHours(0, 0, 0, 0);

    // Previous month end (last day of previous month, 23:59:59 UTC)
    const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    previousMonthEnd.setUTCHours(23, 59, 59, 999);
    previousMonthEnd.setUTCMilliseconds(999);

    const match: any = {};
    if (entityId) match.entity = entityId;

    // Helper to aggregate expenses for a date range
    const aggregateExpenses = async (from: Date, to: Date) => {
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
            opsExpenses: { $sum: '$Ops_Expenses' },
            landExpenses: { $sum: '$Land_Expenses' },
            constructionExpenses: { $sum: '$Construction_Expenses' },
            cashExpenses: { $sum: '$cash_expense' },
            totalPayout: {
              $sum: {
                $add: [
                  '$Ops_Expenses',
                  '$Land_Expenses',
                  '$Construction_Expenses',
                  '$cash_expense',
                ],
              },
            },
          },
        },
      ]);

      return res[0] || {
        opsExpenses: 0,
        landExpenses: 0,
        constructionExpenses: 0,
        cashExpenses: 0,
        totalPayout: 0,
      };
    };

    const [currentMonthData, previousMonthData] = await Promise.all([
      aggregateExpenses(currentMonthStart, currentMonthEnd),
      aggregateExpenses(previousMonthStart, previousMonthEnd),
    ]);

    // Calculate percentage change
    const changeAmount = currentMonthData.totalPayout - previousMonthData.totalPayout;
    let percentageChange = 0;
    if (previousMonthData.totalPayout === 0) {
      percentageChange = currentMonthData.totalPayout > 0 ? 100 : 0;
    } else {
      percentageChange = (changeAmount / previousMonthData.totalPayout) * 100;
    }

    const percentageFormatted = percentageChange >= 0
      ? `+${percentageChange.toFixed(1)}%`
      : `${percentageChange.toFixed(1)}%`;

    // Format month strings
    const currentMonth = currentMonthStart.getMonth() + 1;
    const previousMonth = previousMonthStart.getMonth() + 1;
    const currentMonthStr = `${currentMonthStart.getFullYear()}-${currentMonth < 10 ? '0' : ''}${currentMonth}`;
    const previousMonthStr = `${previousMonthStart.getFullYear()}-${previousMonth < 10 ? '0' : ''}${previousMonth}`;

    res.status(200).json({
      success: true,
      message: 'Expense summary retrieved successfully',
      data: {
        currentMonth: {
          month: currentMonthStr,
          totalPayout: currentMonthData.totalPayout,
          opsExpenses: currentMonthData.opsExpenses,
          landExpenses: currentMonthData.landExpenses,
          constructionExpenses: currentMonthData.constructionExpenses,
          cashExpenses: currentMonthData.cashExpenses,
        },
        previousMonth: {
          month: previousMonthStr,
          totalPayout: previousMonthData.totalPayout,
          opsExpenses: previousMonthData.opsExpenses,
          landExpenses: previousMonthData.landExpenses,
          constructionExpenses: previousMonthData.constructionExpenses,
          cashExpenses: previousMonthData.cashExpenses,
        },
        change: {
          amount: changeAmount,
          percentage: percentageChange,
          percentageFormatted,
        },
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

/**
 * Get expense paidout detail with month grouping
 * Groups data by month, then by date within each month
 */
export const getExpensePaidoutDetail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    // Filter parameters
    const entityId = req.query.entityId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const minTotalPayout = parseFloat(req.query.minTotalPayout as string);
    const maxTotalPayout = parseFloat(req.query.maxTotalPayout as string);

    // Build match query
    const match: any = {};

    if (entityId && entityId.trim() !== '') {
      // Convert entityId string to MongoDB ObjectId if valid
      if (mongoose.Types.ObjectId.isValid(entityId)) {
        match.entity = new mongoose.Types.ObjectId(entityId);
      } else {
        // If not a valid ObjectId, return empty results
        res.status(200).json({
          success: true,
          message: 'Expense paidout detail retrieved successfully',
          data: {
            monthGroups: [],
            pagination: {
              total: 0,
              page,
              limit,
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: false,
            },
            filters: {
              entityId: entityId || null,
              startDate: startDate || null,
              endDate: endDate || null,
              minTotalPayout: !isNaN(minTotalPayout) ? minTotalPayout : null,
              maxTotalPayout: !isNaN(maxTotalPayout) ? maxTotalPayout : null,
            },
          },
        });
        return;
      }
    }

    // Date range filter
    if (startDate || endDate) {
      match.date = {};
      if (startDate) {
        const from = new Date(startDate);
        from.setHours(0, 0, 0, 0);
        match.date.$gte = from;
      }
      if (endDate) {
        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
        match.date.$lte = to;
      }
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          totalPayout: {
            $add: [
              '$Ops_Expenses',
              '$Land_Expenses',
              '$Construction_Expenses',
              '$cash_expense',
            ],
          },
        },
      },
    ];

    // Apply total payout range filter if provided
    if (!isNaN(minTotalPayout) || !isNaN(maxTotalPayout)) {
      const payoutMatch: any = {};
      if (!isNaN(minTotalPayout)) {
        payoutMatch.$gte = minTotalPayout;
      }
      if (!isNaN(maxTotalPayout)) {
        payoutMatch.$lte = maxTotalPayout;
      }
      pipeline.push({ $match: { totalPayout: payoutMatch } });
    }

    // Group by month, then by date
    pipeline.push(
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$date' } },
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          },
          opsExpenses: { $sum: '$Ops_Expenses' },
          landExpenses: { $sum: '$Land_Expenses' },
          constructionExpenses: { $sum: '$Construction_Expenses' },
          cashExpenses: { $sum: '$cash_expense' },
          totalPayout: { $sum: '$totalPayout' },
          recordIds: { $push: '$_id' },
        },
      },
      {
        $group: {
          _id: '$_id.month',
          month: { $first: '$_id.month' },
          dateGroups: {
            $push: {
              date: '$_id.date',
              opsExpenses: '$opsExpenses',
              landExpenses: '$landExpenses',
              constructionExpenses: '$constructionExpenses',
              cashExpenses: '$cashExpenses',
              totalPayout: '$totalPayout',
              recordIds: '$recordIds',
            },
          },
        },
      },
      {
        $addFields: {
          totalPayout: {
            $reduce: {
              input: '$dateGroups',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.totalPayout'] },
            },
          },
          opsExpenses: {
            $reduce: {
              input: '$dateGroups',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.opsExpenses'] },
            },
          },
          landExpenses: {
            $reduce: {
              input: '$dateGroups',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.landExpenses'] },
            },
          },
          constructionExpenses: {
            $reduce: {
              input: '$dateGroups',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.constructionExpenses'] },
            },
          },
          cashExpenses: {
            $reduce: {
              input: '$dateGroups',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.cashExpenses'] },
            },
          },
        },
      },
      { $sort: { month: -1 } }
    );

    // Get total count of months
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await FinanceExpensePaidout.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Apply pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Execute aggregation
    const monthGroups = await FinanceExpensePaidout.aggregate(pipeline);

    // Fetch individual records for each date group
    const monthGroupsWithRecords = await Promise.all(
      monthGroups.map(async (monthGroup) => {
        const dateGroupsWithRecords = await Promise.all(
          monthGroup.dateGroups.map(async (dateGroup: any) => {
            const records = await FinanceExpensePaidout.find({
              _id: { $in: dateGroup.recordIds },
            })
              .populate('entity', 'entityCode entityName')
              .sort({ date: -1 });

            return {
              date: dateGroup.date,
              opsExpenses: dateGroup.opsExpenses,
              landExpenses: dateGroup.landExpenses,
              constructionExpenses: dateGroup.constructionExpenses,
              cashExpenses: dateGroup.cashExpenses,
              totalPayout: dateGroup.totalPayout,
              records: records.map((record) => ({
                _id: record._id,
                entity: record.entity,
                date: record.date,
                Ops_Expenses: record.Ops_Expenses,
                Land_Expenses: record.Land_Expenses,
                Construction_Expenses: record.Construction_Expenses,
                cash_expense: record.cash_expense,
                Currency: record.Currency,
                data_source: record.data_source,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
              })),
            };
          })
        );

        // Sort date groups by date descending
        dateGroupsWithRecords.sort((a, b) => b.date.localeCompare(a.date));

        return {
          month: monthGroup.month,
          totalPayout: monthGroup.totalPayout,
          opsExpenses: monthGroup.opsExpenses,
          landExpenses: monthGroup.landExpenses,
          constructionExpenses: monthGroup.constructionExpenses,
          cashExpenses: monthGroup.cashExpenses,
          dateGroups: dateGroupsWithRecords,
        };
      })
    );

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Expense paidout detail retrieved successfully',
      data: {
        monthGroups: monthGroupsWithRecords,
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
          minTotalPayout: !isNaN(minTotalPayout) ? minTotalPayout : null,
          maxTotalPayout: !isNaN(maxTotalPayout) ? maxTotalPayout : null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

