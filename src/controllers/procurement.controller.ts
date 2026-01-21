import { Response } from 'express';
import { AuthRequest } from '../types';
import ProcurementPurchaseOrder from '../models/procurement-purchase-order.model';
import { syncProcurementData } from '../services/procurement-sync.service';
import { sendErrorResponse } from '../utils/errors';

/**
 * Trigger manual sync of procurement purchase order data
 */
export const syncProcurement = async (
  req: AuthRequest,
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
    const procurement = currentMonthData[0]?.total || 0;
    const previousProcurement = previousMonthData[0]?.total || 0;

    // Calculate absolute change
    const change = procurement - previousProcurement;

    // Calculate percentage change
    let changePercentage = 0;
    if (previousProcurement > 0) {
      changePercentage = parseFloat(((change / previousProcurement) * 100).toFixed(1));
    } else if (procurement > 0 && previousProcurement === 0) {
      // If we have procurement but no previous data, show 100% increase
      changePercentage = 100;
    }

    // Format month identifiers
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;

    res.status(200).json({
      success: true,
      message: 'Procurement card data retrieved successfully',
      data: {
        procurement,
        previousProcurement,
        change,
        changePercentage,
        currentMonth,
        previousMonth,
        currency: 'AED',
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

