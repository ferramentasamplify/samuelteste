import fs from "node:fs";
import path from "node:path";

const DATABASE_ID = process.env.OUTBOUND_NOTION_DATABASE_ID || "344b0bbef153803d9fe9f956e2f67f20";
const NOTION_TOKEN = process.env.NOTION_TOKEN || "";
const NOTION_VERSION = "2022-06-28";
const TIMEZONE = "America/Sao_Paulo";
const OUTPUT_FILE = process.env.OUTPUT_FILE || path.resolve("public/luiz-contatos.json");
const GOALS_CSV_URL = process.env.GOALS_CSV_URL || "https://docs.google.com/spreadsheets/d/1WRaYpUtWZP0vF695SKwWigE5UrP0ix9DBxJ4KXxfX9w/gviz/tq?tqx=out:csv&sheet=Meta%20Q4%20base";
const LUIZ_ID = "3a3d872b-594c-8172-8b7b-0002377cf28b";
const LUIZ_NAME = "Luiz Carlos de Souza Ribeiro";
const RESPONSIBLE_NAME_BY_ID = {
  "2b5d872b-594c-81d6-87ba-0002064437c0": "Andrei Archer",
  "307d872b-594c-81e9-9f48-0002dc826c24": "Bruno Zardo",
  "2e1d872b-594c-81af-8abd-0002911b4b32": "Leonardo Avila",
  "3a3d872b-594c-8172-8b7b-0002377cf28b": LUIZ_NAME,
  "85e19408-18a4-4524-9e9d-886f950fac5d": "Matheus Figueiredo",
  "35dd872b-594c-817b-a17a-00025a11686b": "Samuel",
};
const FIRST_CONTACT_STATUSES = ["CONTATADO", "Contatado WPP", "Contatado Tiktok", "Contato WPP", "FUP 1", "FUP 2", "FUP 3"];
const RESPONDED_STATUSES = ["Em progresso", "Qualificação", "CHAMAR NO WPP"];
const SCHEDULED_STATUSES = ["Reunião Agendada", "Analise de perfil agendada", "Primeira meet"];
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
  "Qualificação": "Respondidos",
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
const FUNNEL_STAGES = [
  { name: "Primeiro contato", statuses: [...FIRST_CONTACT_STATUSES, ...RESPONDED_STATUSES, ...SCHEDULED_STATUSES, ...REALIZED_STATUSES, ...PROPOSAL_STATUSES, ...AGENCY_STATUSES] },
  { name: "Respondidos", statuses: [...RESPONDED_STATUSES, ...SCHEDULED_STATUSES, ...REALIZED_STATUSES, ...PROPOSAL_STATUSES, ...AGENCY_STATUSES] },
  { name: "Reuniões agendadas", statuses: [...SCHEDULED_STATUSES, ...REALIZED_STATUSES, ...PROPOSAL_STATUSES, ...AGENCY_STATUSES] },
  { name: "Realizadas", statuses: [...REALIZED_STATUSES, ...PROPOSAL_STATUSES, ...AGENCY_STATUSES] },
  { name: "Propostas ongoing", statuses: PROPOSAL_STATUSES },
  { name: "Agenciado", statuses: AGENCY_STATUSES },
];

if (!NOTION_TOKEN) {
  throw new Error("NOTION_TOKEN nao configurado.");
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TIMEZONE,
  year: "numeric",
});

const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  hour12: false,
  timeZone: TIMEZONE,
});

function isoDateInSaoPaulo(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormatter.format(date);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function hourInSaoPaulo(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return hourFormatter.format(date).replace(/\D/g, "").padStart(2, "0").slice(0, 2);
}

function plainText(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(", ");
  if (value.plain_text) return value.plain_text;
  if (value.name) return value.name;
  if (value.text?.content) return value.text.content;
  if (value.email) return value.email;
  if (value.phone_number) return value.phone_number;
  if (value.person?.email) return value.person.email;
  return "";
}

function propertyValue(properties, key) {
  const prop = properties?.[key];
  if (!prop) return "";
  switch (prop.type) {
    case "title": return plainText(prop.title);
    case "rich_text": return plainText(prop.rich_text);
    case "select": return prop.select?.name || "";
    case "status": return prop.status?.name || "";
    case "multi_select": return plainText(prop.multi_select);
    case "number": return prop.number || 0;
    case "people": return prop.people || [];
    case "phone_number": return prop.phone_number || "";
    case "email": return prop.email || "";
    case "checkbox": return prop.checkbox ? "Sim" : "Nao";
    case "date": return prop.date?.start || "";
    case "created_time": return prop.created_time || "";
    case "last_edited_time": return prop.last_edited_time || "";
    case "formula": return formulaValue(prop.formula);
    case "rollup": return plainText(prop.rollup?.array) || prop.rollup?.number || "";
    default: return plainText(prop[prop.type]);
  }
}

function normalizeHeader(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => String(value).trim()));
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (!text) return 0;
  const clean = text
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseGoalDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return toIsoDate(new Date(Math.round((serial - 25569) * 86400 * 1000)));
  }
  return "";
}

function dateFromIso(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function eachBusinessDate(start, end) {
  const dates = [];
  if (!start || !end) return dates;
  for (let cursor = dateFromIso(start); cursor <= dateFromIso(end); cursor = addDays(cursor, 1)) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) dates.push(toIsoDate(cursor));
  }
  return dates;
}

function pickHeader(headers, candidates) {
  return headers.find((header) => candidates.some((candidate) => header.normalized.includes(candidate)))?.index ?? -1;
}

function findHeader(headers, required, forbidden = []) {
  return headers.find((header) =>
    required.every((item) => header.normalized.includes(item)) &&
    forbidden.every((item) => !header.normalized.includes(item))
  )?.index ?? -1;
}

function findGoalColumn(headers, { stage, metric, adjusted = false, cadence = [] }) {
  const stageTokens = stage === "scheduled" ? ["agendado", "agendamento"] : ["agenciado", "agenciamento"];
  const metricTokens = metric === "gmv" ? ["gmv", "faturamento"] : ["creator", "criador", "volume"];
  return headers.find((header) =>
    header.normalized.includes("meta") &&
    stageTokens.some((token) => header.normalized.includes(token)) &&
    metricTokens.some((token) => header.normalized.includes(token)) &&
    cadence.every((token) => header.normalized.includes(token)) &&
    (adjusted ? header.normalized.includes("ajust") : !header.normalized.includes("ajust"))
  )?.index ?? -1;
}

function addDailyGoalRows(daily, dates, row, config) {
  const normalDaily = parseNumber(row[config.normalDailyIndex]);
  const adjustedDaily = config.adjustedDailyIndex >= 0 ? parseNumber(row[config.adjustedDailyIndex]) : 0;
  const normalWeekly = config.normalWeeklyIndex >= 0 ? parseNumber(row[config.normalWeeklyIndex]) : 0;
  const adjustedWeekly = config.adjustedWeeklyIndex >= 0 ? parseNumber(row[config.adjustedWeeklyIndex]) : 0;

  dates.forEach((date) => {
    daily.push({
      date,
      responsible: "",
      stage: config.stage,
      metric: config.metric,
      normalDaily,
      adjustedDaily,
      normalWeekly,
      adjustedWeekly,
    });
  });
}

function normalizeGoalStage(value = "") {
  const text = String(value).trim();
  if (!text) return "";
  const exact = FUNNEL_STAGES.find((stage) => stage.name.toLowerCase() === text.toLowerCase());
  if (exact) return exact.name;
  return STATUS_STAGE_MAP[text] || text;
}

function normalizeMetric(value = "") {
  const text = normalizeHeader(value);
  if (text.includes("gmv") || text.includes("faturamento")) return "gmv";
  return "count";
}

function buildGoalsFromCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { status: "empty", daily: [], source: "Meta Q4 base" };

  const headers = rows[0].map((value, index) => ({ index, label: value, normalized: normalizeHeader(value) }));
  const startDateIndex = findHeader(headers, ["dia", "inicio"]);
  const endDateIndex = findHeader(headers, ["dia", "fim"]);
  const agencyWeeklyIndex = findHeader(headers, ["agenciamento", "semanal"], ["ajust"]);
  const agencyDailyIndex = findHeader(headers, ["agenciamento", "diaria"], ["ajust"]);
  const scheduledWeeklyIndex = findHeader(headers, ["agendamento", "semanal"], ["ajust"]);
  const scheduledDailyIndex = findHeader(headers, ["agendamento", "diaria"], ["ajust"]);
  const agencyAdjustedWeeklyIndex = findHeader(headers, ["agenciamento", "semanal", "ajust"]);
  const agencyAdjustedDailyIndex = findHeader(headers, ["agenciamento", "diaria", "ajust"]);
  const scheduledAdjustedWeeklyIndex = findHeader(headers, ["agendamento", "semanal", "ajust"]);
  const scheduledAdjustedDailyIndex = findHeader(headers, ["agendamento", "diaria", "ajust"]);

  if (startDateIndex >= 0 && endDateIndex >= 0 && (agencyDailyIndex >= 0 || scheduledDailyIndex >= 0)) {
    const daily = [];
    rows.slice(1).forEach((row) => {
      const start = parseGoalDate(row[startDateIndex]);
      const end = parseGoalDate(row[endDateIndex]);
      const dates = eachBusinessDate(start, end);
      dates.forEach((date) => {
        if (agencyDailyIndex >= 0) {
          daily.push({
            date,
            responsible: "",
            stage: "Agenciado",
            metric: "gmv",
            normalDaily: parseNumber(row[agencyDailyIndex]),
            adjustedDaily: agencyAdjustedDailyIndex >= 0 ? parseNumber(row[agencyAdjustedDailyIndex]) : 0,
            normalWeekly: agencyWeeklyIndex >= 0 ? parseNumber(row[agencyWeeklyIndex]) : 0,
            adjustedWeekly: agencyAdjustedWeeklyIndex >= 0 ? parseNumber(row[agencyAdjustedWeeklyIndex]) : 0,
          });
        }
        if (scheduledDailyIndex >= 0) {
          daily.push({
            date,
            responsible: "",
            stage: "Reuniões agendadas",
            metric: "gmv",
            normalDaily: parseNumber(row[scheduledDailyIndex]),
            adjustedDaily: scheduledAdjustedDailyIndex >= 0 ? parseNumber(row[scheduledAdjustedDailyIndex]) : 0,
            normalWeekly: scheduledWeeklyIndex >= 0 ? parseNumber(row[scheduledWeeklyIndex]) : 0,
            adjustedWeekly: scheduledAdjustedWeeklyIndex >= 0 ? parseNumber(row[scheduledAdjustedWeeklyIndex]) : 0,
          });
        }
      });
    });

    return {
      status: daily.length ? "ok" : "empty",
      generatedAt: new Date().toISOString(),
      source: "Meta Q4 base",
      daily,
    };
  }

  const dateIndex = pickHeader(headers, ["data", "dia"]);
  const wideGoalConfigs = [
    {
      stage: "Agenciado",
      metric: "gmv",
      normalDailyIndex: findGoalColumn(headers, { stage: "agency", metric: "gmv" }),
      adjustedDailyIndex: findGoalColumn(headers, { stage: "agency", metric: "gmv", adjusted: true }),
      normalWeeklyIndex: findGoalColumn(headers, { stage: "agency", metric: "gmv", cadence: ["seman"] }),
      adjustedWeeklyIndex: findGoalColumn(headers, { stage: "agency", metric: "gmv", adjusted: true, cadence: ["seman"] }),
    },
    {
      stage: "Agenciado",
      metric: "count",
      normalDailyIndex: findGoalColumn(headers, { stage: "agency", metric: "count" }),
      adjustedDailyIndex: findGoalColumn(headers, { stage: "agency", metric: "count", adjusted: true }),
      normalWeeklyIndex: findGoalColumn(headers, { stage: "agency", metric: "count", cadence: ["seman"] }),
      adjustedWeeklyIndex: findGoalColumn(headers, { stage: "agency", metric: "count", adjusted: true, cadence: ["seman"] }),
    },
    {
      stage: "Reuniões agendadas",
      metric: "gmv",
      normalDailyIndex: findGoalColumn(headers, { stage: "scheduled", metric: "gmv" }),
      adjustedDailyIndex: findGoalColumn(headers, { stage: "scheduled", metric: "gmv", adjusted: true }),
      normalWeeklyIndex: findGoalColumn(headers, { stage: "scheduled", metric: "gmv", cadence: ["seman"] }),
      adjustedWeeklyIndex: findGoalColumn(headers, { stage: "scheduled", metric: "gmv", adjusted: true, cadence: ["seman"] }),
    },
    {
      stage: "Reuniões agendadas",
      metric: "count",
      normalDailyIndex: findGoalColumn(headers, { stage: "scheduled", metric: "count" }),
      adjustedDailyIndex: findGoalColumn(headers, { stage: "scheduled", metric: "count", adjusted: true }),
      normalWeeklyIndex: findGoalColumn(headers, { stage: "scheduled", metric: "count", cadence: ["seman"] }),
      adjustedWeeklyIndex: findGoalColumn(headers, { stage: "scheduled", metric: "count", adjusted: true, cadence: ["seman"] }),
    },
  ].filter((config) => config.normalDailyIndex >= 0 || config.adjustedDailyIndex >= 0);

  if (dateIndex >= 0 && wideGoalConfigs.length) {
    const daily = [];
    rows.slice(1).forEach((row) => {
      const date = parseGoalDate(row[dateIndex]);
      if (!date) return;
      wideGoalConfigs.forEach((config) => addDailyGoalRows(daily, [date], row, config));
    });

    return {
      status: daily.length ? "ok" : "empty",
      generatedAt: new Date().toISOString(),
      source: "Meta Q4 base",
      daily,
    };
  }

  const responsibleIndex = pickHeader(headers, ["responsavel", "closer", "sdr"]);
  const stageIndex = pickHeader(headers, ["etapa", "status", "funil"]);
  const metricIndex = pickHeader(headers, ["metrica", "indicador"]);
  const normalDailyIndex = headers.find((header) =>
    header.normalized.includes("meta") &&
    (header.normalized.includes("dia") || header.normalized.includes("diaria")) &&
    !header.normalized.includes("ajust")
  )?.index ?? -1;
  const adjustedDailyIndex = headers.find((header) =>
    header.normalized.includes("meta") &&
    (header.normalized.includes("dia") || header.normalized.includes("diaria")) &&
    header.normalized.includes("ajust")
  )?.index ?? -1;
  const normalWeeklyIndex = headers.find((header) =>
    header.normalized.includes("meta") &&
    (header.normalized.includes("semana") || header.normalized.includes("weekly")) &&
    !header.normalized.includes("ajust")
  )?.index ?? -1;
  const adjustedWeeklyIndex = headers.find((header) =>
    header.normalized.includes("meta") &&
    (header.normalized.includes("semana") || header.normalized.includes("weekly")) &&
    header.normalized.includes("ajust")
  )?.index ?? -1;

  if (dateIndex < 0 || (normalDailyIndex < 0 && adjustedDailyIndex < 0 && normalWeeklyIndex < 0 && adjustedWeeklyIndex < 0)) {
    return {
      status: "unrecognized",
      daily: [],
      source: "Meta Q4 base",
      headers: headers.map((header) => header.label).slice(0, 20),
    };
  }

  const daily = rows.slice(1).map((row) => ({
    date: parseGoalDate(row[dateIndex]),
    responsible: responsibleIndex >= 0 ? String(row[responsibleIndex] || "").trim() : "",
    stage: stageIndex >= 0 ? normalizeGoalStage(row[stageIndex]) : "",
    metric: metricIndex >= 0 ? normalizeMetric(row[metricIndex]) : "count",
    normalDaily: normalDailyIndex >= 0 ? parseNumber(row[normalDailyIndex]) : 0,
    adjustedDaily: adjustedDailyIndex >= 0 ? parseNumber(row[adjustedDailyIndex]) : 0,
    normalWeekly: normalWeeklyIndex >= 0 ? parseNumber(row[normalWeeklyIndex]) : 0,
    adjustedWeekly: adjustedWeeklyIndex >= 0 ? parseNumber(row[adjustedWeeklyIndex]) : 0,
  })).filter((row) => row.date);

  return {
    status: daily.length ? "ok" : "empty",
    generatedAt: new Date().toISOString(),
    source: "Meta Q4 base",
    daily,
  };
}

async function fetchGoals() {
  if (!GOALS_CSV_URL) return { status: "disabled", daily: [], source: "Meta Q4 base" };
  try {
    const response = await fetch(GOALS_CSV_URL, { signal: AbortSignal.timeout(30_000) });
    const text = await response.text();
    if (!response.ok || text.includes("Acesse a sua conta do Google") || text.includes("ServiceLogin")) {
      return {
        status: "permission_denied",
        daily: [],
        source: "Meta Q4 base",
        message: "Planilha sem permissao de leitura publica para o atualizador.",
      };
    }
    return buildGoalsFromCsv(text);
  } catch (error) {
    return {
      status: "error",
      daily: [],
      source: "Meta Q4 base",
      message: error.message,
    };
  }
}

function formulaValue(formula = {}) {
  switch (formula.type) {
    case "string": return formula.string || "";
    case "number": return formula.number || 0;
    case "boolean": return formula.boolean ? "Sim" : "Nao";
    case "date": return formula.date?.start || "";
    default: return "";
  }
}

async function notionRequest(pathname, body) {
  const response = await fetch(`https://api.notion.com/v1${pathname}`, {
    signal: AbortSignal.timeout(30_000),
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`notion_${response.status}: ${json?.message || response.statusText}`);
  }
  return json;
}

async function fetchPages() {
  const pages = [];
  let cursor;
  do {
    const result = await notionRequest(`/databases/${DATABASE_ID}/query`, {
      page_size: 100,
      start_cursor: cursor || undefined,
      sorts: [{ property: "Alterado em", direction: "ascending" }],
    });
    pages.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return pages;
}

function ensureDay(target, date) {
  if (!target.has(date)) {
    target.set(date, { date, total: 0, status: {}, statusGmv: {}, hour: {} });
  }
  return target.get(date);
}

function addToDay(day, hour, status, gmv) {
  day.total += 1;
  day.status[status] = (day.status[status] || 0) + 1;
  day.statusGmv[status] = (day.statusGmv[status] || 0) + gmv;

  if (!day.hour[hour]) day.hour[hour] = { total: 0, status: {}, statusGmv: {} };
  day.hour[hour].total += 1;
  day.hour[hour].status[status] = (day.hour[hour].status[status] || 0) + 1;
  day.hour[hour].statusGmv[status] = (day.hour[hour].statusGmv[status] || 0) + gmv;
}

function blankResponsible(person) {
  return {
    id: person.id,
    name: person.name,
    modes: {
      created: { label: "Criado em", days: [] },
      edited: { label: "Alterado em", days: [] },
    },
    _created: new Map(),
    _edited: new Map(),
  };
}

function serializeResponsible(responsible) {
  return {
    id: responsible.id,
    name: responsible.name,
    modes: {
      created: {
        label: "Criado em",
        days: Array.from(responsible._created.values()).sort((a, b) => a.date.localeCompare(b.date)),
      },
      edited: {
        label: "Alterado em",
        days: Array.from(responsible._edited.values()).sort((a, b) => a.date.localeCompare(b.date)),
      },
    },
  };
}

function buildDataset(pages, goals) {
  const byResponsible = new Map();
  const allDates = new Set();
  const creators = [];

  for (const page of pages) {
    const properties = page.properties || {};
    const people = propertyValue(properties, "Responsável");
    if (!Array.isArray(people) || !people.length) continue;

    const status = propertyValue(properties, "Status de contato") || "Sem status";
    const gmv = Number(propertyValue(properties, "GMV")) || 0;
    const createdAt = propertyValue(properties, "Criado em") || page.created_time;
    const editedAt = propertyValue(properties, "Alterado em") || page.last_edited_time;
    const createdDate = isoDateInSaoPaulo(createdAt);
    const editedDate = isoDateInSaoPaulo(editedAt);
    const createdHour = hourInSaoPaulo(createdAt);
    const editedHour = hourInSaoPaulo(editedAt);

    creators.push({
      id: page.id,
      creatorId: propertyValue(properties, "Creator ID"),
      gmv,
      phone: propertyValue(properties, "WhatsApp"),
      status,
      responsibleIds: people.map((person) => person.id),
      createdDate,
      createdHour,
      editedDate,
      editedHour,
    });

    for (const person of people) {
      const responsible = {
        id: person.id,
        name: RESPONSIBLE_NAME_BY_ID[person.id] || person.name || person.person?.email || "Outro responsável",
      };
      if (!byResponsible.has(responsible.id)) byResponsible.set(responsible.id, blankResponsible(responsible));
      const bucket = byResponsible.get(responsible.id);

      if (createdDate && createdHour) {
        allDates.add(createdDate);
        addToDay(ensureDay(bucket._created, createdDate), createdHour, status, gmv);
      }
      if (editedDate && editedHour) {
        allDates.add(editedDate);
        addToDay(ensureDay(bucket._edited, editedDate), editedHour, status, gmv);
      }
    }
  }

  goals?.daily?.forEach((goal) => {
    if (goal.date) allDates.add(goal.date);
  });

  const responsibles = Array.from(byResponsible.values())
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const serializedByResponsible = Object.fromEntries(
    Array.from(byResponsible.values()).map((responsible) => [responsible.id, serializeResponsible(responsible)])
  );
  const dates = Array.from(allDates).sort();
  const today = isoDateInSaoPaulo(new Date().toISOString());
  const luiz = serializedByResponsible[LUIZ_ID] || serializedByResponsible[responsibles[0]?.id] || null;

  return {
    generatedAt: new Date().toISOString(),
    timezone: TIMEZONE,
    today,
    source: "Leads Outbound",
    responsible: {
      id: luiz?.id || LUIZ_ID,
      name: luiz?.name || LUIZ_NAME,
    },
    responsibles,
    range: {
      start: dates[0] || "",
      end: today,
    },
    modes: luiz?.modes || { created: { label: "Criado em", days: [] }, edited: { label: "Alterado em", days: [] } },
    byResponsible: serializedByResponsible,
    creators,
    days: luiz?.modes?.created?.days || [],
    total: pages.length,
    goals,
    criterion: "Leads Outbound agregado por Responsável; Alterado em usa o timestamp real do Notion.",
    ignoredBulkEdits: {
      strategy: "desativado para manter o dashboard online por Alterado em real.",
    },
  };
}

const [pages, goals] = await Promise.all([fetchPages(), fetchGoals()]);
const dataset = buildDataset(pages, goals);
fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
const temporaryOutput = `${OUTPUT_FILE}.${process.pid}.tmp`;
fs.writeFileSync(temporaryOutput, `${JSON.stringify(dataset, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(temporaryOutput, OUTPUT_FILE);

console.log(JSON.stringify({
  output: OUTPUT_FILE,
  generatedAt: dataset.generatedAt,
  range: dataset.range,
  responsibles: dataset.responsibles.length,
  goals: dataset.goals?.status || "disabled",
  goalRows: dataset.goals?.daily?.length || 0,
  pages: pages.length,
}, null, 2));
