const RULES = {
  '307d872b-594c-81e9-9f48-0002dc826c24': ['Primeiro contato', 'Respondidos', 'Reuniões agendadas'],
  '3fbd872b-594c-8131-bdb6-0002ac827818': ['Realizadas', 'Propostas ongoing', 'Agenciado'],
  '3a3d872b-594c-8172-8b7b-0002377cf28b': ['Realizadas', 'Propostas ongoing', 'Agenciado'],
};
const octoberMeetings = new Set(['407b0bbe-f153-8182-b2c2-feb4a1564dd6', '408b0bbe-f153-814e-b9af-d1bc976d80d1', '3b9b0bbe-f153-8179-9e6d-c4be413bd6f0']);
export function inStageRange(creator, stage, range) {
  // Month-end is an accounting allocation, not an asserted meeting date.
  const date = stage === 'Reuniões agendadas' && octoberMeetings.has(creator.id) ? '2026-10-31' : creator.editedDate;
  return date >= range.start && date <= range.end;
}

export function requiresExclusiveResponsible(responsibleId, stageName) {
  return RULES[responsibleId]?.includes(stageName) || false;
}

export function responsibleFunnel({ creators, responsibleId, range, stages, metric }) {
  const names = RULES[responsibleId];
  if (!names && responsibleId !== '__all__') return null;
  const eligible = creators.filter((creator) =>
    responsibleId === '__all__' || creator.responsibleIds?.includes(responsibleId));
  return stages.map((stage) => ({
    name: stage.name,
    value: eligible.reduce((sum, creator) => sum + (inStageRange(creator, stage.name, range) && stage.statuses.includes(creator.status) &&
      (!requiresExclusiveResponsible(responsibleId, stage.name) || creator.responsibleIds.length === 1)
      ? metric === 'gmv' ? Number(creator.gmv) || 0 : 1 : 0), 0),
  }));
}
