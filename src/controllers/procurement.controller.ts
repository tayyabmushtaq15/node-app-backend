import { Response } from 'express';
import { AuthRequest } from '../types';
import ProcurementPurchaseOrder from '../models/procurement-purchase-order.model';
import { syncProcurementData } from '../services/procurement-sync.service';
import { sendErrorResponse } from '../utils/errors';
import mongoose from 'mongoose';

/**
 * Trigger manual sync of procurement purchase order data
 */
export const syncProcurement = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    console.log('🔄 Manual procurement sync triggered by user');
    
    const result = await syncProcurementData();

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Procurement purchase order data synced successfully',
        data: {
          entitiesProcessed: result.entitiesProcessed,
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
          entitiesProcessed: result.entitiesProcessed,
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
 * Get procurement purchase orders with pagination and filters
 */
export const getProcurementOrders = async (
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
    const dataAreaId = req.query.dataAreaId as string;
    const venderAccount = req.query.venderAccount as string;
    const purchaseOrderStatus = req.query.purchaseOrderStatus as string;
    const approvalStatus = req.query.approvalStatus as string;
    const fromDate = req.query.fromDate as string;
    const toDate = req.query.toDate as string;
    const minAmount = req.query.minAmount as string;
    const maxAmount = req.query.maxAmount as string;

    // Build query
    const query: Record<string, any> = {};

    if (entityId) {
      query.entityId = entityId;
    }

    if (dataAreaId) {
      query.dataAreaId = dataAreaId.toUpperCase();
    }

    if (venderAccount) {
      query.venderAccount = venderAccount.toUpperCase();
    }

    if (purchaseOrderStatus) {
      query.purchaseOrderStatus = purchaseOrderStatus;
    }

    if (approvalStatus) {
      query.approvalStatus = approvalStatus;
    }

    if (fromDate || toDate) {
      query.createdTimestamp = {};
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        query.createdTimestamp.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        query.createdTimestamp.$lte = to;
      }
    }

    if (minAmount || maxAmount) {
      query.totalAmount = {};
      if (minAmount) {
        query.totalAmount.$gte = parseFloat(minAmount);
      }
      if (maxAmount) {
        query.totalAmount.$lte = parseFloat(maxAmount);
      }
    }

    // Execute query with pagination
    const [records, total] = await Promise.all([
      ProcurementPurchaseOrder.find(query)
        .populate('entityId', 'entityCode entityName')
        .sort({ createdTimestamp: -1 })
        .skip(skip)
        .limit(limit),
      ProcurementPurchaseOrder.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Procurement purchase orders retrieved successfully',
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
          dataAreaId: dataAreaId || null,
          venderAccount: venderAccount || null,
          purchaseOrderStatus: purchaseOrderStatus || null,
          approvalStatus: approvalStatus || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
          minAmount: minAmount || null,
          maxAmount: maxAmount || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get procurement purchase order by purchId
 */
export const getProcurementOrderById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { purchId } = req.params;

    const order = await ProcurementPurchaseOrder.findOne({
      purchId: purchId.toUpperCase(),
    }).populate('entityId', 'entityCode entityName');

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Purchase order not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Purchase order retrieved successfully',
      data: {
        order,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get procurement summary statistics
 */
export const getProcurementSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const dataAreaId = req.query.dataAreaId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const result = await ProcurementPurchaseOrder.getProcurementSummary(
      dataAreaId || null,
      start,
      end
    );

    const summary = result[0] || {
      totalOrders: 0,
      totalAmount: 0,
      averageAmount: 0,
      statusBreakdown: {},
      approvalBreakdown: {},
    };

    res.status(200).json({
      success: true,
      message: 'Procurement summary retrieved successfully',
      data: {
        summary: {
          totalOrders: summary.totalOrders,
          totalAmount: summary.totalAmount,
          averageAmount: summary.averageAmount,
          statusBreakdown: summary.statusBreakdown,
          approvalBreakdown: summary.approvalBreakdown,
        },
        filters: {
          dataAreaId: dataAreaId || null,
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get procurement data for dashboard card
 * Returns current month's total procurement, previous month's total, and percentage change
 */
export const getProcurementCardData = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const entityId = req.query.entityId as string | undefined;
    const dataAreaId = req.query.dataAreaId as string | undefined;

    // Get current month range
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    currentMonthStart.setHours(0, 0, 0, 0);
    const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    currentMonthEnd.setHours(23, 59, 59, 999);

    // Get previous month range
    const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    previousMonthStart.setHours(0, 0, 0, 0);
    const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    previousMonthEnd.setHours(23, 59, 59, 999);

    // Build match query
    const matchQuery: any = {
      approvalStatus: { $ne: 'Draft' }, // Exclude drafts
    };

    if (entityId) {
      matchQuery.entityId = entityId;
    }

    if (dataAreaId) {
      matchQuery.dataAreaId = dataAreaId.toUpperCase();
    }

    // Query procurement orders for both months
    const [currentMonthData, previousMonthData] = await Promise.all([
      ProcurementPurchaseOrder.aggregate([
        {
          $match: {
            ...matchQuery,
            createdTimestamp: { $gte: currentMonthStart, $lte: currentMonthEnd },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' },
          },
        },
      ]),
      ProcurementPurchaseOrder.aggregate([
        {
          $match: {
            ...matchQuery,
            createdTimestamp: { $gte: previousMonthStart, $lte: previousMonthEnd },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' },
          },
        },
      ]),
    ]);

    // Calculate totals
    const currentMonthTotal = currentMonthData[0]?.total || 0;
    const previousMonthTotal = previousMonthData[0]?.total || 0;

    // Calculate absolute change
    const changeAmount = currentMonthTotal - previousMonthTotal;

    // Calculate percentage change
    let percentageChange = 0;
    if (previousMonthTotal === 0) {
      percentageChange = currentMonthTotal > 0 ? 100 : 0;
    } else {
      percentageChange = (changeAmount / previousMonthTotal) * 100;
    }

    // Format month identifiers
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const previousMonthStr = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const percentageFormatted = percentageChange >= 0
      ? `+${percentageChange.toFixed(1)}%`
      : `${percentageChange.toFixed(1)}%`;

    res.status(200).json({
      success: true,
      message: 'Procurement card data retrieved successfully',
      data: {
        currentMonth: {
          month: currentMonthStr,
          totalProcurement: currentMonthTotal,
        },
        previousMonth: {
          month: previousMonthStr,
          totalProcurement: previousMonthTotal,
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
 * Get procurement detail with date grouping
 * Groups data by date, calculating totals per date
 */
export const getProcurementDetail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100; // Default to 100 date groups per page
    const skip = (page - 1) * limit;

    // Filter parameters
    const entityId = req.query.entityId as string;
    const approvalStatus = req.query.approvalStatus as string;
    const vendor = req.query.vendor as string; // UI uses 'vendor', model has 'venderName'
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const minAmount = parseFloat(req.query.minAmount as string);
    const maxAmount = parseFloat(req.query.maxAmount as string);

    // Build match query - exclude Draft orders
    const match: any = {
      approvalStatus: { $ne: 'Draft' },
    };

    // Apply entity filter
    if (entityId && entityId.trim() !== '' && mongoose.Types.ObjectId.isValid(entityId)) {
      match.entityId = new mongoose.Types.ObjectId(entityId);
    } else if (entityId && entityId.trim() !== '' && !mongoose.Types.ObjectId.isValid(entityId)) {
      // If entityId is provided but invalid, return no results
      res.status(200).json({
        success: true,
        message: 'Invalid entity ID provided. No results found.',
        data: {
          dateGroups: [],
          pagination: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          filters: { entityId, approvalStatus, vendor, startDate, endDate, minAmount, maxAmount },
        },
      });
      return;
    }

    // Apply approval status filter
    if (approvalStatus && approvalStatus.trim() !== '') {
      match.approvalStatus = approvalStatus;
    }

    // Apply vendor filter (search in venderName)
    if (vendor && vendor.trim() !== '') {
      match.venderName = { $regex: new RegExp(vendor, 'i') };
    }

    // Date range filter (using createdTimestamp)
    if (startDate || endDate) {
      match.createdTimestamp = {};
      if (startDate) {
        const from = new Date(startDate);
        from.setUTCHours(0, 0, 0, 0);
        match.createdTimestamp.$gte = from;
      }
      if (endDate) {
        const to = new Date(endDate);
        to.setUTCHours(23, 59, 59, 999);
        to.setUTCMilliseconds(999);
        match.createdTimestamp.$lte = to;
      }
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: match },
    ];

    // Apply amount range filter if provided
    if (!isNaN(minAmount) || !isNaN(maxAmount)) {
      const amountMatch: any = {};
      if (!isNaN(minAmount)) {
        amountMatch.$gte = minAmount;
      }
      if (!isNaN(maxAmount)) {
        amountMatch.$lte = maxAmount;
      }
      pipeline.push({ $match: { totalAmount: amountMatch } });
    }

    // Get total count of unique dates matching filters before grouping and pagination
    const countPipeline = [
      ...pipeline,
      {
        $addFields: {
          dateStr: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdTimestamp',
            },
          },
        },
      },
      { $group: { _id: '$dateStr' } },
      { $count: 'total' }
    ];
    const countResult = await ProcurementPurchaseOrder.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Group by date and calculate totals
    pipeline.push(
      {
        $addFields: {
          dateStr: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdTimestamp',
            },
          },
        },
      },
      {
        $group: {
          _id: '$dateStr',
          date: { $first: '$dateStr' },
          totalAmount: { $sum: '$totalAmount' },
          orderIds: { $push: '$_id' },
        },
      },
      { $sort: { date: -1 } }, // Sort dates descending
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'procurementpurchaseorders',
          localField: 'orderIds',
          foreignField: '_id',
          as: 'orders',
        },
      },
      {
        $lookup: {
          from: 'entities',
          localField: 'orders.entityId',
          foreignField: '_id',
          as: 'entityData',
        },
      },
      {
        $addFields: {
          orders: {
            $map: {
              input: '$orders',
              as: 'order',
              in: {
                $mergeObjects: [
                  '$$order',
                  {
                    entityId: {
                      $let: {
                        vars: {
                          matchedEntity: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: '$entityData',
                                  as: 'entity',
                                  cond: { $eq: ['$$entity._id', '$$order.entityId'] },
                                },
                              },
                              0,
                            ],
                          },
                        },
                        in: {
                          $cond: {
                            if: { $ne: ['$$matchedEntity', null] },
                            then: {
                              _id: '$$matchedEntity._id',
                              entityName: '$$matchedEntity.entityName',
                              entityCode: '$$matchedEntity.entityCode',
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
          orders: {
            $map: {
              input: '$orders',
              as: 'order',
              in: {
                _id: '$$order._id',
                purchId: '$$order.purchId',
                entityId: '$$order.entityId',
                venderAccount: '$$order.venderAccount',
                venderName: '$$order.venderName',
                totalAmount: '$$order.totalAmount',
                purchaseOrderStatus: '$$order.purchaseOrderStatus',
                approvalStatus: '$$order.approvalStatus',
                createdTimestamp: {
                  $cond: {
                    if: { $eq: [{ $type: '$$order.createdTimestamp' }, 'date'] },
                    then: {
                      $dateToString: {
                        format: '%Y-%m-%dT%H:%M:%S.%LZ',
                        date: '$$order.createdTimestamp',
                      },
                    },
                    else: '$$order.createdTimestamp',
                  },
                },
                currency: '$$order.currency',
                dataAreaId: '$$order.dataAreaId',
              },
            },
          },
        },
      },
      { $sort: { date: -1 } } // Final sort by date descending
    );

    const dateGroups = await ProcurementPurchaseOrder.aggregate(pipeline);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Procurement detail retrieved successfully',
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
          approvalStatus: approvalStatus || null,
          vendor: vendor || null,
          startDate: startDate || null,
          endDate: endDate || null,
          minAmount: minAmount || null,
          maxAmount: maxAmount || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

