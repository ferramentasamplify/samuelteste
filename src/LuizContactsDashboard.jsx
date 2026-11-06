import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { responsibleFunnel, requiresExclusiveResponsible, inStageRange } from "./responsible-funnel.mjs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUS_COLORS = ["#0047ff", "#ff0046", "#1734ad", "#3979ff", "#b50035", "#10285a"];
const ALL_RESPONSIBLES_ID = "__all__";
const DASHBOARD_START_DATE = "2026-10-08";
const FIRST_CONTACT_STATUSES = [
  "CONTATADO",
  "Contatado WPP",
  "Contatado Tiktok",
  "Contato WPP",
  "FUP 1",
  "FUP 2",
  "FUP 3",
];
const RESPONDED_STATUSES = ["Em progresso", "CHAMAR NO WPP"];
const SCHEDULED_STATUSES = ["Qualificação", "Reunião Agendada", "Analise de perfil agendada", "Primeira meet"];
const REALIZED_STATUSES = ["Reunião Realizada"];
const PROPOSAL_STATUSES = ["Enviar Convite", "Convite Enviado"];
const AGENCY_STATUSES = ["AGENCIADO", "Convite Aceito"];
const STATUS_STAGE_MAP = {
  CONTATADO: "Primeiro contato",
  "Contatado WPP": "Primeiro contato",
  "Contatado Tiktok": "Primeiro contato",
  "Contato WPP": "Primeiro contato",
  "FUP 1": "Primeiro contato",
  "FUP 2": "Primeiro contato",
  "FUP 3": "Primeiro contato",
  "Em progresso": "Respondidos",
  "Qualificação": "Reuniões agendadas",
  "CHAMAR NO WPP": "Respondidos",
  "Reunião Agendada": "Reuniões agendadas",
  "Analise de perfil agendada": "Reuniões agendadas",
  "Primeira meet": "Reuniões agendadas",
  "Reunião Realizada": "Realizadas",
  "Enviar Convite": "Propostas ongoing",
  "Convite Enviado": "Propostas ongoing",
  "Convite Aceito": "Agenciado",
  AGENCIADO: "Agenciado",
};
const UNMAPPED_STATUS_STAGE = "Sem etapa mapeada";
const FUNNEL_STAGES = [
  {
    name: "Primeiro contato",
    statuses: [
      ...FIRST_CONTACT_STATUSES,
      ...RESPONDED_STATUSES,
      ...SCHEDULED_STATUSES,
      ...REALIZED_STATUSES,
      ...PROPOSAL_STATUSES,
      ...AGENCY_STATUSES,
    ],
  },
  {
    name: "Respondidos",
    statuses: [
      ...RESPONDED_STATUSES,
      ...SCHEDULED_STATUSES,
      ...REALIZED_STATUSES,
      ...PROPOSAL_STATUSES,
      ...AGENCY_STATUSES,
    ],
  },
  {
    name: "Reuniões agendadas",
    statuses: [...SCHEDULED_STATUSES, ...REALIZED_STATUSES, ...PROPOSAL_STATUSES, ...AGENCY_STATUSES],
  },
  {
    name: "Realizadas",
    statuses: [...REALIZED_STATUSES, ...PROPOSAL_STATUSES, ...AGENCY_STATUSES],
  },
  {
    name: "Propostas ongoing",
    statuses: PROPOSAL_STATUSES,
  },
  {
    name: "Agenciado",
    statuses: AGENCY_STATUSES,
  },
];
const STATUS_STAGE_ORDER = [...FUNNEL_STAGES.map((stage) => stage.name), UNMAPPED_STATUS_STAGE];
const FUNNEL_STAGE_STATUS = Object.fromEntries(FUNNEL_STAGES.map((stage) => [stage.name, new Set(stage.statuses)]));
const MAPPED_STATUS_NAMES = new Set(Object.keys(STATUS_STAGE_MAP));

const getStatusStage = (statusName) => STATUS_STAGE_MAP[statusName] || UNMAPPED_STATUS_STAGE;
const isStatusStage = (statusName) => STATUS_STAGE_ORDER.includes(statusName);

const formatCompactNumber = (value) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);

const formatInteger = (value) => new Intl.NumberFormat("pt-BR").format(value || 0);

const formatPercent = (value) =>
  new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value || 0);

const formatCompactCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    compactDisplay: "short",
    currency: "BRL",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  }).format(value || 0);

const formatMetricValue = (value, metric = "count", compact = false) => {
  if (metric === "gmv") return compact ? formatCompactCurrency(value) : formatCompactCurrency(value);
  const number = Number(value) || 0;
  if (Number.isInteger(number)) return formatInteger(number);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(number);
};

const metricLabel = (metric = "count") => (metric === "gmv" ? "GMV" : "volume");

const formatDate = (date) => {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
};

const toDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const sumMaps = (days, key) => {
  const result = {};
  days.forEach((day) => {
    Object.entries(day[key] || {}).forEach(([name, value]) => {
      result[name] = (result[name] || 0) + value;
    });
  });
  return Object.entries(result)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

const sumStageMaps = (days, key) => {
  const values = FUNNEL_STAGES.map((stage) => ({
    name: stage.name,
    value: days.reduce((sum, day) => sum + sumStatusesFromMap(day[key], FUNNEL_STAGE_STATUS[stage.name]), 0),
  }));
  const unmapped = days.reduce(
    (sum, day) => sum + sumUnmappedStatuses(day[key]),
    0
  );
  if (unmapped) values.push({ name: UNMAPPED_STATUS_STAGE, value: unmapped });
  return values.filter((item) => item.value > 0);
};

const sumStatusesFromMap = (statusMap = {}, includedStatuses = new Set()) =>
  Object.entries(statusMap).reduce(
    (sum, [name, value]) => sum + (includedStatuses.has(name) ? Number(value) || 0 : 0),
    0
  );

const sumUnmappedStatuses = (statusMap = {}) =>
  Object.entries(statusMap).reduce(
    (sum, [name, value]) => sum + (!MAPPED_STATUS_NAMES.has(name) ? Number(value) || 0 : 0),
    0
  );

const getStageValue = (stages, stageName) => stages.find((stage) => stage.name === stageName)?.value || 0;

const sumDayTotals = (days, statusName = "", metric = "count") =>
  days.reduce((sum, day) => sum + getDayTotal(day, statusName, metric), 0);

const getDayTotal = (day, statusName, metric = "count") => {
  const statusMap = metric === "gmv" ? day.statusGmv || {} : day.status || {};

  if (metric === "gmv") {
    if (!statusName) {
      return Object.values(statusMap).reduce((sum, value) => sum + (Number(value) || 0), 0);
    }
    if (statusName === UNMAPPED_STATUS_STAGE) return sumUnmappedStatuses(statusMap);
    if (isStatusStage(statusName)) {
      return sumStatusesFromMap(statusMap, FUNNEL_STAGE_STATUS[statusName]);
    }
    return statusMap[statusName] || 0;
  }

  if (!statusName) return day.total || 0;
  if (statusName === UNMAPPED_STATUS_STAGE) return sumUnmappedStatuses(statusMap);
  if (isStatusStage(statusName)) {
    return sumStatusesFromMap(statusMap, FUNNEL_STAGE_STATUS[statusName]);
  }
  return statusMap[statusName] || 0;
};

const makeDailySeries = (days, start, end, statusName = "", metric = "count") => {
  const byDate = new Map(days.map((day) => [day.date, getDayTotal(day, statusName, metric)]));
  const series = [];
  for (let cursor = toDate(start); cursor <= toDate(end); cursor = addDays(cursor, 1)) {
    const date = toIsoDate(cursor);
    series.push({
      date,
      label: date.slice(5).split("-").reverse().join("/"),
      metric,
      total: byDate.get(date) || 0,
    });
  }
  return series;
};

const startOfWeek = (dateValue) => {
  const date = toDate(dateValue);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return toIsoDate(date);
};

const pickGoalValue = (row, date, today, normalKey) => Number(row[normalKey]) || 0;

// Metas sempre seguem a coluna normal da planilha, inclusive em datas futuras.
const sumGmvGoalForSelection = (rows, selectedEnd, today) => {
  return rows.reduce((sum, row) => sum + (Number(row.normalDaily) || 0), 0);
};

const goalMatchesResponsible = (goal, responsible) => {
  if (!goal.responsible || responsible?.id === ALL_RESPONSIBLES_ID) return true;
  const rowResponsible = normalizeText(goal.responsible);
  return rowResponsible === normalizeText(responsible?.name) || rowResponsible.includes(normalizeText(responsible?.name));
};

const goalMatchesStage = (goal, selectedStatus) => {
  if (!selectedStatus || !goal.stage) return true;
  return normalizeText(goal.stage) === normalizeText(selectedStatus);
};

const filterGoalRows = (goals = [], range, responsible, selectedStatus, metric) =>
  goals.filter((goal) =>
    goal.date >= range.start &&
    goal.date <= range.end &&
    goal.metric === metric &&
    goalMatchesResponsible(goal, responsible) &&
    goalMatchesStage(goal, selectedStatus)
  );

const makeGoalDailySeries = (goals = [], start, end, today) => {
  const byDate = new Map();
  goals.forEach((goal) => {
    const value = pickGoalValue(goal, goal.date, today, "normalDaily", "adjustedDaily");
    byDate.set(goal.date, (byDate.get(goal.date) || 0) + value);
  });
  return makeDailySeries([], start, end).map((day) => ({
    ...day,
    target: byDate.get(day.date) || 0,
  }));
};

const summarizeGoals = (goals = [], today) => {
  const weekly = new Map();
  let daily = 0;
  goals.forEach((goal) => {
    daily += pickGoalValue(goal, goal.date, today, "normalDaily", "adjustedDaily");
    const weeklyValue = pickGoalValue(goal, goal.date, today, "normalWeekly", "adjustedWeekly");
    if (!weeklyValue) return;
    const key = `${startOfWeek(goal.date)}|${goal.responsible || "all"}|${goal.stage || "all"}|${goal.metric}`;
    weekly.set(key, Math.max(weekly.get(key) || 0, weeklyValue));
  });
  return {
    daily,
    rows: goals.length,
    weekly: Array.from(weekly.values()).reduce((sum, value) => sum + value, 0),
  };
};

const makeStackedSeries = (createdDays, editedDays, start, end, statusName = "", metric = "count") => {
  const createdByDate = new Map(createdDays.map((day) => [day.date, getDayTotal(day, statusName, metric)]));
  const editedByDate = new Map(editedDays.map((day) => [day.date, getDayTotal(day, statusName, metric)]));
  return makeDailySeries([], start, end, "", metric).map((day) => {
    const created = createdByDate.get(day.date) || 0;
    const edited = editedByDate.get(day.date) || 0;
    return {
      ...day,
      "Criado em": created,
      "Alterado em": edited,
      total: created + edited,
    };
  });
};

const listDates = (start, end) => {
  if (!start || !end) return [];
  const dates = [];
  for (let cursor = toDate(start); cursor <= toDate(end); cursor = addDays(cursor, 1)) {
    dates.push(toIsoDate(cursor));
  }
  return dates;
};

const makeRange = (days) => {
  const dates = days.map((day) => day.date);
  const last = dates[dates.length - 1];
  if (!last) return { start: "", end: "" };
  return { start: `${last.slice(0, 8)}01`, end: last };
};

const mergeNumberMap = (target, source = {}) => {
  Object.entries(source).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + (Number(value) || 0);
  });
};

const mergeHourMap = (target, source = {}) => {
  Object.entries(source).forEach(([hour, bucket]) => {
    if (!target[hour]) target[hour] = { total: 0, status: {}, statusGmv: {} };
    target[hour].total += bucket.total || 0;
    mergeNumberMap(target[hour].status, bucket.status);
    mergeNumberMap(target[hour].statusGmv, bucket.statusGmv);
  });
};

const makeHourRanking = (days, statusName = "", metric = "count") => {
  const byHour = {};
  days.forEach((day) => {
    Object.entries(day.hour || {}).forEach(([hour, bucket]) => {
      const value = metric === "gmv" ? getDayTotal(bucket, statusName, "gmv") : getDayTotal(bucket, statusName, "count");
      byHour[hour] = (byHour[hour] || 0) + value;
    });
  });
  return Object.entries(byHour)
    .map(([hour, value]) => ({ name: `${hour.padStart(2, "0")}h`, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
};

const makeDateHourMatrix = (days, start, end, statusName = "", metric = "count") => {
  if (!start || !end) return { dates: [], rows: [], max: 0 };
  const dates = listDates(start, end);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const hours = Array.from(
    new Set(days.flatMap((day) => Object.keys(day.hour || {})))
  ).sort((a, b) => Number(a) - Number(b));
  const rows = hours.map((hour) => {
    const values = dates.map((date) => {
      const bucket = byDate.get(date)?.hour?.[hour];
      return bucket ? getDayTotal(bucket, statusName, metric) : 0;
    });
    return {
      hour: `${hour.padStart(2, "0")}h`,
      total: values.reduce((sum, value) => sum + value, 0),
      values,
    };
  }).filter((row) => row.total > 0);
  const max = rows.reduce((currentMax, row) => Math.max(currentMax, ...row.values), 0);
  return { dates, rows, max };
};

const makeResponsibleRanking = (dataset, range, mode, statusName = "", metric = "count") => {
  if (!dataset?.responsibles?.length || !range?.start) return [];
  return dataset.responsibles
    .map((responsible) => {
      const days = dataset.byResponsible?.[responsible.id]?.modes?.[mode]?.days || [];
      const filtered = days.filter((day) => day.date >= range.start && day.date <= range.end);
      return {
        id: responsible.id,
        name: responsible.name,
        value: sumDayTotals(filtered, statusName, metric),
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
};

const makeAllResponsible = (dataset) => {
  const responsibles = Object.values(dataset.byResponsible || {});
  const makeMode = (mode) => {
    const byDate = new Map();
    if (Array.isArray(dataset.creators) && (mode === "edited" || dataset.creators.every((creator) => "createdDate" in creator))) {
      const seen = new Set();
      dataset.creators.forEach((creator) => {
        if (seen.has(creator.id)) return;
        seen.add(creator.id);
        const date = creator[`${mode}Date`];
        const hour = creator[`${mode}Hour`];
        if (!date || !hour) return;
        if (!byDate.has(date)) byDate.set(date, { date, total: 0, status: {}, statusGmv: {}, hour: {} });
        const day = byDate.get(date);
        const status = creator.status || "Sem status";
        const gmv = Number(creator.gmv) || 0;
        day.total += 1;
        day.status[status] = (day.status[status] || 0) + 1;
        day.statusGmv[status] = (day.statusGmv[status] || 0) + gmv;
        if (!day.hour[hour]) day.hour[hour] = { total: 0, status: {}, statusGmv: {} };
        day.hour[hour].total += 1;
        day.hour[hour].status[status] = (day.hour[hour].status[status] || 0) + 1;
        day.hour[hour].statusGmv[status] = (day.hour[hour].statusGmv[status] || 0) + gmv;
      });
      return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    }
    responsibles.forEach((responsible) => {
      responsible.modes?.[mode]?.days?.forEach((day) => {
        if (!byDate.has(day.date)) {
          byDate.set(day.date, { date: day.date, total: 0, status: {}, statusGmv: {}, hour: {} });
        }
        const current = byDate.get(day.date);
        current.total += day.total || 0;
        mergeNumberMap(current.status, day.status);
        mergeNumberMap(current.statusGmv, day.statusGmv);
        mergeHourMap(current.hour, day.hour);
      });
    });
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  };

  return {
    id: ALL_RESPONSIBLES_ID,
    name: "Todos",
    modes: {
      created: {
        label: "Criado em",
        days: makeMode("created"),
      },
      edited: {
        label: "Alterado em",
        days: makeMode("edited"),
      },
    },
  };
};

function Card({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function KpiCard({ label, value, detail, rows = [], tone = "blue" }) {
  const valueRef = useRef(null);
  useLayoutEffect(() => {
    const element = valueRef.current;
    let cancelled = false;
    let lastWidth = -1;
    const fit = () => {
      if (cancelled || !element.clientWidth) return;
      element.style.fontSize = "";
      const available = element.clientWidth;
      const naturalWidth = element.scrollWidth;
      const baseSize = parseFloat(window.getComputedStyle(element).fontSize);
      if (naturalWidth > available) {
        element.style.fontSize = `${baseSize * (available - 1) / naturalWidth}px`;
      }
      lastWidth = available;
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== lastWidth) fit();
    });
    observer.observe(element);
    document.fonts?.ready.then(fit);
    return () => { cancelled = true; observer.disconnect(); };
  }, [value, tone]);
  return (
    <Card className={`kpi-card ${tone}`}>
      <p>{label}</p>
      <strong ref={valueRef}>{value}</strong>
      <span>{detail}</span>
      {rows.length > 0 && <dl className="kpi-breakdown">{rows.map(([name, text]) => (
        <div key={name}><dt>{name}</dt><dd>{text}</dd></div>
      ))}</dl>}
    </Card>
  );
}

function RankingList({ data, metric = "count", emptyText = "Sem dados no período." }) {
  const max = data[0]?.value || 0;
  return (
    <div className="ranking-list">
      {data.length ? data.map((item, index) => (
        <div className="ranking-row" key={item.id || item.name}>
          <div>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.name}</strong>
          </div>
          <em>{metric === "gmv" ? formatCompactCurrency(item.value) : formatInteger(item.value)}</em>
          <i style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }} />
        </div>
      )) : <p className="empty-state">{emptyText}</p>}
    </div>
  );
}

function CreatorList({ creators }) {
  const [sort, setSort] = useState({ key: "gmv", direction: "desc" });
  const columns = [["creatorId", "Creator ID"], ["gmv", "GMV"], ["phone", "Número (WhatsApp)"], ["status", "Status de contato"]];
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const statuses = useMemo(() => [...new Set(creators.map((creator) => creator.status))].sort((a, b) => a.localeCompare(b, "pt-BR")), [creators]);
  const filtered = useMemo(() => creators.filter((creator) =>
    (!status || creator.status === status) &&
    (!query.trim() || `${creator.creatorId} ${creator.phone}`.toLowerCase().includes(query.trim().toLowerCase()))
  ).sort((a, b) => {
    const compare = sort.key === "gmv" ? a.gmv - b.gmv
      : String(a[sort.key] || "").localeCompare(String(b[sort.key] || ""), "pt-BR", { numeric: true, sensitivity: "base" });
    return compare * (sort.direction === "asc" ? 1 : -1) || a.id.localeCompare(b.id);
  }), [creators, status, query, sort]);
  const changeSort = (key) => {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
    setPage(0);
  };
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const currency = (value) => new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"}).format(value || 0);
  const updateFilter = (setter) => (event) => { setter(event.target.value); setPage(0); };
  return (
    <div className="creator-list">
      <div className="creator-filters">
        <label>Status de contato<select aria-label="Status de contato" value={status} onChange={updateFilter(setStatus)}>
          <option value="">Todos os status</option>
          {statuses.map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label className="creator-search">Buscar<input value={query} onChange={updateFilter(setQuery)} placeholder="Creator ID ou número" type="search" /></label>
      </div>
      <p className="creator-count">{formatInteger(filtered.length)} criadores · {columns.find(([key]) => key === sort.key)?.[1]} {sort.direction === "asc" ? "crescente" : "decrescente"}</p>
      <div className="creator-table-scroll">
        <table className="creator-table">
          <thead><tr>{columns.map(([key, label]) => (
            <th key={key} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <button type="button" onClick={() => changeSort(key)}>{label} <span aria-hidden="true">{sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button>
            </th>
          ))}</tr></thead>
          <tbody>{filtered.slice(currentPage * 25, (currentPage + 1) * 25).map((creator) => (
            <tr key={creator.id}>
              <td>{creator.creatorId || "Não informado"}</td>
              <td title={currency(creator.gmv)}>{formatCompactCurrency(creator.gmv)}</td>
              <td>{creator.phone || "Não informado"}</td>
              <td>{creator.status}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!filtered.length && <p className="empty-state">Nenhum criador para estes filtros.</p>}
      {pageCount > 1 && <nav className="creator-pagination" aria-label="Páginas de criadores">
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Próxima</button>
      </nav>}
    </div>
  );
}

function DateHourHeatmap({ matrix, metric = "count" }) {
  if (!matrix.rows.length) return <p className="empty-state">Sem movimento por hora no período.</p>;

  const formatValue = (value) => metric === "gmv" ? formatCompactCurrency(value) : formatInteger(value);

  return (
    <div className="heatmap-scroll">
      <div
        className="date-hour-heatmap"
        style={{ gridTemplateColumns: `74px repeat(${matrix.dates.length}, minmax(38px, 1fr))` }}
      >
        <span className="heatmap-corner">Hora</span>
        {matrix.dates.map((date) => (
          <span className="heatmap-date" key={date}>{date.slice(5).split("-").reverse().join("/")}</span>
        ))}
        {matrix.rows.map((row) => (
          <Fragment key={row.hour}>
            <strong className="heatmap-hour">{row.hour}</strong>
            {row.values.map((value, index) => {
              const intensity = matrix.max ? value / matrix.max : 0;
              return (
                <span
                  className={`heatmap-cell ${intensity > 0.55 ? "strong" : ""}`}
                  key={`${row.hour}-${matrix.dates[index]}`}
                  style={{ "--intensity": intensity }}
                  title={`${row.hour} em ${formatDate(matrix.dates[index])}: ${formatValue(value)}`}
                >
                  {value ? formatValue(value) : ""}
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey || item.name}>
          {item.name}: {item.name === "GMV" || item.payload?.metric === "gmv" ? formatCompactCurrency(item.value) : item.value}
        </span>
      ))}
    </div>
  );
}

function MovementTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return <div className="chart-tooltip"><strong>{label} · Total: {day.metric === "gmv" ? formatCompactCurrency(day.total) : day.total}</strong>
    {payload.filter((item) => item.value > 0 || item.dataKey === "meta").map((item) => <span key={item.dataKey}><i style={{ display: "inline-block", width: 8, height: 8, background: item.color, marginRight: 6 }} />{item.name}: {day.metric === "gmv" ? formatCompactCurrency(item.value) : item.value}</span>)}
  </div>;
}

function SegmentLabel({ metric = "count", x, y, width, height, value }) {
  if (metric === "gmv") return null;
  if (!value || height < 18) return null;
  return (
    <text
      dominantBaseline="middle"
      fill="#ffffff"
      fontSize="20"
      fontWeight="900"
      textAnchor="middle"
      x={x + width / 2}
      y={y + height / 2}
    >
      {value}
    </text>
  );
}

function TotalLabel({ metric = "count", x, y, width, value }) {
  if (!value) return null;
  const label = metric === "gmv" ? formatCompactCurrency(value) : value;
  return (
    <text
      fill="#0f172a"
      fontSize={metric === "gmv" ? "12" : "20"}
      fontWeight="900"
      textAnchor="middle"
      x={x + width / 2}
      y={y - 8}
    >
      {label}
    </text>
  );
}

export default function LuizContactsDashboard() {
  const [dataset, setDataset] = useState(null);
  const [error, setError] = useState("");
  const [customRange, setCustomRange] = useState(null);
  const barMode = "edited";
  const [barMetric, setBarMetric] = useState("gmv");
  const [movementView, setMovementView] = useState("bars");
  const [hourView, setHourView] = useState("ranking");
  const [responsibleId, setResponsibleId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch(`/luiz-contatos.json?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Não consegui atualizar os dados.");
        const data = await response.json();
        if (cancelled) return;
        setDataset(data);
        setResponsibleId((current) => current || ALL_RESPONSIBLES_ID);
        setError("");
        setSyncError("");
      } catch (err) {
        if (!cancelled) setSyncError(err.message);
      } finally { loading = false; }
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const activeResponsible = useMemo(() => {
    if (!dataset) return null;
    const id = responsibleId || dataset.responsible?.id || dataset.responsibles?.[0]?.id || "";
    if (id === ALL_RESPONSIBLES_ID) return makeAllResponsible(dataset);
    return dataset.byResponsible?.[id] || {
      id: dataset.responsible?.id,
      name: dataset.responsible?.name,
      modes: dataset.modes,
    };
  }, [dataset, responsibleId]);

  const activeRange = useMemo(() => {
    if (!dataset?.today) return { start: "", end: "" };
    return customRange || { start: [DASHBOARD_START_DATE, `${dataset.today.slice(0, 8)}01`].sort().at(-1), end: dataset.today };
  }, [dataset?.today, customRange]);

  useEffect(() => {
    setCustomRange(null);
    setSelectedStatus("");
  }, [responsibleId]);

  const filteredCreatedDays = useMemo(() => {
    const days = activeResponsible?.modes?.created?.days || [];
    return days.filter((day) => day.date >= activeRange.start && day.date <= activeRange.end);
  }, [activeRange, activeResponsible]);

  const filteredEditedDays = useMemo(() => {
    const days = activeResponsible?.modes?.edited?.days || [];
    return days.filter((day) => day.date >= activeRange.start && day.date <= activeRange.end);
  }, [activeRange, activeResponsible]);

  const totals = useMemo(() => {
    const barDays = filteredEditedDays;
    const statusKey = barMetric === "gmv" ? "statusGmv" : "status";
    const correctedScheduled = responsibleFunnel({ creators: dataset?.creators || [], responsibleId: activeResponsible?.id, range: activeRange, stages: FUNNEL_STAGES, metric: barMetric })?.find(stage => stage.name === 'Reuniões agendadas')?.value;

    return {
      total: selectedStatus === 'Reuniões agendadas' && correctedScheduled != null ? correctedScheduled : barDays.reduce((sum, day) => sum + getDayTotal(day, selectedStatus, barMetric), 0),
      status: sumStageMaps(barDays, statusKey),
      daily: activeRange.start ? makeDailySeries(barDays, activeRange.start, activeRange.end, selectedStatus, barMetric) : [],
    };
  }, [activeRange, barMetric, filteredEditedDays, selectedStatus, dataset, activeResponsible]);

  const filteredGoals = useMemo(() => {
    if (!dataset?.goals?.daily?.length || !activeRange.start) return [];
    return filterGoalRows(dataset.goals.daily, activeRange, activeResponsible, selectedStatus, barMetric);
  }, [activeRange, activeResponsible, barMetric, dataset, selectedStatus]);

  const goalSummary = useMemo(() => {
    return summarizeGoals(filteredGoals, dataset?.today || toIsoDate(new Date()));
  }, [dataset, filteredGoals]);

  const periodDays = useMemo(() => {
    if (!activeRange.start) return 0;
    return listDates(activeRange.start, activeRange.end).length;
  }, [activeRange]);

  const hourRanking = useMemo(() => {
    return makeHourRanking(filteredEditedDays, selectedStatus, barMetric);
  }, [barMetric, filteredEditedDays, selectedStatus]);

  const visibleCreators = useMemo(() => (dataset?.creators || []).filter((creator) => {
    if (!inStageRange(creator, selectedStatus, activeRange)) return false;
    if (activeResponsible?.id !== ALL_RESPONSIBLES_ID && !creator.responsibleIds.includes(activeResponsible?.id)) return false;
    if (requiresExclusiveResponsible(activeResponsible?.id, selectedStatus) && creator.responsibleIds.length !== 1) return false;
    if (!selectedStatus) return true;
    if (selectedStatus === UNMAPPED_STATUS_STAGE) return !MAPPED_STATUS_NAMES.has(creator.status);
    if (isStatusStage(selectedStatus)) return FUNNEL_STAGE_STATUS[selectedStatus]?.has(creator.status);
    return creator.status === selectedStatus;
  }), [dataset, activeRange, activeResponsible, selectedStatus, barMetric]);

  const averagePerDay = periodDays ? totals.total / periodDays : 0;
  const goalAchievement = goalSummary.daily ? totals.total / goalSummary.daily : 0;
  const realizedLabel = barMetric === "gmv" ? "realizado" : "contatos realizados";
  const goalDetail = goalSummary.rows
    ? `${formatMetricValue(goalSummary.daily, barMetric)} meta esperada em ${metricLabel(barMetric)}`
    : dataset?.goals?.status === "ok" ? "sem meta para este filtro" : "aguardando acesso à planilha";
  const achievementDetail = goalSummary.daily
    ? `${formatMetricValue(totals.total, barMetric)} ${realizedLabel}`
    : "sem base de meta aplicada";
  const efficiencyStages = useMemo(
    () => responsibleFunnel({
      creators: dataset?.creators || [], responsibleId: activeResponsible?.id,
      range: activeRange, stages: FUNNEL_STAGES, metric: barMetric,
    }) ?? sumStageMaps(filteredEditedDays, barMetric === "gmv" ? "statusGmv" : "status"),
    [dataset, activeResponsible, activeRange, filteredEditedDays, barMetric]
  );
  const sdrBase = getStageValue(efficiencyStages, "Primeiro contato");
  const sdrConverted = getStageValue(efficiencyStages, "Reuniões agendadas");
  const closerBase = getStageValue(efficiencyStages, "Realizadas");
  const closerConverted = getStageValue(efficiencyStages, "Agenciado");
  const sdrEfficiency = sdrBase ? sdrConverted / sdrBase : 0;
  const closerEfficiency = closerBase ? closerConverted / closerBase : 0;

  // KPIs acompanham período, responsável e métrica, sem o filtro de etapa do gráfico.
  const kpiGoals = useMemo(() => {
    const rows = filterGoalRows(dataset?.goals?.daily || [], activeRange, activeResponsible, "", barMetric);
    const today = dataset?.today || toIsoDate(new Date());
    const summarizeStage = (stage) => summarizeGoals(rows.filter((row) => row.stage === stage), today);
    return { agency: summarizeStage("Agenciado"), scheduled: summarizeStage("Reuniões agendadas") };
  }, [dataset, activeRange, activeResponsible, barMetric]);
  const rawContactTarget = kpiGoals.scheduled.daily / 0.4;
  const contactTarget = barMetric === "count" ? Math.ceil(rawContactTarget) : rawContactTarget;
  const monthlyProgress = useMemo(() => {
    if (!activeRange.start || !activeRange.end) return { actual: 0, target: 0, percent: 0, label: "" };
    const start = `${activeRange.start.slice(0, 7)}-01`;
    const end = toIsoDate(new Date(Date.UTC(Number(activeRange.end.slice(0, 4)), Number(activeRange.end.slice(5, 7)), 0)));
    const rows = filterGoalRows(dataset?.goals?.daily || [], { start, end }, activeResponsible, "Agenciado", barMetric);
    const target = sumGmvGoalForSelection(rows, activeRange.end, dataset?.today || toIsoDate(new Date()));
    const actual = getStageValue(sumStageMaps(filteredEditedDays, barMetric === "gmv" ? "statusGmv" : "status"), "Agenciado");
    const monthLabel = (date) => `${date.slice(5, 7)}/${date.slice(0, 4)}`;
    const label = start.slice(0, 7) === end.slice(0, 7) ? monthLabel(start) : `${monthLabel(start)} a ${monthLabel(end)}`;
    return { actual, target, percent: target > 0 ? actual / target : 0, label };
  }, [dataset, activeRange, activeResponsible, filteredEditedDays, barMetric]);
  const periodProgress = useMemo(() => {
    const rows = filterGoalRows(dataset?.goals?.daily || [], activeRange, activeResponsible, "Agenciado", barMetric);
    const target = sumGmvGoalForSelection(rows, activeRange.end, dataset?.today || toIsoDate(new Date()));
    return { target, percent: target > 0 ? monthlyProgress.actual / target : 0 };
  }, [dataset, activeRange, activeResponsible, monthlyProgress.actual, barMetric]);
  const goalMetricLabel = barMetric === "gmv" ? "GMV agenciado" : "Criadores agenciados";
  const formatGoalGmv = (value) => barMetric === "gmv"
    ? `R$ ${new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
  const formatKpiValue = (value) => barMetric === "gmv"
    ? (() => {
      const number = Number(value) || 0;
      const unit = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "mil"]]
        .find(([threshold]) => Math.abs(number) >= threshold);
      if (!unit) return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
      const compact = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(number / unit[0]);
      return `R$ ${compact}${unit[1] === "mil" ? " " : ""}${unit[1]}`;
    })()
    : formatMetricValue(value);
  const targetRows = (actual, target) => [
    ["Meta no período", target > 0 ? formatKpiValue(target) : "Não definida"],
    ["Atingimento", target > 0 ? formatPercent(actual / target) : "—"],
    ["Faltam para a meta", target > 0 ? formatKpiValue(barMetric === "count" ? Math.ceil(Math.max(0, target - actual)) : Math.max(0, target - actual)) : "—"],
  ];

  const dateHourMatrix = useMemo(() => {
    if (!activeRange.start) return { dates: [], rows: [], max: 0 };
    return makeDateHourMatrix(filteredEditedDays, activeRange.start, activeRange.end, selectedStatus, barMetric);
  }, [activeRange, barMetric, filteredEditedDays, selectedStatus]);

  const movementStatuses = useMemo(() => {
    const key = barMetric === "gmv" ? "statusGmv" : "status";
    return [...new Set(filteredEditedDays.flatMap((day) => Object.keys(day[key] || {})))].filter((status) => {
      if (!selectedStatus) return true;
      if (selectedStatus === UNMAPPED_STATUS_STAGE) return !MAPPED_STATUS_NAMES.has(status);
      return isStatusStage(selectedStatus) ? FUNNEL_STAGE_STATUS[selectedStatus]?.has(status) : status === selectedStatus;
    }).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [filteredEditedDays, barMetric, selectedStatus]);

  const lineData = useMemo(() => {
    if (!activeRange.start) return [];
    const actual = makeDailySeries(filteredEditedDays, activeRange.start, activeRange.end, selectedStatus, barMetric);
    const goals = makeGoalDailySeries(filteredGoals, activeRange.start, activeRange.end, dataset?.today || toIsoDate(new Date()));
    const goalsByDate = new Map(goals.map((day) => [day.date, day.target]));
    const valuesByDate = new Map(filteredEditedDays.map((day) => [day.date, day[barMetric === "gmv" ? "statusGmv" : "status"] || {}]));
    return actual.map((day) => ({
      ...day,
      ...Object.fromEntries(movementStatuses.map((status, index) => [`status${index}`, Number(valuesByDate.get(day.date)?.[status]) || 0])),
      meta: goalsByDate.get(day.date) || 0,
    }));
  }, [activeRange, barMetric, dataset, filteredEditedDays, filteredGoals, selectedStatus, movementStatuses]);

  const toggleStatusFilter = (statusName) => {
    if (!statusName) return;
    setSelectedStatus((current) => (current === statusName ? "" : statusName));
  };

  const updateRange = (field, value) => {
    if (!value) return;
    value = value < DASHBOARD_START_DATE ? DASHBOARD_START_DATE : value;
    setCustomRange((prev) => {
      const base = prev || activeRange;
      const next = { ...base, [field]: value };
      if (next.start > next.end) {
        return field === "start" ? { start: value, end: value } : { start: value, end: value };
      }
      return next;
    });
  };

  if (error) {
    return (
      <main className="page-shell">
        <Card>
          <p className="eyebrow">Erro</p>
          <h1>Dashboard indisponível</h1>
          <p className="muted">{error}</p>
        </Card>
      </main>
    );
  }

  if (!dataset) {
    return (
      <main className="page-shell">
        <Card>
          <p className="eyebrow">{syncError ? "Falha na atualização" : "Carregando"}</p>
          <h1>Contatos feitos</h1>
          {syncError && <p>{syncError} Nova tentativa automática em até 1 minuto.</p>}
        </Card>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="hero">
        <div className="amplify-brand"><img src="/amplify-symbol.jpg" alt="Símbolo Amplify" /><span>Amplify<span>AQUISIÇÃO</span></span></div>
        <div>
          <span className="eyebrow">Aquisição · Leads Outbound</span>
          <h1>Sniper</h1>
          <p>{activeResponsible?.name} · {barMetric === "gmv" ? "visão de GMV" : "visão de volume"} por Alterado em</p>
          <p className="sync-status" role="status">
            {syncError ? "Falha ao atualizar · exibindo os últimos dados disponíveis" : "Sincronização automática a cada 5 min"}
            {dataset.generatedAt && ` · Atualizado em ${new Date(dataset.generatedAt).toLocaleString("pt-BR", { timeZone: dataset.timezone || "America/Sao_Paulo" })}`}
          </p>
        </div>
        <span className="data-chip">{formatDate(activeRange.start)} - {formatDate(activeRange.end)}</span>
      </header>

      <Card className="filters-card">
        <label className="responsible-select">
          Responsável
          <select
            value={responsibleId}
            onChange={(event) => {
              setResponsibleId(event.target.value);
              setSelectedStatus("");
            }}
          >
            <option value={ALL_RESPONSIBLES_ID}>Todos</option>
            {dataset.responsibles.map((responsible) => (
              <option key={responsible.id} value={responsible.id}>{responsible.name}</option>
            ))}
          </select>
        </label>
        <div className="mode-toggle" aria-label="Métrica das barras">
          <button className={barMetric === "gmv" ? "active" : ""} onClick={() => setBarMetric("gmv")} type="button">
            GMV
          </button>
          <button className={barMetric === "count" ? "active" : ""} onClick={() => setBarMetric("count")} type="button">
            Contagem
          </button>
        </div>
        <div className="range-selectors" aria-label="Filtro de intervalo">
          <label>
            De
            <input
              min={DASHBOARD_START_DATE}
              onChange={(event) => updateRange("start", event.target.value)}
              type="date"
              value={activeRange.start}
            />
          </label>
          <label>
            Até
            <input
              min={DASHBOARD_START_DATE}
              onChange={(event) => updateRange("end", event.target.value)}
              type="date"
              value={activeRange.end}
            />
          </label>
        </div>
      </Card>

      <section className="goal-progress-grid" aria-label={goalMetricLabel}>
        <Card className={`goal-progress-card ${monthlyProgress.target > 0 && monthlyProgress.percent >= 1 ? "result-good" : "result-below"}`}>
          <div className="goal-progress-heading">
            <div><span className="goal-eyebrow">{goalMetricLabel.toUpperCase()}</span><h2>Meta dos meses completos</h2><span className="goal-months">Meses da meta · {monthlyProgress.label}</span></div>
            <div className="goal-achievement"><b>{monthlyProgress.target > 0 ? formatPercent(monthlyProgress.percent) : "—"}</b><span>da meta atingida</span></div>
          </div>
          <div className="goal-progress-track" role="progressbar" aria-label={goalMetricLabel + " — atingimento mensal"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, monthlyProgress.percent * 100))} aria-valuetext={monthlyProgress.target > 0 ? formatPercent(monthlyProgress.percent) : "Meta não definida"}>
            <div style={{ width: `${Math.min(100, Math.max(0, monthlyProgress.percent * 100))}%` }} />
          </div>
          <div className="goal-amounts">
            <div><span>Realizado no período</span><strong>{formatGoalGmv(monthlyProgress.actual)}</strong></div>
            <div><span>Meta dos meses completos</span><strong>{monthlyProgress.target > 0 ? formatGoalGmv(monthlyProgress.target) : "Não definida"}</strong></div>
            <div><span>Falta para a meta</span><strong>{monthlyProgress.target > 0 ? formatGoalGmv(Math.max(0, monthlyProgress.target - monthlyProgress.actual)) : "—"}</strong></div>
          </div>
          <div className={`goal-period ${periodProgress.target > 0 && periodProgress.percent >= 1 ? "result-good" : "result-below"}`}>
            <div className="goal-progress-heading">
              <div><h2>Meta do período selecionado</h2><span className="goal-months">{activeRange.start.split("-").reverse().join("/")} a {activeRange.end.split("-").reverse().join("/")}</span></div>
              <div className="goal-achievement"><b>{periodProgress.target > 0 ? formatPercent(periodProgress.percent) : "—"}</b><span>da meta atingida</span></div>
            </div>
            <div className="goal-progress-track" role="progressbar" aria-label={goalMetricLabel + " — atingimento no período"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, periodProgress.percent * 100))} aria-valuetext={periodProgress.target > 0 ? formatPercent(periodProgress.percent) : "Meta não definida"}>
              <div style={{ width: `${Math.min(100, Math.max(0, periodProgress.percent * 100))}%` }} />
            </div>
            <div className="goal-amounts">
              <div><span>Realizado no período</span><strong>{formatGoalGmv(monthlyProgress.actual)}</strong></div>
              <div><span>Meta do período selecionado</span><strong>{periodProgress.target > 0 ? formatGoalGmv(periodProgress.target) : "Não definida"}</strong></div>
              <div><span>Falta para a meta</span><strong>{periodProgress.target > 0 ? formatGoalGmv(Math.max(0, periodProgress.target - monthlyProgress.actual)) : "—"}</strong></div>
            </div>
          </div>
        </Card>
      </section>
      {dataset.goals?.status && dataset.goals.status !== "ok" && (
        <Card className="notice-card">
          Meta Q4: a integração está pronta, mas a planilha ainda não foi lida pelo atualizador ({dataset.goals.message || dataset.goals.status}).
        </Card>
      )}

      <div className="dashboard-grid">
        <Card className="chart-card">
          <div className="section-title">
            <h2>Funil de vendas</h2>
            {selectedStatus && (
              <button className="clear-filter-button" onClick={() => setSelectedStatus("")} type="button">
                Limpar
              </button>
            )}
          </div>
          <div className="funnel-legend"><span>━ Realizado</span><span>┆ Meta do período</span><span>Azul: meta atingida · Vermelho: abaixo</span></div>
          <div className="consolidated-funnel">
            {(() => {
              const rows = filterGoalRows(dataset?.goals?.daily || [], activeRange, activeResponsible, "", barMetric);
              const stages = efficiencyStages.map((stage) => {
                const stageRows = rows.filter((row) => row.stage === stage.name);
                const direct = stageRows.length ? sumGmvGoalForSelection(stageRows, activeRange.end, dataset.today) : null;
                const target = stage.name === "Primeiro contato" ? contactTarget : direct;
                return { ...stage, target };
              });
              const max = Math.max(1, ...stages.flatMap((stage) => [stage.value, stage.target || 0]));
              return stages.map((stage, index) => {
                const previous = stages[index - 1];
                const conversion = previous?.value > 0 ? stage.value / previous.value : null;
                const hasTarget = stage.target > 0;
                const good = hasTarget && stage.value >= stage.target;
                return <div className="funnel-stage" key={stage.name}>
                  {previous && <div className="funnel-step-conversion">↓ {conversion !== null ? formatPercent(conversion) : "—"} <span>{previous.name} → {stage.name}</span></div>}
                  <button type="button" className={`funnel-stage-button ${hasTarget ? good ? "result-good" : "result-below" : "funnel-neutral"} ${selectedStatus === stage.name ? "is-selected" : ""}`} onClick={() => toggleStatusFilter(stage.name)}>
                    <div className="funnel-stage-heading"><strong>{stage.name}</strong><b>{formatKpiValue(stage.value)}</b></div>
                    <div className="funnel-stage-track">
                      <div className="funnel-stage-fill" style={{ width: `${stage.value / max * 100}%` }} />
                      {hasTarget && <i className="funnel-target-marker" style={{ left: `${stage.target / max * 100}%` }} />}
                    </div>
                    <div className="funnel-stage-details"><span>{hasTarget ? `Meta: ${formatKpiValue(stage.target)} · ${formatPercent(stage.value / stage.target)} atingido` : "Meta não definida"}</span><span>{hasTarget ? `Faltam ${formatKpiValue(barMetric === "count" ? Math.ceil(Math.max(0, stage.target - stage.value)) : Math.max(0, stage.target - stage.value))}` : ""}</span></div>
                  </button>
                </div>;
              });
            })()}
          </div>
          <div className="funnel-team-efficiencies">
            <div className={sdrBase > 0 && sdrEfficiency >= .4 ? "result-good" : "result-below"}><strong>SDR · {sdrBase ? formatPercent(sdrEfficiency) : "—"}</strong><span className="team-efficiency-target">Meta de eficiência: 40%</span><span>Primeiro contato → Agendada</span><small>{formatKpiValue(sdrConverted)} / {formatKpiValue(sdrBase)}</small></div>
            <div className={closerBase > 0 && closerEfficiency >= .6 ? "result-good" : "result-below"}><strong>Closer · {closerBase ? formatPercent(closerEfficiency) : "—"}</strong><span className="team-efficiency-target">Meta de eficiência: 60%</span><span>Realizada → Agenciado</span><small>{formatKpiValue(closerConverted)} / {formatKpiValue(closerBase)}</small></div>
          </div>
          {selectedStatus && <p className="active-filter-note">Filtrando todas as views por: <strong>{selectedStatus}</strong></p>}
        </Card>
        <Card className="hour-card">
          <div className="mode-toggle chart-view-toggle" aria-label="Visualização de melhores horários">
            <button type="button" className={hourView === "ranking" ? "active" : ""} onClick={() => setHourView("ranking")}>Horários</button>
            <button type="button" className={hourView === "creators" ? "active" : ""} onClick={() => setHourView("creators")}>Criadores</button>
          </div>
          {hourView === "ranking" ? <RankingList data={hourRanking} metric={barMetric} /> :
            <CreatorList key={`${responsibleId}|${activeRange.start}|${activeRange.end}|${selectedStatus}`} creators={visibleCreators} />}
        </Card>
      </div>

      <Card className="chart-card movement-wide">
        <div className="section-title">
          <h2>{movementView === "heatmap" ? "Movimento por data/hora" : "Movimento por dia"}</h2>
        </div>
        <div className="mode-toggle chart-view-toggle" aria-label="Visualização do movimento">
          <button className={movementView === "bars" ? "active" : ""} onClick={() => setMovementView("bars")} type="button">
            Barras
          </button>
          <button className={movementView === "heatmap" ? "active" : ""} onClick={() => setMovementView("heatmap")} type="button">
            Data/hora
          </button>
        </div>
        {movementView === "heatmap" ? (
          <DateHourHeatmap matrix={dateHourMatrix} metric={barMetric} />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={lineData} margin={{ top: 34, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis axisLine={false} dataKey="label" minTickGap={18} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickFormatter={barMetric === "gmv" ? formatCompactNumber : undefined}
                tickLine={false}
              />
              <Tooltip content={<MovementTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 800, paddingTop: 8 }} />
              {movementStatuses.map((status, index) => <Bar key={status} dataKey={`status${index}`} stackId="contact-status" fill={["#0047ff", "#ff0046", "#1734ad", "#3979ff", "#b50035", "#10285a", "#6c9cff", "#f8799c", "#5763bf", "#7d3854"][index % 10]} isAnimationActive={false} name={status}>
                {index === movementStatuses.length - 1 && <LabelList content={(props) => <TotalLabel {...props} metric={barMetric} />} dataKey="total" />}
              </Bar>)}
              {goalSummary.rows > 0 && (
                <Line
                  activeDot={{ r: 5 }}
                  dataKey="meta"
                  dot={false}
                  isAnimationActive={false}
                  name="Meta esperada"
                  stroke="#ff0046"
                  strokeWidth={3}
                  type="monotone"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <footer>
        Critério: total, funil, movimento, horários e metas seguem Alterado em; filtros respeitam responsável, período, etapa e métrica selecionados. Metas de GMV e contagem usam sempre as colunas normais da planilha, inclusive em datas futuras. Snapshot gerado em {new Date(dataset.generatedAt).toLocaleString("pt-BR", { timeZone: dataset.timezone })}.
      </footer>
    </main>
  );
}
