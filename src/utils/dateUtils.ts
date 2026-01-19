/**
 * Get yesterday's date in yyyy-mm-dd format
 */
export const getYesterdayDate = (): string => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Get day before yesterday's date in yyyy-mm-dd format
 */
export const getDayBeforeYesterdayDate = (): string => {
  const dayBeforeYesterday = new Date();
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
  
  const year = dayBeforeYesterday.getFullYear();
  const month = String(dayBeforeYesterday.getMonth() + 1).padStart(2, '0');
  const day = String(dayBeforeYesterday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Format date to yyyy-mm-dd format
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Validate date format (yyyy-mm-dd)
 */
export const isValidDateFormat = (date: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  return regex.test(date);
};

