import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const PALETA_SQUADS = [
  "#ab0000",
  "#00ad7f",
  "#eddb64",
  "#04bf04",
  "#e3028d",
  "#8b35bd",
  "#29ccb6",
  "#d4cd02",
  "#2563eb",
  "#f97316",
  "#0891b2",
  "#7c3aed",
];

const DADOS_EXEMPLO_SQUADS = [
  { nome: "Squad Max Titanium",  cor: "#ab0000" },
  { nome: "Squad Nação Verde",  cor: "#00ad7f" },
  { nome: "Squad Pibe",  cor: "#eddb64" },
  { nome: "Squad Pro Comida de Dragão",  cor: "#04bf04" },
  { nome: "Squad Pro Flora Be",  cor: "#e3028d" },
  { nome: "Squad Pro Konjac",    cor: "#8b35bd" },
  { nome: "Squad Pro Lummi",  cor: "#29ccb6" },
  { nome: "Squad Pro So Delícia",  cor: "#d4cd02" },
];

const DADOS_EXEMPLO_HISTORICO = [
  {
    mes: "Jan",
    "Squad Pro Flora Be": 142000,
    "Squad Pro Konjac":   98000,
    "Squad Pro Pibe":     76000,
    "Squad Pro Dark Lab": 54000,
  },
  {
    mes: "Fev",
    "Squad Pro Flora Be": 158000,
    "Squad Pro Konjac":   112000,
    "Squad Pro Pibe":     88000,
    "Squad Pro Dark Lab": 62000,
  },
  {
    mes: "Mar",
    "Squad Pro Flora Be": 171000,
    "Squad Pro Konjac":   125000,
    "Squad Pro Pibe":     95000,
    "Squad Pro Dark Lab": 71000,
  },
  {
    mes: "Abr",
    "Squad Pro Flora Be": 165000,
    "Squad Pro Konjac":   134000,
    "Squad Pro Pibe":     102000,
    "Squad Pro Dark Lab": 69000,
  },
  {
    mes: "Mai",
    "Squad Pro Flora Be": 183000,
    "Squad Pro Konjac":   148000,
    "Squad Pro Pibe":     115000,
    "Squad Pro Dark Lab": 78000,
  },
  {
    mes: "Jun",
    "Squad Pro Flora Be": 197000,
    "Squad Pro Konjac":   162000,
    "Squad Pro Pibe":     128000,
    "Squad Pro Dark Lab": 84000,
  },
];

// ─── HELPERS ─────────────────────────────────────────────────────
const withSquadColors = (squads) =>
  squads.map((squad, index) => ({
    ...squad,
    cor: squad.cor || PALETA_SQUADS[index % PALETA_SQUADS.length],
  }));

const fmt = (v) =>
  v >= 1000000
    ? `R$ ${(v / 1000000).toFixed(1)}M`
    : `R$ ${(v / 1000).toFixed(0)}k`;

const calcTaxa = (dados, squad) => {
  const validos = dados.filter((d) => d[squad] != null && d[squad] > 0);
  if (validos.length < 2) return null;
  const primeiro = validos[0][squad];
  const ultimo   = validos[validos.length - 1][squad];
  return (((ultimo - primeiro) / primeiro) * 100).toFixed(1);
};

const totalGMV = (dados, squads) =>
  dados.reduce((acc, row) =>
    acc + squads.reduce((s, sq) => s + (row[sq.nome] || 0), 0), 0);

// ─── KPI CARD ────────────────────────────────────────────────────
function KpiCard({ label, value, sub, cor }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderTop: `3px solid ${cor}`,
      borderRadius: 12,
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      minWidth: 0,
    }}>
      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{value}</span>
      {sub !== null && sub !== undefined && (
        <span style={{ fontSize: 12, fontWeight: 600, color: parseFloat(sub) >= 0 ? "#10b981" : "#f43f5e" }}>
          {parseFloat(sub) >= 0 ? "▲" : "▼"} {Math.abs(sub)}% no período
        </span>
      )}
    </div>
  );
}

// ─── TOOLTIP ─────────────────────────────────────────────────────
function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1f2937", borderRadius: 10,
      padding: "12px 16px", color: "#f9fafb",
      fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    }}>
      <p style={{ fontWeight: 700, marginBottom: 8, color: "#d1d5db" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 3 }}>
          <span style={{ color: p.color }}>● {p.dataKey}</span>
          <span style={{ fontWeight: 600 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────
export default function DashboardGMV() {
  const [dados, setDados]         = useState([]);
  const [squads, setSquads]       = useState([]);
  const [linhas, setLinhas]       = useState([]);
  const [colunas, setColunas]     = useState([]);
  const [status, setStatus]       = useState({ loading: true, error: null, updatedAt: null, rowCount: 0 });
  const [ativos, setAtivos]       = useState(new Set());
  const [periodo, setPeriodo]     = useState(6);
  const [criadorFiltro, setCriadorFiltro] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const response = await fetch("/api/gmv-historico");
        if (!response.ok) throw new Error(`API ${response.status}`);
        const payload = await response.json();

        if (cancelled) return;

        const nextDados = payload.historico || [];
        const nextSquads = withSquadColors(payload.squads || []);

        setDados(nextDados);
        setSquads(nextSquads);
        setLinhas(payload.linhas || []);
        setColunas(payload.colunas || []);
        setAtivos(new Set(nextSquads.map((s) => s.nome)));
        setStatus({ loading: false, error: null, updatedAt: payload.updatedAt, rowCount: payload.rowCount || 0 });
      } catch (error) {
        if (!cancelled) {
          setDados(DADOS_EXEMPLO_HISTORICO);
          setSquads(DADOS_EXEMPLO_SQUADS);
          setLinhas([]);
          setColunas([]);
          setAtivos(new Set(DADOS_EXEMPLO_SQUADS.map((s) => s.nome)));
          setStatus({ loading: false, error: "API indisponível. Exibindo dados de exemplo.", updatedAt: null, rowCount: 0 });
        }
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  const dadosFiltrados = useMemo(() => dados.slice(-periodo), [dados, periodo]);
  const squadsAtivos   = squads.filter((s) => ativos.has(s.nome));
  const linhasFiltradas = useMemo(() => {
    const needle = criadorFiltro.trim().toLowerCase();
    if (!needle) return linhas;
    return linhas.filter((linha) => String(linha.criador || "").toLowerCase().includes(needle));
  }, [linhas, criadorFiltro]);

  const toggle = (nome) => {
    setAtivos((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) { if (next.size > 1) next.delete(nome); }
      else next.add(nome);
      return next;
    });
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#f8fafc", minHeight: "100vh", padding: "32px 40px" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
            Dashboard GMV · Squads Pro
          </h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            {squads.length} squads ativos · {status.loading ? "carregando dados" : status.error ? status.error : `${status.rowCount} linhas processadas`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[3, 6].map((n) => (
            <button key={n} onClick={() => setPeriodo(n)} style={{
              padding: "6px 16px", borderRadius: 8, border: "1px solid",
              borderColor: periodo === n ? "#6366f1" : "#e5e7eb",
              background: periodo === n ? "#6366f1" : "#fff",
              color: periodo === n ? "#fff" : "#374151",
              fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>
              {n}m
            </button>
          ))}
        </div>
      </div>

      {!status.loading && !status.error && status.rowCount === 0 && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 12, padding: "14px 18px", marginBottom: 24, fontSize: 14, fontWeight: 600 }}>
          Nenhuma linha real foi processada ainda. Verifique se a pasta do Google Drive está compartilhada com a credencial usada no n8n.
        </div>
      )}

      {/* KPI CARDS */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
        gap: 14, marginBottom: 28,
      }}>
        <KpiCard label="GMV Total" value={fmt(totalGMV(dadosFiltrados, squadsAtivos))} cor="#6366f1" />
        {squadsAtivos.map((sq) => (
          <KpiCard
            key={sq.nome}
            label={sq.nome.replace("Squad Pro ", "")}
            value={fmt(dadosFiltrados[dadosFiltrados.length - 1]?.[sq.nome] || 0)}
            sub={calcTaxa(dadosFiltrados, sq.nome)}
            cor={sq.cor}
          />
        ))}
      </div>

      {/* FILTRO */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {squads.map((sq) => {
          const ativo = ativos.has(sq.nome);
          return (
            <button key={sq.nome} onClick={() => toggle(sq.nome)} style={{
              padding: "5px 14px", borderRadius: 20,
              border: `2px solid ${sq.cor}`,
              background: ativo ? sq.cor : "transparent",
              color: ativo ? "#fff" : sq.cor,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
              transition: "all 0.15s",
            }}>
              {sq.nome.replace("Squad Pro ", "")}
            </button>
          );
        })}
      </div>

      {/* FILTRO CRIADOR */}
      <div style={{ marginBottom: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={criadorFiltro}
          onChange={(event) => setCriadorFiltro(event.target.value)}
          placeholder="Filtrar por @ do criador"
          style={{
            width: 280,
            maxWidth: "100%",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 14,
            outline: "none",
            background: "#fff",
          }}
        />
        <span style={{ color: "#6b7280", fontSize: 13, fontWeight: 600 }}>
          {linhasFiltradas.length} linhas visíveis
        </span>
      </div>

      {/* GRÁFICO */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb",
        borderRadius: 16, padding: "24px 20px 12px", marginBottom: 28,
      }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#374151" }}>
          Evolução do GMV por squad
        </h2>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={dadosFiltrados} margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 13, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={72} />
            <Tooltip content={<TooltipCustom />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 16 }} />
            {squadsAtivos.map((sq) => (
              <Line
                key={sq.nome}
                type="monotone"
                dataKey={sq.nome}
                stroke={sq.cor}
                strokeWidth={2.5}
                dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* DADOS DETALHADOS */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ padding: "18px 24px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#374151" }}>
            Dados detalhados do Excel
          </h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {colunas.map((coluna) => (
                  <th key={coluna} style={{ padding: "10px 14px", textAlign: "left", color: "#6b7280", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhasFiltradas.slice(0, 300).map((linha, index) => (
                <tr key={`${linha.arquivo_origem || "linha"}-${index}`} style={{ borderTop: "1px solid #f3f4f6" }}>
                  {colunas.map((coluna) => (
                    <td key={coluna} style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {linha[coluna] == null || linha[coluna] === "" ? "—" : String(linha[coluna])}
                    </td>
                  ))}
                </tr>
              ))}
              {!linhasFiltradas.length && (
                <tr>
                  <td colSpan={Math.max(colunas.length, 1)} style={{ padding: "18px 24px", color: "#9ca3af", textAlign: "center" }}>
                    Nenhum dado detalhado disponível.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {linhasFiltradas.length > 300 && (
          <div style={{ padding: "10px 24px", color: "#6b7280", fontSize: 12, borderTop: "1px solid #f3f4f6" }}>
            Exibindo as primeiras 300 linhas para manter o dashboard rápido.
          </div>
        )}
      </div>

      {/* TABELA */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "18px 24px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#374151" }}>
            Taxa de crescimento no período
          </h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ padding: "10px 24px", textAlign: "left",  color: "#6b7280", fontWeight: 600 }}>Squad</th>
              <th style={{ padding: "10px 24px", textAlign: "right", color: "#6b7280", fontWeight: 600 }}>GMV inicial</th>
              <th style={{ padding: "10px 24px", textAlign: "right", color: "#6b7280", fontWeight: 600 }}>GMV atual</th>
              <th style={{ padding: "10px 24px", textAlign: "right", color: "#6b7280", fontWeight: 600 }}>Variação</th>
            </tr>
          </thead>
          <tbody>
            {squads.map((sq, i) => {
              const taxa     = calcTaxa(dadosFiltrados, sq.nome);
              const positivo = taxa !== null && parseFloat(taxa) >= 0;
              const inicial  = dadosFiltrados.find((d) => d[sq.nome] > 0)?.[sq.nome] || 0;
              const atual    = dadosFiltrados[dadosFiltrados.length - 1]?.[sq.nome] || 0;
              return (
                <tr key={sq.nome} style={{ borderTop: i === 0 ? "none" : "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: sq.cor, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: "#111827" }}>{sq.nome}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 24px", textAlign: "right", color: "#6b7280" }}>{fmt(inicial)}</td>
                  <td style={{ padding: "12px 24px", textAlign: "right", color: "#111827", fontWeight: 600 }}>{fmt(atual)}</td>
                  <td style={{ padding: "12px 24px", textAlign: "right", fontWeight: 700,
                    color: taxa === null ? "#9ca3af" : positivo ? "#10b981" : "#f43f5e" }}>
                    {taxa === null ? "—" : `${positivo ? "▲" : "▼"} ${Math.abs(taxa)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 24, textAlign: "center", color: "#d1d5db", fontSize: 12 }}>
        {status.updatedAt ? `Atualizado em ${new Date(status.updatedAt).toLocaleString("pt-BR")}` : "Dashboard GMV"}
      </p>
    </div>
  );
}
