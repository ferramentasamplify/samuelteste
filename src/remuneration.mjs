export const fixedSalary = person => person?.fixedSalary ?? null;
export function remuneration(person, commission) {
  const fixed = fixedSalary(person);
  return { fixed, commission, total: fixed == null || commission == null ? null : Math.round((fixed + commission) * 100) / 100 };
}
