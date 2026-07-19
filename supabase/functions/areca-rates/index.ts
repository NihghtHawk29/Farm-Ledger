// Supabase Edge Function: areca-rates
// Scrapes daily arecanut market rates from MAMCOS (Malnad Areca Marketing
// Co-operative Society, Shivamogga) — https://mamcos.info/areca-market-rates/
// — server-side, so the browser gets clean JSON with no CORS issue.
//
// The page is a WordPress table: market names appear as section-header rows,
// followed by rows of  Date | Product | Min | Max | Average.
//
// Deploy:  supabase functions deploy areca-rates --project-ref <your-ref>

const SRC = "https://mamcos.info/areca-market-rates/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
const decode = (s: string) =>
  s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#8377;|₹/g, "")
    .replace(/\s+/g, " ").trim();
const num = (s: string): number | null => {
  const n = s.replace(/[^\d.]/g, "");
  return n ? Number(n) : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    let market = "";
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      market = (b?.market || "").trim();
    } else {
      market = (new URL(req.url).searchParams.get("market") || "").trim();
    }

    const res = await fetch(SRC, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`mamcos.info responded with HTTP ${res.status}`);
    const html = await res.text();

    const table = html.match(/<table[\s\S]*?<\/table>/i);
    if (!table) throw new Error("Could not find the rate table on mamcos.info");

    const trs = table[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const rows: any[] = [];
    let current = "";
    for (const tr of trs) {
      const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((m) => decode(stripTags(m[1])));
      const nonEmpty = cells.filter((c) => c !== "");
      if (nonEmpty.length === 0) continue;
      // A market section header is a single populated cell (often colspan).
      if (nonEmpty.length === 1) { current = nonEmpty[0]; continue; }
      // Otherwise a data row: Date | Product | Min | Max | Average.
      if (cells.length >= 5) {
        if (/^date$/i.test(cells[0])) continue; // column header
        rows.push({
          market: current,
          date: cells[0],
          product: cells[1],
          min: num(cells[2]),
          max: num(cells[3]),
          average: num(cells[4]),
        });
      }
    }

    const markets = [...new Set(rows.map((r) => r.market).filter(Boolean))];
    const filtered = market
      ? rows.filter((r) => r.market.toLowerCase() === market.toLowerCase())
      : rows;

    return new Response(
      JSON.stringify({ source: "mamcos.info", markets, rows: filtered }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message || e) }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
