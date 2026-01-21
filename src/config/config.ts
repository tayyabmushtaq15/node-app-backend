import dotenv from "dotenv";
dotenv.config();

export const config = {
  // Microsoft Dynamics 365
  tenantId: process.env.MS_TENANT_ID,
  clientId: process.env.MS_CLIENT_ID,
  clientSecret: process.env.MS_CLIENT_SECRET,
  scope: process.env.MS_SCOPE,
  apiUrl: process.env.MS_BANKGROUP_URL,
  tokenUrl: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
  expensesApiUrl: process.env.MS_EXPENSES_URL,
  paidoutApiUrl: process.env.MS_PAIDOUT_URL,

 // Zoho Analytics API Keys
 zoho: {
  clientId: process.env.ZOHO_CLIENT_ID,
  clientSecret: process.env.ZOHO_CLIENT_SECRET,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  // accessToken: process.env.ZOHO_ACCESS_TOKEN,
  scope: process.env.ZOHO_SCOPE,
  collectionViewId: process.env.ZOHO_COLLECTION_VIEW_ID,
  analyticsUrl: process.env.ZOHO_ANALYTICS_URL,
  workspaceId: process.env.ZOHO_WORKSPACE_ID,
  reservationViewId: process.env.ZOHO_RESERVATION_VIEW_ID,
  orgId: process.env.ZOHO_ORG_ID,
},
};