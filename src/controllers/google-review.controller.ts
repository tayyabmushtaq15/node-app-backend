import { Response } from 'express';
import { AuthRequest } from '../types';
import GoogleReview from '../models/google-review.model';
import { fetchAndStoreGoogleReviews } from '../services/google-review-sync.service';
import { sendErrorResponse, AppError } from '../utils/errors';

/**
 * Manual trigger for Google Reviews sync (Admin only)
 */
export const syncGoogleReviews = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    console.log('🔄 Manual Google Reviews sync triggered by user');

    await fetchAndStoreGoogleReviews();

    res.status(200).json({
      success: true,
      message: 'Google Reviews synced successfully',
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get Google Reviews with pagination, filters, and sorting
 */
export const getGoogleReviews = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Filter parameters
    const startDate = req.query.from as string;
    const endDate = req.query.to as string;
    const minRating = req.query.minRating
      ? parseInt(req.query.minRating as string)
      : null;
    const sortBy = (req.query.sortBy as string) || 'date';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    // Build match query
    const match: any = {};

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

    // Rating filter
    if (minRating !== null) {
      match.starRating = { $gte: minRating };
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count
    const total = await GoogleReview.countDocuments(match);

    // Get paginated results
    const reviews = await GoogleReview.find(match)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Google Reviews retrieved successfully',
      data: {
        reviews,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
          minRating: minRating || null,
          sortBy,
          sortOrder,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get review statistics
 */
export const getReviewStatistics = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const startDate = req.query.from ? new Date(req.query.from as string) : null;
    const endDate = req.query.to ? new Date(req.query.to as string) : null;

    // Build match query
    const match: any = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) {
        match.date.$gte = startDate;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }

    // Get statistics using aggregation
    const stats = await GoogleReview.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$starRating' },
          positiveReviews: {
            $sum: { $cond: [{ $eq: ['$sentiment', 'positive'] }, 1, 0] },
          },
          neutralReviews: {
            $sum: { $cond: [{ $eq: ['$sentiment', 'neutral'] }, 1, 0] },
          },
          negativeReviews: {
            $sum: { $cond: [{ $eq: ['$sentiment', 'negative'] }, 1, 0] },
          },
          fiveStar: {
            $sum: { $cond: [{ $eq: ['$starRating', 5] }, 1, 0] },
          },
          fourStar: {
            $sum: { $cond: [{ $eq: ['$starRating', 4] }, 1, 0] },
          },
          threeStar: {
            $sum: { $cond: [{ $eq: ['$starRating', 3] }, 1, 0] },
          },
          twoStar: {
            $sum: { $cond: [{ $eq: ['$starRating', 2] }, 1, 0] },
          },
          oneStar: {
            $sum: { $cond: [{ $eq: ['$starRating', 1] }, 1, 0] },
          },
        },
      },
    ]);

    const result = stats[0] || {
      totalReviews: 0,
      averageRating: 0,
      positiveReviews: 0,
      neutralReviews: 0,
      negativeReviews: 0,
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      twoStar: 0,
      oneStar: 0,
    };

    res.status(200).json({
      success: true,
      message: 'Review statistics retrieved successfully',
      data: {
        totalReviews: result.totalReviews,
        averageRating: result.averageRating
          ? Number(result.averageRating.toFixed(2))
          : 0,
        sentimentBreakdown: {
          positive: result.positiveReviews,
          neutral: result.neutralReviews,
          negative: result.negativeReviews,
        },
        ratingBreakdown: {
          fiveStar: result.fiveStar,
          fourStar: result.fourStar,
          threeStar: result.threeStar,
          twoStar: result.twoStar,
          oneStar: result.oneStar,
        },
        dateRange: {
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
 * Get all Google Reviews for dashboard (with yesterday/MTD counts)
 */
export const getAllGoogleReviews = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const sortBy = (req.query.sortBy as string) || 'date';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    const skip = (page - 1) * limit;
    const sort: any = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get all reviews for counting
    const allReviews = await GoogleReview.find().lean();

    // Current time context
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate Yesterday and Month-To-Date counts
    const yesterdayCount = allReviews.filter((r) => {
      const created = r.date ? new Date(r.date) : null;
      if (!created) return false;
      return created >= yesterdayStart && created <= yesterdayEnd;
    }).length;

    const monthToDateCount = allReviews.filter((r) => {
      const created = r.date ? new Date(r.date) : null;
      if (!created) return false;
      return created >= monthStart && created <= now;
    }).length;

    // Normal paginated results
    const [reviews, total] = await Promise.all([
      GoogleReview.find().sort(sort).skip(skip).limit(limit).lean(),
      GoogleReview.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      message: 'All Google Reviews retrieved successfully',
      data: {
        reviews,
        stats: {
          total,
          yesterday: yesterdayCount,
          monthToDate: monthToDateCount,
        },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

