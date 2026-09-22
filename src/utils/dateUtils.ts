export function calculateLeaveDays(startDate: Date, endDate: Date): number {
  let leaveDays = 0;
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();

    // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isWeekend) {
      leaveDays++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return leaveDays;
}

// This gives **Friday → Monday = 2 days**, while **Monday → Wednesday = 3 days**.
