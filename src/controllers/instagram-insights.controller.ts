import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import InstagramInsights from '../models/instagram-insights.model';
import { syncInstagramData } from '../services/instagram-sync.service';
import { sendErrorResponse, AppError } from '../utils/errors';

/**
 * Manual trigger for Instagram data sync (Admin only)
 */
export const syncInstagramInsights = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    console.log('🔄 Manual Instagram sync triggered by user');

    await syncInstagramData();

    res.status(200).json({
      success: true,
      message: 'Instagram data synced successfully',
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get Instagram insights with pagination and filters
 */
export const getInstagramInsights = async (
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
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build match query
    const match: any = {
      platform: 'INSTAGRAM',
    };

    // Apply entity filter
    if (entityId && typeof entityId === 'string' && entityId.trim() !== '') {
      if (mongoose.Types.ObjectId.isValid(entityId)) {
        match.entity = new mongoose.Types.ObjectId(entityId);
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

    // Get total count
    const total = await InstagramInsights.countDocuments(match);

    // Get paginated results
    const records = await InstagramInsights.find(match)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .populate('entity', 'entityName entityCode')
      .lean();

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Instagram insights retrieved successfully',
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
 * Get Instagram dashboard stats (latest snapshot with month-to-date)
 */
export const getInstagramDashboardStats = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Get latest record for Instagram
    const latest = await InstagramInsights.findOne({
      platform: 'INSTAGRAM',
    }).sort({ date: -1, updatedAt: -1 });

    if (!latest) {
      res.status(200).json({
        success: true,
        data: {
          totalFollowers: 0,
          newFollowers: 0,
          reach: 0,
          posts: 0,
          monthToDateFollowers: 0,
        },
      });
      return;
    }

    // Calculate Month-To-Date range
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
    );

    // Get first record of this month (at or after month start)
    const startOfMonthRecord = await InstagramInsights.findOne({
      platform: 'INSTAGRAM',
      date: { $gte: monthStart },
    }).sort({ date: 1 }); // earliest in month

    let monthToDateFollowers = 0;
    if (startOfMonthRecord) {
      monthToDateFollowers =
        latest.totalFollower - startOfMonthRecord.totalFollower;
      if (monthToDateFollowers < 0) monthToDateFollowers = 0; // safety guard
    }

    // Return formatted response
    res.status(200).json({
      success: true,
      data: {
        totalFollowers: latest.totalFollower,
        newFollowers: latest.newFollowers,
        reach: latest.totalReach,
        posts: latest.posts || 0,
        lastSync: latest.lastSyncDateTime,
        monthToDateFollowers,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get Instagram trends over time period
 */
export const getInstagramTrends = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const entityId = req.query.entityId as string;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const match: any = {
      platform: 'INSTAGRAM',
      date: { $gte: startDate },
    };

    if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
      match.entity = new mongoose.Types.ObjectId(entityId);
    }

    const trends = await InstagramInsights.find(match)
      .sort({ date: 1 })
      .select('date totalFollower newFollowers totalReach posts')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Instagram trends retrieved successfully',
      data: {
        trends,
        period: {
          days,
          startDate,
          endDate: new Date(),
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

