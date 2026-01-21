import axios, { AxiosError } from 'axios';
import https from 'https';
import { config } from '../config/config';

/*                              AXIOS INSTANCE                                */

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
});

const zohoAxios = axios.create({
  httpsAgent,
  timeout: 30000, // 30 seconds timeout
});

/*                              TOKEN CACHE                                   */

let cachedToken: string | null = null;
let tokenExpiry = 0;

/**
 * Sleep function for retry delays
 * @param ms - Milliseconds to sleep
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Get Zoho Analytics access token using refresh token
 * @returns Access token or null if failed
 */
const getZohoAccessToken = async (): Promise<string | null> => {
  const now = Date.now();

  // Check if we have a valid cached token
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  if (!config.zoho?.refreshToken || !config.zoho?.clientId || !config.zoho?.clientSecret) {
    console.warn('⚠️ Zoho Analytics credentials missing');
    return null;
  }

  console.log('🔐 Getting Zoho Analytics access token...');

  // Retry logic for network issues
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries} to get access token...`);

      const response = await axios.post(
        'https://accounts.zoho.com/oauth/v2/token',
        null,
        {
          params: {
            refresh_token: config.zoho.refreshToken,
            client_id: config.zoho.clientId,
            client_secret: config.zoho.clientSecret,
            grant_type: 'refresh_token',
          },
          timeout: 30000,
          headers: {
            'User-Agent': 'Leos-Dashboard/1.0',
            Accept: 'application/json',
          },
        }
      );

      if (response.data && response.data.access_token) {
        cachedToken = response.data.access_token;
        tokenExpiry = now + (response.data.expires_in - 60) * 1000; // 1 minute buffer

        console.log('✅ Zoho Analytics access token obtained');
        console.log(
          `📊 Token expires in: ${Math.round((tokenExpiry - now) / 1000 / 60)} minutes`
        );
        return cachedToken;
      } else {
        throw new Error('Invalid response: No access token received');
      }
    } catch (error) {
      const err = error as AxiosError;
      lastError = err as Error;
      console.error(`❌ Attempt ${attempt} failed:`, {
        message: err.message,
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
      });

      // Don't retry on authentication errors
      if (err.response?.status === 400 || err.response?.status === 401) {
        console.error('❌ Authentication error - not retrying');
        break;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ Waiting ${delay / 1000}s before retry...`);
        await sleep(delay);
      }
    }
  }

  // All retries failed
  console.error('❌ All attempts to get access token failed');
  throw new Error(
    `Failed to get Zoho Analytics access token after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
};

/*                             API CALL                                       */

/**
 * Fetch sales collection data from Zoho Analytics API
 * @param token - Zoho access token
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @returns Array of sales collection records or null if failed
 */
export const getSalesCollectionData = async (
  token: string,
  fromDate: string,
  toDate: string
): Promise<any[] | null> => {
  try {
    if (!config.zoho?.analyticsUrl || !config.zoho?.workspaceId || !config.zoho?.collectionViewId || !config.zoho?.orgId) {
      throw new Error('Zoho Analytics configuration missing');
    }

    // Build CONFIG parameter
    const configParam = encodeURIComponent(
      JSON.stringify({
        criteria: `("Payment Date">='${fromDate}' AND "Payment Date"<='${toDate}')`,
        responseFormat: 'json',
      })
    );

    // Build URL
    const url = `${config.zoho.analyticsUrl}workspaces/${config.zoho.workspaceId}/views/${config.zoho.collectionViewId}/data?CONFIG=${configParam}`;

    console.log(`📡 Fetching sales collection data from Zoho Analytics: ${fromDate} to ${toDate}`);

    const response = await zohoAxios.get(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'ZANALYTICS-ORGID': config.zoho.orgId,
        'User-Agent': 'Leos-Dashboard/1.0',
        Accept: 'application/json',
      },
    });

    const records = response.data?.data || [];
    console.log(`📊 Received ${records.length} sales collection records from Zoho Analytics`);

    return Array.isArray(records) ? records : [];
  } catch (error) {
    const err = error as AxiosError;

    // Retry only on server/network issues
    if (err.response && err.response.status < 500) {
      console.error('❌ Zoho API error:', {
        status: err.response.status,
        statusText: err.response.statusText,
        data: err.response.data,
      });
      return null;
    }

    throw error;
  }
};

/*                              RETRY WRAPPER                                 */

/**
 * Fetch sales collection data with retry logic
 * @param token - Zoho access token
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Array of sales collection records or null if failed
 */
export const getSalesCollectionDataWithRetry = async (
  token: string,
  fromDate: string,
  toDate: string,
  maxRetries = 3
): Promise<any[] | null> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getSalesCollectionData(token, fromDate, toDate);
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`❌ Failed after ${maxRetries} attempts:`, error);
        return null;
      }
      await sleep(attempt * 2000); // Exponential backoff: 2s, 4s, 6s
    }
  }
  return null;
};

/*                         REVENUE RESERVATION API                            */

/**
 * Create bulk export job for revenue reservation data
 * @param token - Zoho access token
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @returns Job ID or null if failed
 */
export const createRevenueReservationBulkExportJob = async (
  token: string,
  fromDate: string,
  toDate: string
): Promise<string | null> => {
  try {
    if (!config.zoho?.analyticsUrl || !config.zoho?.workspaceId || !config.zoho?.reservationViewId || !config.zoho?.orgId) {
      throw new Error('Zoho Analytics configuration missing');
    }

    // Create the CONFIG parameter
    const configParam = {
      responseFormat: 'json',
      criteria: `("Date">='${fromDate}' AND "Date"<='${toDate}')`,
    };

    const encodedConfig = encodeURIComponent(JSON.stringify(configParam));
    const url = `${config.zoho.analyticsUrl}bulk/workspaces/${config.zoho.workspaceId}/views/${config.zoho.reservationViewId}/data?CONFIG=${encodedConfig}`;

    console.log(`📤 Creating bulk export job for revenue reservation: ${fromDate} to ${toDate}`);

    const response = await zohoAxios.get(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'ZANALYTICS-ORGID': config.zoho.orgId,
        'User-Agent': 'Leos-Dashboard/1.0',
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    if (response.data?.status === 'success') {
      const jobId = response.data.data?.jobId;
      console.log(`✅ Bulk export job created with ID: ${jobId}`);
      return jobId;
    } else {
      throw new Error(`Failed to create bulk export job: ${response.data?.message || 'Unknown error'}`);
    }
  } catch (error) {
    const err = error as AxiosError;
    console.error('❌ Failed to create bulk export job:', {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
    });
    throw error;
  }
};

/**
 * Get data from bulk export job with polling
 * @param token - Zoho access token
 * @param jobId - Job ID from bulk export
 * @returns Array of revenue reservation records or null if failed
 */
export const getRevenueReservationBulkExportData = async (
  token: string,
  jobId: string
): Promise<any[] | null> => {
  try {
    if (!config.zoho?.analyticsUrl || !config.zoho?.workspaceId || !config.zoho?.orgId) {
      throw new Error('Zoho Analytics configuration missing');
    }

    const url = `${config.zoho.analyticsUrl}bulk/workspaces/${config.zoho.workspaceId}/exportjobs/${jobId}/data`;

    // Polling configuration
    const maxAttempts = 30; // Maximum 30 attempts
    const pollInterval = 2000; // Wait 2 seconds between attempts
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`🔄 Polling attempt ${attempts}/${maxAttempts} for job ${jobId}...`);

      try {
        const response = await zohoAxios.get(url, {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'ZANALYTICS-ORGID': config.zoho.orgId,
            'User-Agent': 'Leos-Dashboard/1.0',
            Accept: 'application/json',
          },
          timeout: 30000,
        });

        // Check if job is completed and has data
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
          console.log(`✅ Job completed! Retrieved ${response.data.data.length} records from Zoho Analytics`);
          return response.data.data;
        }

        // Check if job failed
        if (response.data?.status === 'failure') {
          const errorMsg = response.data?.data?.errorMessage || 'Job failed';
          console.error(`❌ Job failed: ${errorMsg}`);
          throw new Error(`Bulk export job failed: ${errorMsg}`);
        }

        // Job is still processing, wait and try again
        console.log(`⏳ Job still processing... waiting ${pollInterval / 1000}s before next attempt`);
        await sleep(pollInterval);
      } catch (error) {
        const err = error as AxiosError;

        // If it's a 400 error with "not completed" or "not initiated", continue polling
        if (
          err.response?.status === 400 &&
          (err.response?.data?.data?.errorCode === 8122 || // EXPORT_JOB_NOT_COMPLETED
            err.response?.data?.data?.errorCode === 8121) // EXPORT_JOB_NOT_INITIATED
        ) {
          const errorType =
            err.response?.data?.data?.errorCode === 8121 ? 'not initiated' : 'not completed';
          console.log(`⏳ Job ${errorType} yet... waiting ${pollInterval / 1000}s before next attempt`);
          await sleep(pollInterval);
          continue;
        }

        // For other errors, throw immediately
        console.error('❌ Failed to get bulk export data:', {
          message: err.message,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
        });
        throw error;
      }
    }

    // If we get here, we've exceeded max attempts
    throw new Error(
      `Bulk export job ${jobId} did not complete within ${(maxAttempts * pollInterval) / 1000} seconds`
    );
  } catch (error) {
    console.error('❌ Failed to get bulk export data:', error);
    throw error;
  }
};

/**
 * Fetch revenue reservation data from Zoho Analytics API using bulk export
 * @param token - Zoho access token
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @returns Array of revenue reservation records or null if failed
 */
export const getRevenueReservationData = async (
  token: string,
  fromDate: string,
  toDate: string
): Promise<any[] | null> => {
  try {
    // Step 1: Create bulk export job
    const jobId = await createRevenueReservationBulkExportJob(token, fromDate, toDate);
    if (!jobId) {
      throw new Error('Failed to create bulk export job');
    }

    // Step 2: Wait for job to complete and get data
    console.log(`⏳ Waiting for job ${jobId} to complete...`);
    const data = await getRevenueReservationBulkExportData(token, jobId);

    return data || [];
  } catch (error) {
    const err = error as AxiosError;

    // Retry only on server/network issues
    if (err.response && err.response.status < 500) {
      console.error('❌ Zoho API error:', {
        status: err.response.status,
        statusText: err.response.statusText,
        data: err.response.data,
      });
      return null;
    }

    throw error;
  }
};

/**
 * Fetch revenue reservation data with retry logic
 * @param token - Zoho access token
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Array of revenue reservation records or null if failed
 */
export const getRevenueReservationDataWithRetry = async (
  token: string,
  fromDate: string,
  toDate: string,
  maxRetries = 3
): Promise<any[] | null> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getRevenueReservationData(token, fromDate, toDate);
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`❌ Failed after ${maxRetries} attempts:`, error);
        return null;
      }
      await sleep(attempt * 2000); // Exponential backoff: 2s, 4s, 6s
    }
  }
  return null;
};

/*                              PUBLIC TOKEN API                               */

/**
 * Get Zoho Analytics access token (public API)
 * @returns Access token or null if failed
 */
export const getZohoToken = async (): Promise<string | null> => {
  return getZohoAccessToken();
};

