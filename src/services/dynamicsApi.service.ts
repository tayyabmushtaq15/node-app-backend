import axios, { AxiosError } from 'axios';
import https from 'https';
import { config } from '../config/config';

/*                              AXIOS INSTANCE                                */

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
});

const dynamicsAxios = axios.create({
  httpsAgent,
  timeout: 20000,
});

/*                              TOKEN CACHE                                   */

let cachedToken: string | null = null;
let tokenExpiry = 0;

const getAuthToken = async (): Promise<string | null> => {
  const now = Date.now();

  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
    console.warn('⚠️ Dynamics credentials missing');
    return null;
  }

  const params = new URLSearchParams();
  params.append('client_id', config.clientId);
  params.append('client_secret', config.clientSecret);
  params.append('scope', config.scope || '');
  params.append('grant_type', 'client_credentials');

  const response = await axios.post(config.tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  cachedToken = response.data.access_token;
  tokenExpiry = now + (response.data.expires_in - 60) * 1000;

  return cachedToken;
};

/*                             API CALL                                       */

export const getBankGroupSummary = async (
  token: string,
  fromDate: string,
  toDate: string,
  dataAreaId?: string
): Promise<any | null> => {
  try {
    if (!config.apiUrl) {
      throw new Error('MS_BANKGROUP_URL not configured');
    }

    const body: any = {
      _contract: {
        fromDate,
        toDate,
        ...(dataAreaId ? { DataAreaId: dataAreaId } : {}),
      },
    };

    const response = await dynamicsAxios.post(
      config.apiUrl,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    const err = error as AxiosError;

    // Retry only on server/network issues
    if (err.response && err.response.status < 500) {
      return null;
    }

    throw error;
  }
};

/*                              RETRY WRAPPER                                 */


export const getBankGroupSummaryWithRetry = async (
  token: string,
  fromDate: string,
  toDate: string,
  dataAreaId?: string,
  maxRetries = 3
): Promise<any | null> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getBankGroupSummary(
        token,
        fromDate,
        toDate,
        dataAreaId
      );
    } catch {
      if (attempt === maxRetries) return null;
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return null;
};

/*                              PAIDOUT API CALL                              */

export const getPaidoutSummary = async (
  token: string,
  fromDate: Date,
  toDate: Date,
  dataAreaId?: string
): Promise<any[] | null> => {
  try {
    if (!config.paidoutApiUrl) {
      throw new Error('MS_PAIDOUT_URL not configured');
    }

    const formatDate = (date: Date): string => {
      return date.toISOString().split('.')[0] + 'Z';
    };

    const body: any = {
      _contract: {
        FromDate: formatDate(fromDate),
        ToDate: formatDate(toDate),
        ...(dataAreaId ? { DataAreaId: dataAreaId } : {}),
      },
    };

    const response = await dynamicsAxios.post(
      config.paidoutApiUrl,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    // Extract response data - handle both Response and Reponse (typo in API)
    const result = response.data?.Response || response.data?.Reponse || [];
    
    return Array.isArray(result) ? result : [];
  } catch (error) {
    const err = error as AxiosError;

    // Handle 500 errors gracefully (NullReferenceException from API)
    if (err.response?.status === 500) {
      console.warn(
        `⚠️ API returned 500 (NullReferenceException) for ${dataAreaId || 'ALL'} — skipping`
      );
      return [];
    }

    // Retry only on server/network issues
    if (err.response && err.response.status < 500) {
      return null;
    }

    throw error;
  }
};

/*                              PAIDOUT RETRY WRAPPER                         */

export const getPaidoutSummaryWithRetry = async (
  token: string,
  fromDate: Date,
  toDate: Date,
  dataAreaId?: string,
  maxRetries = 3
): Promise<any[] | null> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getPaidoutSummary(token, fromDate, toDate, dataAreaId);
    } catch {
      if (attempt === maxRetries) return null;
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return null;
};

/*                              PROCUREMENT API CALL                           */

export const getProcurementData = async (
  token: string,
  fromDate: string,
  toDate: string,
  dataAreaId?: string
): Promise<any[] | null> => {
  try {
    if (!config.paidoutApiUrl) {
      throw new Error('MS_PAIDOUT_URL not configured');
    }

    const body: any = {
      _request: {
        fromDate,
        toDate,
        ...(dataAreaId ? { DataAreaId: dataAreaId } : {}),
      },
    };

    const response = await dynamicsAxios.post(
      config.paidoutApiUrl,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    // Extract response data - handle Responses array (capital R)
    const result = response.data?.Responses || [];
    
    return Array.isArray(result) ? result : [];
  } catch (error) {
    const err = error as AxiosError;

    // Retry only on server/network issues
    if (err.response && err.response.status < 500) {
      return null;
    }

    throw error;
  }
};

/*                              PROCUREMENT RETRY WRAPPER                      */

export const getProcurementDataWithRetry = async (
  token: string,
  fromDate: string,
  toDate: string,
  dataAreaId?: string,
  maxRetries = 3
): Promise<any[] | null> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getProcurementData(token, fromDate, toDate, dataAreaId);
    } catch {
      if (attempt === maxRetries) return null;
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return null;
};

/*                              PUBLIC TOKEN API                               */


export const getDynamicsToken = async (): Promise<string | null> => {
  return getAuthToken();
};
