import axios from 'axios';
import mongoose from 'mongoose';
import Entity from '../models/entities.model';
import InstagramInsights from '../models/instagram-insights.model';

const WINDSOR_API_KEY = process.env.WINDSOR_INSTAGRAM_API_KEY;

async function getLdpEntity(): Promise<mongoose.Types.ObjectId | null> {
  const entity = await Entity.findOne({ entityCode: "LDP" });
  return entity ? entity._id : null;
}

export async function syncInstagramData(): Promise<void> {
  try {
    const entityId = await getLdpEntity();
    if (!entityId) {
      console.error('❌ LDP entity not found');
      return;
    }

    const baseUrl = 'https://connectors.windsor.ai/instagram';

    // --- Fetch all-time stats (total followers, posts, etc.) ---
    const allTimeRes = await axios.get(baseUrl, {
      params: {
        api_key: WINDSOR_API_KEY,
        fields:
          'account_id,account_name,followers_count,follows_count,media_count,name,user_name,username,website',
        date_preset: 'last_1d',
      },
    });

    const allTimeData = allTimeRes.data?.data?.[0] || {};
    console.log('allTimeData', allTimeData);

    const totalFollowers = allTimeData.followers_count || 0;
    const totalPosts = allTimeData.media_count || 0;

    // --- Fetch yesterday's stats (reach, daily changes, etc.) ---
    const yesterdayRes = await axios.get(baseUrl, {
      params: {
        api_key: WINDSOR_API_KEY,
        fields: 'date,account_name,followers_count,reach,reach_1d',
        date_preset: 'last_1d',
      },
    });

    const yesterdayData = yesterdayRes.data?.data?.[0] || {};
    const currentFollowers = yesterdayData.followers_count || totalFollowers;
    const reach = yesterdayData.reach || 0;

    // --- Date Calculations ---
    const today = new Date();
    const yesterday = new Date();
    yesterday.setUTCDate(today.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const twoDaysAgo = new Date();
    twoDaysAgo.setUTCDate(yesterday.getUTCDate() - 1);

    // --- Fetch previous day's followers from DB ---
    const previousRecord = await InstagramInsights.findOne({
      entity: entityId,
      platform: 'INSTAGRAM',
      date: { $lt: twoDaysAgo }, // ✅ find latest before yesterday
    }).sort({ date: -1 });

    const previousFollowers = previousRecord?.totalFollower || 0;
    const newFollowers = Math.max(0, currentFollowers - previousFollowers);

    console.log('📊 Instagram Followers Calculation:');
    console.log(`   Current (API): ${currentFollowers}`);
    console.log(`   Previous (DB): ${previousFollowers}`);
    console.log(`   New Followers: ${newFollowers}`);

    // --- Prevent duplicate record for same day ---
    const existing = await InstagramInsights.findOne({
      entity: entityId,
      platform: 'INSTAGRAM',
      date: yesterday,
    });

    if (existing) {
      console.log(
        `⚠️ Already synced for ${
          yesterday.toISOString().split('T')[0]
        }, skipping.`
      );
      return;
    }

    // --- Prepare document ---
    const doc = {
      entity: entityId,
      platform: 'INSTAGRAM' as const,
      date: yesterday,
      // All-time data
      totalFollower: totalFollowers,
      totalLikes: 0,
      totalViews: 0,
      // Yesterday's data
      newFollowers,
      newLikes: 0,
      newViews: 0,
      totalReach: reach,
      newReach: yesterdayData.reach_1d || 0,
      // Other metrics
      posts: totalPosts,
      impressions: 0,
      clicks: 0,
      engagement: 0,
      lastSyncDateTime: new Date(),
      aiOverview: `Instagram data synced for ${
        yesterday.toISOString().split('T')[0]
      }. Total followers: ${totalFollowers}, New followers: ${newFollowers}, Reach: ${reach}`,
    };

    // --- Upsert record into database ---
    await InstagramInsights.findOneAndUpdate(
      { entity: entityId, platform: 'INSTAGRAM', date: yesterday },
      { $set: doc },
      { upsert: true, runValidators: true }
    );

    console.log(
      `✅ Instagram data saved for ${yesterday.toISOString().split('T')[0]}`
    );
    console.log(
      `📊 Total Followers: ${totalFollowers}, New Followers: ${newFollowers}, Reach: ${reach}`
    );
  } catch (err: any) {
    if (err.response) {
      console.error('❌ API Error:', err.response.status, err.response.data);
    } else {
      console.error('❌ Instagram Sync Error:', err.message);
    }
  }
}

