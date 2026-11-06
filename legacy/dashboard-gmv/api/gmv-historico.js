const DEFAULT_TABLE_ID = "PUk4cvXS0H2TSsrZ";

const titleCase = (value) =>
  String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const formatSquadName = (value) => {
  const text = String(value || "").trim();
  if (!text) return "Squad sem nome";
  if (/^squad[._ -]/i.test(text)) return titleCase(text);
  return text;
};

const sortPeriod = (a, b) => String(a).localeCompare(String(b), "pt-BR");

const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

async function fetchAllRows({ baseUrl, apiKey, tableId }) {
  const rows = [];
  let cursor = null;

  do {
    const url = new URL(`/api/v1/data-tables/${tableId}/rows`, baseUrl);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: {
        "X-N8N-API-KEY": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`n8n ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    rows.push(...(data.data || []));
    cursor = data.nextCursor || null;
  } while (cursor);

  return rows;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const baseUrl = process.env.N8N_BASE_URL || "https://n8n.amplifyugc.co";
  const apiKey = process.env.N8N_API_KEY;
  const tableId = process.env.N8N_GMV_TABLE_ID || DEFAULT_TABLE_ID;

  if (!apiKey) {
    response.status(500).json({ error: "N8N_API_KEY não configurada no Vercel" });
    return;
  }

  try {
    const rows = await fetchAllRows({ baseUrl, apiKey, tableId });
    const periods = new Map();
    const squads = new Map();
    const columns = new Set([
      "squad",
      "periodo",
      "criador",
      "id_produto",
      "nome_produto",
      "gmv",
      "arquivo_origem",
      "data_processamento",
    ]);
    const detailRows = [];

    for (const row of rows) {
      const periodo = String(row.periodo || "").trim();
      const rawSquad = String(row.squad || "").trim();
      const squad = formatSquadName(rawSquad);
      const gmv = Number(row.gmv || 0);
      const rawData = parseJson(row.dados);
      const detail = {
        ...rawData,
        squad,
        periodo,
        criador: row.criador || rawData.criador || rawData.creator || rawData["@"] || "",
        id_produto: row.id_produto || "",
        nome_produto: row.nome_produto || "",
        gmv,
        arquivo_origem: row.arquivo_origem || "",
        data_processamento: row.data_processamento || row.updatedAt || "",
      };

      Object.keys(detail).forEach((key) => columns.add(key));
      detailRows.push(detail);

      if (!periodo || !squad || !Number.isFinite(gmv)) continue;

      if (!periods.has(periodo)) periods.set(periodo, { mes: periodo });
      const period = periods.get(periodo);
      period[squad] = Number(period[squad] || 0) + gmv;

      if (!squads.has(squad)) squads.set(squad, { nome: squad, raw: rawSquad });
    }

    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    response.status(200).json({
      historico: [...periods.entries()]
        .sort(([a], [b]) => sortPeriod(a, b))
        .map(([, value]) => value),
      squads: [...squads.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      linhas: detailRows,
      colunas: [...columns],
      rowCount: rows.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}
