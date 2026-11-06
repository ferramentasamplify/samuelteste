const dayMs = 86400000;
const addDay = (day, n) => new Date(Date.parse(day) + n * dayMs).toISOString().slice(0, 10);
export function returnProjection(data, month, remuneration) {
  const creators = [...new Map((data?.creators || []).filter(row => row.status === 'matched').map(row => [row.authorId, row])).values()];
  const latest = data?.lastDay;
  const start = `${month}-01`;
  const current = data?.team?.lifetimeRevenue;
  if (!latest || latest < start || !Number.isFinite(current) || !Number.isFinite(remuneration) || !creators.length) return { points: [], reason: 'Dados insuficientes para calcular a projeção.' };
  const daily = new Map();
  let missingHistory = false;
  for (const creator of creators) {
    const series = creator.revenueDays?.dailyRevenue || [];
    const first = series.find(point => point.revenue != null)?.day;
    if (!first) { missingHistory = true; continue; }
    const lookup = new Map(series.map(point => [point.day, point.revenue]));
    for (let day = start; day <= latest; day = addDay(day, 1)) {
      const entry = daily.get(day) || { revenue: 0, complete: true };
      const value = lookup.get(day);
      if (day >= first) {
        if (Number.isFinite(value)) entry.revenue += value;
        else entry.complete = false;
      }
      daily.set(day, entry);
    }
  }
  const days = [...daily].sort(([a], [b]) => a.localeCompare(b));
  const windowStart = addDay(latest, -2);
  const recent = days.filter(([day, value]) => day >= windowStart && value.complete);
  const rate = !missingHistory && recent.length >= 3 ? recent.reduce((sum, [, value]) => sum + value.revenue, 0) / recent.length : null;
  let accumulated = current - days.reduce((sum, [, value]) => sum + value.revenue, 0);
  const points = days.map(([day, value]) => {
    accumulated += value.revenue;
    return { day, actual: value.complete && !missingHistory ? accumulated : null, target: remuneration };
  });
  const last = points.at(-1);
  // Always reconcile the final point with the same accumulated revenue as the main card.
  if (last) last.actual = current;
  const achieved = current >= remuneration;
  const daysToTarget = !achieved && rate > 0 ? Math.ceil((remuneration - current) / rate) : null;
  const targetDay = daysToTarget != null ? addDay(latest, daysToTarget) : achieved ? days.find(([, value], index) => points[index].actual >= remuneration)?.[0] || latest : null;
  if (last && !achieved && rate > 0) {
    last.projected = current;
    for (let n = 1; n <= Math.min(daysToTarget, 365); n++) points.push({ day: addDay(latest, n), projected: current + rate * n, target: remuneration });
  }
  return { points, rate, recentDays: recent.length, targetDay, daysToTarget, achieved, current, remaining: Math.max(0, remuneration - current), latest, partial: missingHistory || days.some(([, value]) => !value.complete), beyondChart: daysToTarget > 365 };
}
