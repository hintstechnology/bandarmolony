/**
 * Calculate days left from trial end date
 */
export function calculateTrialDaysLeft(endDate?: string | null): number {
  if (!endDate) return 0;
  
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();
  const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
  
  return Math.max(0, daysLeft);
}

/**
 * Get trial status badge text
 */
export function getTrialStatusText(daysLeft: number): string {
  if (daysLeft > 7) return `${daysLeft} days left`;
  if (daysLeft > 1) return `${daysLeft} days left`;
  if (daysLeft === 1) return '1 day left';
  return 'Expiring today';
}

