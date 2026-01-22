import axios from 'axios';
import GoogleReview from '../models/google-review.model';

const WINDSOR_API_KEY = process.env.WINDSOR_API_KEY;
const WINDSOR_URL = 'https://connectors.windsor.ai/google_my_business';

const ratingMap: { [key: string]: number } = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export const fetchAndStoreGoogleReviews = async (): Promise<void> => {
  console.log('🔄 Starting FULL Google Reviews sync (Windsor → MongoDB)');

  try {
    console.log('🔑 Using API Key:', WINDSOR_API_KEY);
    console.log('🌍 Windsor Endpoint:', WINDSOR_URL);

    const date_from = '2000-01-01';
    const date_to = new Date().toISOString().split('T')[0];

    // 1️⃣ Fetch all reviews from Windsor
    const { data: responseData } = await axios.get(WINDSOR_URL, {
      params: {
        api_key: WINDSOR_API_KEY,
        date_from,
        date_to,
        fields:
          'review_id,date,review_comment,review_reviewer,review_star_rating,review_average_rating_total,review_total_count',
      },
    });

    const rawData = Array.isArray(responseData)
      ? responseData
      : responseData?.data || [];

    console.log(`📡 API returned ${rawData.length} records`);

    if (!rawData.length) {
      console.warn('⚠️ No reviews returned — skipping DB update');
      return;
    }

    // 2️⃣ Normalize all API data
    const reviewsToInsert = rawData.map((r: any) => ({
      reviewId: r.review_id || null,
      date: new Date(r.date),
      reviewer: (r.review_reviewer || 'Anonymous').trim(),
      comment: (r.review_comment || '').trim(),
      starRating: ratingMap[r.review_star_rating] || null,
      avgRating: r.review_average_rating_total || 0,
      totalReviewCount: r.review_total_count || 0,
      isVerified: false,
      sentiment:
        (ratingMap[r.review_star_rating] >= 4
          ? 'positive'
          : ratingMap[r.review_star_rating] <= 2
          ? 'negative'
          : 'neutral') as 'positive' | 'neutral' | 'negative',
    }));

    console.log(`🧩 Normalized ${reviewsToInsert.length} reviews`);

    // 3️⃣ Wipe local DB and reinsert everything
    console.log('🗑️ Deleting all existing reviews from DB...');
    const deleted = await GoogleReview.deleteMany({});
    console.log(`✅ Deleted ${deleted.deletedCount} old reviews`);

    console.log('🧾 Bulk inserting new reviews...');
    await GoogleReview.insertMany(reviewsToInsert, { ordered: false });
    console.log(`✅ Inserted ${reviewsToInsert.length} new reviews`);

    const finalCount = await GoogleReview.countDocuments();
    console.log(`📊 Final DB count: ${finalCount}`);
    console.log('🎯 Full sync completed successfully');
  } catch (err: any) {
    console.error('❌ Error syncing Google Reviews:', err.message);
    if (err.response?.data) console.error('📥 API error:', err.response.data);
  }
};

