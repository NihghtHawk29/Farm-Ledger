// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { Plus, Trash2, Sprout, Users, Wallet, TrendingUp, IndianRupee, X, Loader2, TreePine, Droplets, Bug, FlaskConical, BookOpen, AlertTriangle, LogOut, ChevronLeft, ChevronRight, Home, Pencil } from "lucide-react";
import { listAll, insertRow, updateRow, deleteRow } from "./lib/db";
import { supabase } from "./lib/supabase";



/* ---------- helpers ---------- */
const fmtINR = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
};
const fmtNum = (n, d = 2) => (n === null || n === undefined || isNaN(n) ? "0" : Number(n).toFixed(d));
/* Compact rupee axis labels: 250000 -> "2.5L", 12000 -> "12k". */
const shortMoney = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 100000) return `${Math.round(n / 1000) / 100}L`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
};
/* ISO (yyyy-mm-dd) -> dd/mm/yyyy for display; leaves other/blank values as-is. */
const fmtDate = (d) => {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};
const uid = () => Math.random().toString(36).slice(2, 10);

/* Falls back to localStorage when running outside claude.ai (window.storage won't exist there) */
const storageShim = {
  async get(key, shared = false) {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
      try { return await window.storage.get(key, shared); } catch (e) { /* fall through */ }
    }
    try {
      const raw = window.localStorage.getItem("farmledger:" + key);
      return raw === null ? null : { key, value: raw, shared };
    } catch (e) { return null; }
  },
  async set(key, value, shared = false) {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.set === "function") {
      try { return await window.storage.set(key, value, shared); } catch (e) { /* fall through */ }
    }
    try {
      window.localStorage.setItem("farmledger:" + key, value);
      return { key, value, shared };
    } catch (e) { return null; }
  },
};
const monthKey = (d) => (d ? d.slice(0, 7) : "unknown");
const monthLabel = (key) => {
  if (key === "unknown") return "Unknown";
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
};
/* Bucket key/label for a date at day / month / year granularity — used by the
   dashboard's Day/Month/Year toggle. */
const periodKey = (d, gran) => {
  if (!d) return "unknown";
  if (gran === "year") return d.slice(0, 4);
  if (gran === "day") return d.slice(0, 10);
  return d.slice(0, 7); // month
};
const periodLabel = (key, gran) => {
  if (key === "unknown") return "Unknown";
  if (gran === "year") return key;
  if (gran === "day") { const [y, m, dd] = key.split("-"); return `${dd}/${m}/${(y || "").slice(2)}`; }
  return monthLabel(key);
};

const PLOT_OPTIONS = [
  "Kodibeelu", "Kengalu Hola", "Mullappa Thota", "Old Thota (Hale Thota)",
  "Hankalu Hola", "Lakshmamma Hola", "Temple premises", "Near house", "General / Other",
];
const WORKTYPE_OPTIONS = [
  "Irrigation / watering", "Drip irrigation repair", "Manure application", "Soil / mud work",
  "Frond / leaf removal", "Coconut plucking", "Weed spray (Roundup)", "Tractor / rotary tilling",
  "Fence work", "Cleaning / compound work", "Painting", "Grass cutting", "Bund / border repair",
  "Plant nourishment work", "Cement / construction work", "Tank work", "General farm work",
];
const EXPENSE_CATEGORIES = [
  "Fertilizer", "Fuel", "Machinery hire", "Irrigation equipment", "Soil/mud transport",
  "Worker advance", "Labor wages settlement", "Other",
];
const HOME_EXPENSE_CATEGORIES = [
  "Groceries / provisions", "Utilities (power/water)", "Mobile / internet", "Education / school",
  "Medical / health", "Household goods", "Rent / EMI", "Travel / transport",
  "Festivals / functions", "Other",
];
const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Unpaid", "Interest adjusted", "Other"];

const COLORS = ["#35502A", "#A6501C", "#C68A1D", "#6E7F5C", "#8C5A2B", "#4A6741", "#B8895A", "#7A6A3D"];


const TREE_LOSS_CAUSES = [
  "Fruit rot / Koleroga (Phytophthora)", "Yellow Leaf Disease", "Bud rot", "Foot rot (Anabe roga)",
  "Stem bleeding", "Root grub", "Wind / storm damage", "Waterlogging", "Old age", "Fire", "Theft", "Unknown", "Other",
];
const WATERING_METHODS = ["Drip irrigation", "Flood / basin irrigation", "Sprinkler", "Manual / bucket"];
const PEST_DISEASE_OPTIONS = [
  "Fruit rot / Koleroga (Phytophthora meadii)", "Yellow Leaf Disease (phytoplasma)", "Bud rot (Phytophthora arecae)",
  "Foot rot / Anabe roga (Fusarium / Ganoderma)", "Stem bleeding (Thielaviopsis)", "Root grub",
  "Rhinoceros beetle", "Red palm weevil", "Spindle bug", "Leaf spot", "Other / unidentified",
];
const SEVERITY_OPTIONS = ["Low", "Medium", "High"];
const SAMPLE_TYPES = ["Soil", "Water"];

/* Agronomy reference — general practices; always defer to CPCRI Vittal / local KVK for exact chemical dosage */
const ADVISOR_NOTES = {
  "Fruit rot / Koleroga (Phytophthora meadii)": {
    also: ["Fruit rot / Koleroga (Phytophthora)"],
    symptoms: "Immature nuts develop water-soaked patches and drop early, usually during heavy Southwest monsoon spells (June-Sept).",
    action: "Improve canopy drainage, remove and destroy fallen/infected nuts so spores don't build up, and prune to reduce humidity. Prophylactic Bordeaux mixture spray before monsoon onset is the standard practice — get exact concentration and repeat schedule from your local KVK or CPCRI Vittal, since it varies by rainfall intensity.",
  },
  "Yellow Leaf Disease (phytoplasma)": {
    also: ["Yellow Leaf Disease"],
    symptoms: "Gradual yellowing and drooping of leaves, stunted nut size, thinning canopy over several years. It's a chronic, spreading disease, not a sudden one.",
    action: "No cure once infected — focus on slowing spread: balanced nutrition (especially micronutrients), good drainage, and removing severely declining palms so they don't become inoculum sources. This is endemic in parts of Malnad Karnataka; ask CPCRI Vittal about disease-tolerant intercropping/replanting options if incidence is high.",
  },
  "Bud rot": { symptoms: "Spear leaf yellows and can be pulled out easily; rot at the crown.", action: "Remove and destroy affected bud tissue immediately, apply Bordeaux paste to the wound, and improve drainage. Isolate — this spreads fast in wet weather." },
  "Foot rot (Anabe roga)": { symptoms: "Yellowing from lower leaves upward, palm looks water-stressed even when watered, root rot at the base.", action: "Improve drainage around the base, avoid waterlogging, and consult KVK on soil drenching options — foot rot pathogens persist in soil so affected spots need ongoing monitoring." },
  "Stem bleeding": { symptoms: "Reddish-brown gummy exudate oozing from cracks in the trunk.", action: "Scrape off the affected bark, apply Bordeaux paste, and avoid mechanical injury to trunks during inter-cultivation." },
  "Root grub": { symptoms: "Palm looks generally weak/yellow without clear leaf-spot symptoms; grubs visible if soil is dug near roots.", action: "Light trap adults during monsoon flight period, apply well-rotted farmyard manure (avoid fresh, undecomposed manure which attracts egg-laying), and ask KVK about approved soil-applied biocontrol (e.g. Metarhizium) options." },
  "Rhinoceros beetle": { symptoms: "V-shaped cuts on young fronds, damage to the crown.", action: "Maintain field sanitation — remove rotting organic matter/manure heaps where grubs breed. Pheromone traps are commonly recommended; check current trap type with your local extension office." },
  "Red palm weevil": { symptoms: "Boring holes near crown with fibrous frass, foul smell, wilting of the crown.", action: "This can kill a palm fast — flag it as high priority. Avoid injuries to the trunk (entry points for the weevil) and consult CPCRI/KVK immediately for pheromone trapping and treatment of the affected palm." },
  "Spindle bug": { symptoms: "Damage to the unopened spindle leaf, malformed fronds on emergence.", action: "Monitor young palms particularly; ask your local extension office about current recommended control since this is a more recently emerging pest in some areas." },
  "Leaf spot": { symptoms: "Small brown-black spots with yellow halo, coalescing into larger blighted patches on leaves and sometimes nuts.", action: "Improve airflow/spacing, remove heavily infected leaves, and avoid overhead irrigation that keeps foliage wet." },
};
const GENERAL_ADVISOR_TIPS = [
  { icon: Droplets, title: "Irrigation", text: "Areca is shallow-rooted and doesn't tolerate drought stress or waterlogging. Drip is preferred over flood irrigation on slopes — it's what most of your recent entries already use." },
  { icon: FlaskConical, title: "Soil", text: "Laterite/red loam with good drainage and a slightly acidic pH (roughly 5.5–6.5) suits areca best. Log a soil test per plot at least once a year, ideally before the fertilizer season." },
  { icon: Sprout, title: "Nutrition", text: "Balanced NPK plus regular organic manure (well-rotted, not fresh) supports disease resistance — several diseases above get worse under nutrient stress." },
];

/* ---------- small UI atoms ---------- */
function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div style={{
      background: "var(--card)", borderRadius: 14, padding: "18px 20px",
      border: "1px solid var(--line)", position: "relative", overflow: "hidden",
      boxShadow: "0 1px 0 rgba(34,48,28,0.05)",
    }}>
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: 4, background: accent,
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12.5, letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600 }}>
        <Icon size={15} strokeWidth={2.2} />
        {label}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 600, color: "var(--ink)", marginTop: 6, letterSpacing: -0.5 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle = {
  border: "1px solid var(--line)", borderRadius: 8, padding: "7px 9px", fontSize: 13.5,
  fontFamily: "'Inter', sans-serif", background: "#fff", color: "var(--ink)", outline: "none",
};

/* Top-right profile avatar with a sign-out dropdown. */
function ProfileMenu({ session, onSignOut }) {
  const [open, setOpen] = useState(false);
  const email = session?.user?.email || "";
  const initials = (email.slice(0, 2) || "?").toUpperCase();
  const avatar = (size) => ({
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    background: "var(--leaf)", color: "#F4F0DE", fontWeight: 700,
    fontSize: size * 0.4, display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Inter', sans-serif", letterSpacing: 0.3,
  });
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title={email} style={{
        ...avatar(38), border: "1px solid rgba(0,0,0,0.08)", cursor: "pointer", padding: 0,
      }}>{initials}</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div style={{
            position: "absolute", right: 0, top: 46, zIndex: 21, background: "var(--card)",
            border: "1px solid var(--line)", borderRadius: 12, padding: 12, minWidth: 230,
            boxShadow: "0 10px 34px rgba(34,48,28,0.18)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={avatar(40)}>{initials}</div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600 }}>Signed in as</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", wordBreak: "break-all" }}>{email}</div>
              </div>
            </div>
            <button onClick={onSignOut} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              border: "1px solid var(--line)", background: "transparent", color: "var(--rust)",
              borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer",
      fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 14.5,
      background: active ? "var(--leaf)" : "transparent",
      color: active ? "#F4F0DE" : "var(--muted)",
      transition: "all 0.15s",
    }}>
      {children}
    </button>
  );
}

function DeleteBtn({ onClick }) {
  return (
    <button onClick={onClick} title="Delete entry" style={{
      border: "none", background: "transparent", cursor: "pointer", color: "var(--rust)",
      opacity: 0.55, padding: 4, display: "flex",
    }} onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
      onMouseLeave={(e) => e.currentTarget.style.opacity = 0.55}>
      <Trash2 size={14} />
    </button>
  );
}

function EditBtn({ onClick }) {
  return (
    <button onClick={onClick} title="Edit entry" style={{
      border: "none", background: "transparent", cursor: "pointer", color: "var(--leaf)",
      opacity: 0.55, padding: 4, display: "flex",
    }} onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
      onMouseLeave={(e) => e.currentTarget.style.opacity = 0.55}>
      <Pencil size={14} />
    </button>
  );
}

/* Row-actions cell: edit + delete side by side. */
function RowActions({ onEdit, onDelete }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {onEdit && <EditBtn onClick={onEdit} />}
      {onDelete && <DeleteBtn onClick={onDelete} />}
    </div>
  );
}

/* Distinct month keys present in a list of dated entries, oldest → newest,
   with undated ("unknown") pushed to the very end. */
function orderedMonths(entries) {
  const keys = [...new Set(entries.map((e) => monthKey(e.date)))];
  return keys.sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return a.localeCompare(b);
  });
}

/* Small hook: keeps a selected month valid as data loads/changes,
   defaulting to the most recent month with entries. */
function useMonthPager(entries) {
  const months = useMemo(() => orderedMonths(entries), [entries]);
  const [month, setMonth] = useState(null);
  useEffect(() => {
    if (months.length && (month === null || !months.includes(month))) {
      setMonth(months[months.length - 1]); // newest
    } else if (!months.length && month !== null) {
      setMonth(null);
    }
  }, [months]); // eslint-disable-line
  return { months, month, setMonth };
}

/* ◀ Month Year ▶ navigator. Arrows step one month at a time through the
   months that actually have entries. */
function MonthPager({ months, month, setMonth }) {
  const idx = months.indexOf(month);
  const go = (delta) => {
    const ni = idx + delta;
    if (ni >= 0 && ni < months.length) setMonth(months[ni]);
  };
  const atOldest = idx <= 0;
  const atNewest = idx >= months.length - 1;
  const arrowBtn = (disabled) => ({
    display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    border: "1px solid var(--line)", borderRadius: 8, background: disabled ? "transparent" : "#fff",
    color: disabled ? "#c3b896" : "var(--ink)", cursor: disabled ? "default" : "pointer", padding: 0,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => go(-1)} disabled={atOldest} title="Previous month" style={arrowBtn(atOldest)}>
        <ChevronLeft size={17} />
      </button>
      <span style={{
        minWidth: 96, textAlign: "center", fontFamily: "'Fraunces', serif", fontWeight: 600,
        fontSize: 14.5, color: "var(--ink)",
      }}>
        {month == null ? "—" : month === "unknown" ? "Undated" : monthLabel(month)}
      </span>
      <button onClick={() => go(1)} disabled={atNewest} title="Next month" style={arrowBtn(atNewest)}>
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

/* Year pager for the harvest table. Includes the current calendar year even
   when it has no lots yet, and defaults to the most recent year — so a new
   season starts on its own clean page with last year one click back. */
function useYearPager(entries) {
  const years = useMemo(() => {
    const set = new Set(entries.map((e) => (e.date ? e.date.slice(0, 4) : "unknown")));
    set.add(String(new Date().getFullYear()));
    return [...set].sort((a, b) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return a.localeCompare(b);
    });
  }, [entries]);
  const [year, setYear] = useState(null);
  useEffect(() => {
    if (years.length && (year === null || !years.includes(year))) setYear(years[years.length - 1]);
  }, [years]); // eslint-disable-line
  return { years, year, setYear };
}

function YearPager({ years, year, setYear }) {
  const idx = years.indexOf(year);
  const go = (delta) => { const ni = idx + delta; if (ni >= 0 && ni < years.length) setYear(years[ni]); };
  const atOldest = idx <= 0;
  const atNewest = idx >= years.length - 1;
  const arrowBtn = (disabled) => ({
    display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    border: "1px solid var(--line)", borderRadius: 8, background: disabled ? "transparent" : "#fff",
    color: disabled ? "#c3b896" : "var(--ink)", cursor: disabled ? "default" : "pointer", padding: 0,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => go(-1)} disabled={atOldest} title="Previous year" style={arrowBtn(atOldest)}>
        <ChevronLeft size={17} />
      </button>
      <span style={{ minWidth: 92, textAlign: "center", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16, color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {year === "unknown" ? "Undated" : year || "—"}
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>season</span>
      </span>
      <button onClick={() => go(1)} disabled={atNewest} title="Next year" style={arrowBtn(atNewest)}>
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

/* ---------- App ---------- */
export default function FarmLedger({ session, onSignOut }) {
  const [tab, setTab] = useState("dashboard");
  const [wages, setWages] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [harvest, setHarvest] = useState([]);
  const [payments, setPayments] = useState([]);
  const [treeLoss, setTreeLoss] = useState([]);
  const [watering, setWatering] = useState([]);
  const [pests, setPests] = useState([]);
  const [soilTests, setSoilTests] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const reload = async () => {
    const [w, x, h, p, tl, wa, pe, so] = await Promise.all([
      listAll("wages"), listAll("expenses"), listAll("harvest"), listAll("payments"),
      listAll("treeLoss"), listAll("watering"), listAll("pests"), listAll("soilTests"),
    ]);
    setWages(w); setExpenses(x); setHarvest(h); setPayments(p);
    setTreeLoss(tl); setWatering(wa); setPests(pe); setSoilTests(so);
  };

  useEffect(() => {
    (async () => {
      try { await reload(); setLoadError(null); }
      catch (e) { console.error("load failed", e); setLoadError(e?.message || "Could not load your data from Supabase."); }
      finally { setReady(true); }
    })();
  }, []);

  const addRow = async (entity, obj, setter, list) => {
    try { const row = await insertRow(entity, obj); if (row) setter([row, ...list]); }
    catch (e) { console.error("save failed", e); alert("Couldn't save entry: " + (e?.message || e)); }
  };
  const removeRow = async (entity, id, setter, list) => {
    try { await deleteRow(entity, id); setter(list.filter((r) => r.id !== id)); }
    catch (e) { console.error("delete failed", e); alert("Couldn't delete entry: " + (e?.message || e)); }
  };
  const editRow = async (entity, id, obj, setter, list) => {
    try { const row = await updateRow(entity, id, obj); if (row) setter(list.map((r) => (r.id === id ? row : r))); }
    catch (e) { console.error("update failed", e); alert("Couldn't update entry: " + (e?.message || e)); }
  };

  const addWage = (w) => addRow("wages", w, setWages, wages);
  const updWage = (id, w) => editRow("wages", id, w, setWages, wages);
  const delWage = (id) => removeRow("wages", id, setWages, wages);
  const addExpense = (x) => addRow("expenses", x, setExpenses, expenses);
  const updExpense = (id, x) => editRow("expenses", id, x, setExpenses, expenses);
  const delExpense = (id) => removeRow("expenses", id, setExpenses, expenses);
  const addHarvest = (h) => addRow("harvest", h, setHarvest, harvest);
  const updHarvest = (id, h) => editRow("harvest", id, h, setHarvest, harvest);
  const delHarvest = (id) => removeRow("harvest", id, setHarvest, harvest);
  const addPayment = (p) => addRow("payments", p, setPayments, payments);
  const updPayment = (id, p) => editRow("payments", id, p, setPayments, payments);
  const delPayment = (id) => removeRow("payments", id, setPayments, payments);
  const addTreeLoss = (t) => addRow("treeLoss", t, setTreeLoss, treeLoss);
  const updTreeLoss = (id, t) => editRow("treeLoss", id, t, setTreeLoss, treeLoss);
  const delTreeLoss = (id) => removeRow("treeLoss", id, setTreeLoss, treeLoss);
  const addWatering = (w) => addRow("watering", w, setWatering, watering);
  const updWatering = (id, w) => editRow("watering", id, w, setWatering, watering);
  const delWatering = (id) => removeRow("watering", id, setWatering, watering);
  const addPest = (p) => addRow("pests", p, setPests, pests);
  const updPest = (id, p) => editRow("pests", id, p, setPests, pests);
  const delPest = (id) => removeRow("pests", id, setPests, pests);
  const addSoilTest = (s) => addRow("soilTests", s, setSoilTests, soilTests);
  const updSoilTest = (id, s) => editRow("soilTests", id, s, setSoilTests, soilTests);
  const delSoilTest = (id) => removeRow("soilTests", id, setSoilTests, soilTests);

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100svh", color: "#5C5240", fontFamily: "'Inter', sans-serif", background: "#E7E0C7" }}>
        <Loader2 size={18} className="spin" style={{ marginRight: 8 }} /> Loading your ledger…
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="farm-root" style={{
      "--ink": "#22301C", "--paper": "#E7E0C7", "--card": "#F2EEDC", "--rust": "#A6501C",
      "--gold": "#C68A1D", "--leaf": "#35502A", "--muted": "#5C5240", "--line": "#CBBF9B",
      background: "var(--paper)", minHeight: "100svh", fontFamily: "'Inter', sans-serif",
      padding: "22px 22px 40px", color: "var(--ink)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        table.ledger { border-collapse: collapse; width: 100%; font-size: 13px; }
        table.ledger th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;
          color: var(--muted); padding: 8px 10px; border-bottom: 2px solid var(--line); white-space: nowrap; }
        table.ledger td { padding: 7px 10px; border-bottom: 1px dashed var(--line); vertical-align: top; }
        table.ledger tr:hover td { background: rgba(53,80,42,0.05); }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        ::placeholder { color: #a89f83; }
        .tab-nav { max-width: 100%; overflow-x: auto; scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
        .tab-nav button { flex: 0 0 auto; white-space: nowrap; }
        @media (max-width: 820px) {
          .farm-root { padding: 14px 12px 32px !important; }
          .charts-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .farm-header { flex-direction: column; align-items: stretch !important; }
          .tab-nav { width: 100%; }
          .tab-nav button { padding: 8px 13px !important; font-size: 13.5px !important; }
        }
      `}</style>

      <header className="farm-header" style={{ display: "flex", flexDirection: "column", marginBottom: 18, gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 24, display: "flex", alignItems: "center", gap: 8 }}>
              <Sprout size={22} color="var(--leaf)" /> Thota Patti <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 15 }}>· Farm Ledger</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Daily wages, areca nut (adike) harvest & farm expenses — all in one book.</div>
          </div>
          {session && <ProfileMenu session={session} onSignOut={onSignOut} />}
        </div>
        <nav className="tab-nav" style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.4)", padding: 4, borderRadius: 12, border: "1px solid var(--line)", alignSelf: "flex-start", maxWidth: "100%" }}>
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>Dashboard</TabButton>
          <TabButton active={tab === "wages"} onClick={() => setTab("wages")}>Labor Wages</TabButton>
          <TabButton active={tab === "harvest"} onClick={() => setTab("harvest")}>Areca Harvest</TabButton>
          <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")}>Expenses</TabButton>
          <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>Payments Received</TabButton>
          <TabButton active={tab === "trees"} onClick={() => setTab("trees")}>Trees & Watering</TabButton>
          <TabButton active={tab === "health"} onClick={() => setTab("health")}>Crop Health</TabButton>
          <TabButton active={tab === "advisor"} onClick={() => setTab("advisor")}>Advisor</TabButton>
        </nav>
      </header>

      {loadError && (
        <div style={{ background: "#F6E4D9", border: "1px solid var(--rust)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#5C2A10", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <AlertTriangle size={16} /> {loadError}
          </div>
          <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
            {/jwt|issued at future|token|expired|clock/i.test(loadError) ? (
              <>
                This is a <b>clock mismatch</b>, not a data problem — your device's time is behind the
                server, so your saved sign-in token looks like it's from the future. Turn on automatic
                time sync (Windows: Settings → Time &amp; language → Date &amp; time → "Set time
                automatically" → "Sync now"), then sign out and back in to refresh the token.
              </>
            ) : (
              <>Check that you've run the schema SQL and that your Supabase credentials are correct.</>
            )}
          </div>
          {onSignOut && (
            <button onClick={onSignOut} style={{
              marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "var(--rust)",
              color: "#F4F0DE", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12.5,
              fontWeight: 600, cursor: "pointer",
            }}>
              <LogOut size={13} /> Sign out &amp; retry
            </button>
          )}
        </div>
      )}

      {tab === "dashboard" && <Dashboard wages={wages} expenses={expenses} harvest={harvest} payments={payments} treeLoss={treeLoss} watering={watering} pests={pests} soilTests={soilTests} />}
      {tab === "wages" && <WagesTab wages={wages} onAdd={addWage} onUpdate={updWage} onDelete={delWage} />}
      {tab === "harvest" && <HarvestTab harvest={harvest} onAdd={addHarvest} onUpdate={updHarvest} onDelete={delHarvest} />}
      {tab === "expenses" && <ExpensesTab expenses={expenses} onAdd={addExpense} onUpdate={updExpense} onDelete={delExpense} />}
      {tab === "payments" && <PaymentsTab payments={payments} onAdd={addPayment} onUpdate={updPayment} onDelete={delPayment} />}
      {tab === "trees" && <TreesWateringTab treeLoss={treeLoss} watering={watering} wages={wages} onAddLoss={addTreeLoss} onUpdateLoss={updTreeLoss} onDeleteLoss={delTreeLoss} onAddWatering={addWatering} onUpdateWatering={updWatering} onDeleteWatering={delWatering} />}
      {tab === "health" && <CropHealthTab pests={pests} soilTests={soilTests} onAddPest={addPest} onUpdatePest={updPest} onDeletePest={delPest} onAddSoilTest={addSoilTest} onUpdateSoilTest={updSoilTest} onDeleteSoilTest={delSoilTest} />}
      {tab === "advisor" && <AdvisorTab pests={pests} treeLoss={treeLoss} />}
    </div>
  );
}

/* Single-metric trend bar chart over the selected day/month/year period. */
function TrendBar({ title, data, dataKey, color }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 10.5, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={52} tickFormatter={shortMoney} />
          <Tooltip formatter={(v) => fmtINR(v)} contentStyle={tooltipStyle} />
          <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* Day / Month / Year segmented control for the dashboard trend charts. */
function GranToggle({ gran, setGran }) {
  const opts = [["day", "Daily"], ["month", "Monthly"], ["year", "Yearly"]];
  return (
    <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.5)", border: "1px solid var(--line)", borderRadius: 10, padding: 3, gap: 2 }}>
      {opts.map(([v, label]) => (
        <button key={v} onClick={() => setGran(v)} style={{
          padding: "6px 13px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          background: gran === v ? "var(--leaf)" : "transparent", color: gran === v ? "#F4F0DE" : "var(--muted)",
        }}>{label}</button>
      ))}
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ wages, expenses, harvest, payments, treeLoss, watering, pests, soilTests }) {
  const [gran, setGran] = useState("month");
  const granWord = gran === "day" ? "day" : gran === "year" ? "year" : "month";
  const totalWageSpend = useMemo(() => wages.reduce((s, w) => s + (Number(w.amount) || 0), 0), [wages]);
  // Farm P&L uses only farm expenses; home expenses are tracked separately.
  const farmExpenses = useMemo(() => expenses.filter((x) => x.sheet !== "Home"), [expenses]);
  const homeExpenses = useMemo(() => expenses.filter((x) => x.sheet === "Home"), [expenses]);
  const totalOtherExpense = useMemo(() => farmExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0), [farmExpenses]);
  const totalHomeExpense = useMemo(() => homeExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0), [homeExpenses]);
  const totalHarvestIncome = useMemo(() => harvest.reduce((s, h) => s + (Number(h.amount) || 0), 0), [harvest]);
  const totalReceived = useMemo(() => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments]);
  const totalYieldQ = useMemo(() => harvest.reduce((s, h) => s + (Number(h.netWetQuintals) || 0), 0), [harvest]);
  const outstanding = totalHarvestIncome - totalReceived;
  const netProfit = totalHarvestIncome - totalWageSpend - totalOtherExpense;
  const unpaidWages = useMemo(() => wages.filter((w) => w.status === "Unpaid").reduce((s, w) => s + (Number(w.amount) || 0), 0), [wages]);
  const totalTreesLost = useMemo(() => treeLoss.reduce((s, t) => s + (Number(t.treesLost) || 0), 0), [treeLoss]);
  const highSeverityPests = useMemo(() => pests.filter((p) => p.severity === "High").length, [pests]);
  const lastSoilTest = useMemo(() => {
    const sorted = [...soilTests].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return sorted[0]?.date || null;
  }, [soilTests]);

  const wateringByPlotMonth = useMemo(() => {
    const irrigationWages = wages.filter((w) => (w.workType || "").toLowerCase().includes("irrigation") || (w.workType || "").toLowerCase().includes("drip"));
    const combined = [...irrigationWages.map((w) => ({ date: w.date, plot: w.plot })), ...watering.map((w) => ({ date: w.date, plot: w.plot }))];
    const m = {};
    combined.forEach((e) => {
      const k = periodKey(e.date, gran);
      if (!m[k]) m[k] = {};
      m[k][e.plot] = (m[k][e.plot] || 0) + 1;
    });
    const plots = [...new Set(combined.map((e) => e.plot))].filter(Boolean);
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
      const row = { period: periodLabel(k, gran) };
      plots.forEach((p) => { row[p] = v[p] || 0; });
      return row;
    });
  }, [wages, watering, gran]);
  const wateringPlots = useMemo(() => {
    const irrigationWages = wages.filter((w) => (w.workType || "").toLowerCase().includes("irrigation") || (w.workType || "").toLowerCase().includes("drip"));
    return [...new Set([...irrigationWages.map((w) => w.plot), ...watering.map((w) => w.plot)])].filter(Boolean);
  }, [wages, watering]);

  const wagesByPlot = useMemo(() => {
    const m = {};
    wages.forEach((w) => { const k = w.plot || "General / Other"; m[k] = (m[k] || 0) + (Number(w.amount) || 0); });
    return Object.entries(m).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [wages]);

  const moneyByPeriod = useMemo(() => {
    const m = {};
    const bump = (date, field, amt) => {
      const k = periodKey(date, gran);
      if (!m[k]) m[k] = { income: 0, wages: 0, expenses: 0 };
      m[k][field] += amt;
    };
    harvest.forEach((h) => bump(h.date, "income", Number(h.amount) || 0));
    wages.forEach((w) => bump(w.date, "wages", Number(w.amount) || 0));
    farmExpenses.forEach((x) => bump(x.date, "expenses", Number(x.amount) || 0));
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      period: periodLabel(k, gran), Income: Math.round(v.income), Wages: Math.round(v.wages), Expenses: Math.round(v.expenses),
    }));
  }, [harvest, wages, farmExpenses, gran]);

  // Harvest income aggregated by year (always yearly, for the year-over-year line).
  const incomeByYear = useMemo(() => {
    const m = {};
    harvest.forEach((h) => { const k = periodKey(h.date, "year"); m[k] = (m[k] || 0) + (Number(h.amount) || 0); });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ year: k === "unknown" ? "Unknown" : k, income: Math.round(v) }));
  }, [harvest]);

  const harvestByRound = useMemo(() => {
    const m = {};
    harvest.forEach((h) => {
      const k = `Bidu ${h.round}`;
      if (!m[k]) m[k] = { round: k, amount: 0, quintals: 0 };
      m[k].amount += Number(h.amount) || 0;
      m[k].quintals += Number(h.netWetQuintals) || 0;
    });
    return Object.values(m).sort((a, b) => a.round.localeCompare(b.round)).map((r) => ({ ...r, amount: Math.round(r.amount), quintals: Math.round(r.quintals * 100) / 100 }));
  }, [harvest]);

  const expenseByCategory = useMemo(() => {
    const m = {};
    farmExpenses.forEach((x) => { const k = x.category || "Other"; m[k] = (m[k] || 0) + (Number(x.amount) || 0); });
    return Object.entries(m).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [farmExpenses]);

  const cashflowTimeline = useMemo(() => {
    const events = [
      ...harvest.map((h) => ({ date: h.date, income: Number(h.amount) || 0, received: 0 })),
      ...payments.map((p) => ({ date: p.date, income: 0, received: Number(p.amount) || 0 })),
    ].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let cumIncome = 0, cumReceived = 0;
    return events.map((e) => {
      cumIncome += e.income; cumReceived += e.received;
      return { date: e.date, "Amount due (cumulative)": Math.round(cumIncome), "Amount received (cumulative)": Math.round(cumReceived) };
    });
  }, [harvest, payments]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17 }}>Farm overview</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Group trends by</span>
          <GranToggle gran={gran} setGran={setGran} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <StatCard icon={Sprout} label="Areca yield (to date)" value={`${fmtNum(totalYieldQ, 1)} qtl`} sub={`${harvest.length} lots across 4 bidu rounds`} accent="var(--leaf)" />
        <StatCard icon={IndianRupee} label="Harvest income" value={fmtINR(totalHarvestIncome)} sub={`${fmtINR(totalReceived)} received so far`} accent="var(--gold)" />
        <StatCard icon={Wallet} label="Outstanding from buyer" value={fmtINR(outstanding)} sub="Amount due minus received" accent="var(--rust)" />
        <StatCard icon={Users} label="Labor wage spend" value={fmtINR(totalWageSpend)} sub={unpaidWages > 0 ? `${fmtINR(unpaidWages)} still unpaid` : "All settled"} accent="var(--leaf)" />
        <StatCard icon={TrendingUp} label="Net (income − expenses)" value={fmtINR(netProfit)} sub={`Other farm expenses: ${fmtINR(totalOtherExpense)}`} accent={netProfit >= 0 ? "var(--leaf)" : "var(--rust)"} />
        <StatCard icon={Home} label="Home expenses" value={fmtINR(totalHomeExpense)} sub={homeExpenses.length ? `${homeExpenses.length} entries (kept out of farm P&L)` : "No home expenses logged"} accent="var(--gold)" />
        <StatCard icon={TreePine} label="Trees lost" value={String(totalTreesLost)} sub={treeLoss.length ? `${treeLoss.length} incidents logged` : "No losses logged yet"} accent="var(--rust)" />
        <StatCard icon={Bug} label="High-severity pest alerts" value={String(highSeverityPests)} sub={pests.length ? `${pests.length} issues logged total` : "No issues logged yet"} accent={highSeverityPests > 0 ? "var(--rust)" : "var(--leaf)"} />
        <StatCard icon={FlaskConical} label="Last soil/water test" value={fmtDate(lastSoilTest)} sub={soilTests.length ? `${soilTests.length} tests on record` : "Log your first test"} accent="var(--gold)" />
      </div>
      {(highSeverityPests > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F6E4D9", border: "1px solid var(--rust)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#5C2A10" }}>
          <AlertTriangle size={16} /> You have {highSeverityPests} high-severity pest/disease issue{highSeverityPests > 1 ? "s" : ""} logged — check the Advisor tab for what to do next.
        </div>
      )}

      <div className="charts-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <TrendBar title={`Harvest income per ${granWord}`} data={moneyByPeriod} dataKey="Income" color="var(--gold)" />
          <TrendBar title={`Labor wages per ${granWord}`} data={moneyByPeriod} dataKey="Wages" color="var(--leaf)" />
          <TrendBar title={`Farm expenses per ${granWord}`} data={moneyByPeriod} dataKey="Expenses" color="var(--rust)" />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <ChartCard title="Harvest income trend — year over year">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={incomeByYear} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={52} tickFormatter={shortMoney} />
                <Tooltip formatter={(v) => fmtINR(v)} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="income" name="Harvest income" stroke="var(--gold)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--gold)" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Wage spend by plot">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={wagesByPlot} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                {wagesByPlot.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtINR(v)} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <Legend2 items={wagesByPlot} />
        </ChartCard>

        <ChartCard title="Areca harvest — income & yield per bidu round">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={harvestByRound}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="round" tick={{ fontSize: 11.5, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={55} />
              <Tooltip formatter={(v, n) => n === "amount" ? fmtINR(v) : `${v} qtl`} contentStyle={tooltipStyle} />
              <Bar dataKey="amount" fill="var(--gold)" radius={[4, 4, 0, 0]} name="Income (₹)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Farm expenses by category">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={expenseByCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                {expenseByCategory.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtINR(v)} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <Legend2 items={expenseByCategory} />
        </ChartCard>

        <div style={{ gridColumn: "1 / -1" }}>
          <ChartCard title={`Watering frequency by plot — per ${granWord} (from wage log + watering entries)`}>
            {wateringByPlotMonth.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)", padding: "20px 0" }}>No irrigation entries yet — these fill in automatically from wage entries tagged "Irrigation" or "Drip", or from manual entries in Trees & Watering.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={wateringByPlotMonth}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 10.5, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11.5 }} />
                  {wateringPlots.map((p, i) => <Bar key={p} dataKey={p} stackId="w" fill={COLORS[i % COLORS.length]} />)}
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <ChartCard title="Areca ledger: cumulative amount due vs. received">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cashflowTimeline}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10.5, fill: "var(--muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => `${Math.round(v / 100000)}L`} />
                <Tooltip formatter={(v) => fmtINR(v)} labelFormatter={fmtDate} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Amount due (cumulative)" stroke="var(--rust)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="Amount received (cumulative)" stroke="var(--leaf)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

const tooltipStyle = { background: "#F2EEDC", border: "1px solid #CBBF9B", borderRadius: 8, fontSize: 12.5, fontFamily: "Inter, sans-serif" };

function ChartCard({ title, children }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 14.5, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Legend2({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6, fontSize: 11.5 }}>
      {items.map((it, i) => (
        <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], display: "inline-block" }} />
          {it.name}
        </div>
      ))}
    </div>
  );
}

/* ---------- Wages tab ---------- */
function WagesTab({ wages, onAdd, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filterPlot, setFilterPlot] = useState("All");
  const { months, month, setMonth } = useMonthPager(wages);
  const blank = { date: "", name: "", workers: 1, plot: PLOT_OPTIONS[0], workType: WORKTYPE_OPTIONS[0], wageRate: 600, amount: "", paymentMode: "Cash", status: "Paid", receivedBy: "" };
  const [form, setForm] = useState(blank);

  const total = form.workers && form.wageRate ? Number(form.workers) * Number(form.wageRate) : "";

  let rows = filterPlot === "All" ? wages : wages.filter((w) => w.plot === filterPlot);
  rows = rows.filter((w) => monthKey(w.date) === month);
  const sorted = [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const sumShown = sorted.reduce((s, w) => s + (Number(w.amount) || 0), 0);

  const openAdd = () => { setForm(blank); setEditingId(null); setOpen(true); };
  const closeForm = () => { setForm(blank); setEditingId(null); setOpen(false); };
  const startEdit = (w) => { setForm({ ...blank, ...w, amount: w.amount ?? "" }); setEditingId(w.id); setOpen(true); };

  const submit = () => {
    if (!form.date || !form.name) return;
    const payload = { ...form, amount: form.amount === "" ? total : Number(form.amount) };
    if (editingId) onUpdate(editingId, payload); else onAdd(payload);
    setMonth(monthKey(form.date));
    closeForm();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <MonthPager months={months} month={month} setMonth={setMonth} />
          <select value={filterPlot} onChange={(e) => setFilterPlot(e.target.value)} style={inputStyle}>
            <option>All</option>
            {PLOT_OPTIONS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{sorted.length} entries · total {fmtINR(sumShown)}</span>
        </div>
        <AddButton open={open} setOpen={(v) => (v ? openAdd() : closeForm())} label="Add wage entry" />
      </div>

      {open && (
        <FormCard onCancel={closeForm} onSave={submit} editing={!!editingId}>
          <Field label="Date"><input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Worker name(s)"><input style={inputStyle} placeholder="e.g. Shivu" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Number of laborers"><input type="number" min="1" style={inputStyle} value={form.workers} onChange={(e) => setForm({ ...form, workers: e.target.value })} /></Field>
          <Field label="Farm / plot">
            <select style={inputStyle} value={form.plot} onChange={(e) => setForm({ ...form, plot: e.target.value })}>{PLOT_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="Work type">
            <select style={inputStyle} value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })}>{WORKTYPE_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="Wage rate / person / day (₹)"><input type="number" style={inputStyle} value={form.wageRate} onChange={(e) => setForm({ ...form, wageRate: e.target.value })} /></Field>
          <Field label={`Total amount (₹) — auto: ${fmtINR(total)}`}><input type="number" style={inputStyle} placeholder={String(total)} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Payment status">
            <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Paid</option><option>Unpaid</option></select>
          </Field>
          <Field label="Payment mode">
            <select style={inputStyle} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>{PAYMENT_MODES.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="Received by (if different)"><input style={inputStyle} value={form.receivedBy} onChange={(e) => setForm({ ...form, receivedBy: e.target.value })} /></Field>
        </FormCard>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "auto", maxHeight: 520 }}>
        <table className="ledger">
          <thead><tr><th>Date</th><th>Name</th><th>Laborers</th><th>Plot</th><th>Work</th><th>Rate</th><th>Amount</th><th>Status</th><th>Mode</th><th></th></tr></thead>
          <tbody>
            {sorted.map((w) => (
              <tr key={w.id || w.date + w.name + w.amount}>
                <td className="mono">{fmtDate(w.date)}</td>
                <td>{w.name}</td>
                <td className="mono">{w.workers || 1}</td>
                <td>{w.plot}</td>
                <td style={{ maxWidth: 220 }}>{w.workType}</td>
                <td className="mono">{fmtINR(w.wageRate)}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{fmtINR(w.amount)}</td>
                <td><span style={{ color: w.status === "Unpaid" ? "var(--rust)" : "var(--leaf)", fontWeight: 600 }}>{w.status || "—"}</span></td>
                <td>{w.paymentMode || "—"}</td>
                <td>{w.id && <RowActions onEdit={() => startEdit(w)} onDelete={() => onDelete(w.id)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Harvest tab ---------- */
function HarvestTab({ harvest, onAdd, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const { years, year, setYear } = useYearPager(harvest);
  const blank = { round: 1, date: "", plot: "", wetWeightWithCart_kg: "", cartWeight_kg: "", dryConversionRate: 12.25, marketRatePerQuintalDry: "" };
  const [form, setForm] = useState(blank);

  const netWetWeight_kg = (Number(form.wetWeightWithCart_kg) || 0) - (Number(form.cartWeight_kg) || 0);
  const netWetQuintals = netWetWeight_kg / 100;
  const pricePerKgDry = (Number(form.marketRatePerQuintalDry) || 0) / 100;
  const pricePerQuintalWet = pricePerKgDry * (Number(form.dryConversionRate) || 0);
  const amount = pricePerQuintalWet * netWetQuintals;

  const yearOf = (h) => (h.date ? h.date.slice(0, 4) : "unknown");
  const yearRows = harvest.filter((h) => yearOf(h) === year);
  const sorted = [...yearRows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const totalQ = sorted.reduce((s, h) => s + (Number(h.netWetQuintals) || 0), 0);
  const totalAmt = sorted.reduce((s, h) => s + (Number(h.amount) || 0), 0);

  const openAdd = () => { setForm(blank); setEditingId(null); setOpen(true); };
  const closeForm = () => { setForm(blank); setEditingId(null); setOpen(false); };
  const startEdit = (h) => {
    setForm({
      round: h.round ?? 1, date: h.date || "", plot: h.plot || "",
      wetWeightWithCart_kg: h.wetWeightWithCart_kg ?? "", cartWeight_kg: h.cartWeight_kg ?? "",
      dryConversionRate: 12.25, marketRatePerQuintalDry: h.marketRatePerQuintalDry ?? "",
    });
    setEditingId(h.id);
    setOpen(true);
  };

  const submit = () => {
    if (!form.date || !netWetWeight_kg) return;
    const payload = {
      round: Number(form.round), date: form.date, plot: form.plot || "Unspecified plot",
      wetWeightWithCart_kg: Number(form.wetWeightWithCart_kg), cartWeight_kg: Number(form.cartWeight_kg),
      netWetWeight_kg, netWetQuintals: Math.round(netWetQuintals * 100) / 100,
      marketRatePerQuintalDry: Number(form.marketRatePerQuintalDry), amount: Math.round(amount * 100) / 100,
    };
    if (editingId) onUpdate(editingId, payload); else onAdd(payload);
    setYear(form.date ? form.date.slice(0, 4) : "unknown");
    closeForm();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <MarketPriceWidget onUseRate={(rate) => setForm((f) => ({ ...f, marketRatePerQuintalDry: rate }))} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <YearPager years={years} year={year} setYear={setYear} />
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{sorted.length} lots · {fmtNum(totalQ, 2)} quintals · {fmtINR(totalAmt)} in {year === "unknown" ? "undated lots" : `${year}`}</span>
        </div>
        <AddButton open={open} setOpen={(v) => (v ? openAdd() : closeForm())} label="Add harvest lot" />
      </div>

      {open && (
        <FormCard onCancel={closeForm} onSave={submit} editing={!!editingId}>
          <Field label="Bidu round"><select style={inputStyle} value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })}><option value={1}>1st Bidu</option><option value={2}>2nd Bidu</option><option value={3}>3rd Bidu</option><option value={4}>4th Bidu</option><option value={5}>5th Bidu</option></select></Field>
          <Field label="Date"><input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Plot / thota"><input style={inputStyle} placeholder="e.g. Kodibeelu" value={form.plot} onChange={(e) => setForm({ ...form, plot: e.target.value })} /></Field>
          <Field label="Total weight incl. cart (kg)"><input type="number" style={inputStyle} value={form.wetWeightWithCart_kg} onChange={(e) => setForm({ ...form, wetWeightWithCart_kg: e.target.value })} /></Field>
          <Field label="Empty cart weight (kg)"><input type="number" style={inputStyle} value={form.cartWeight_kg} onChange={(e) => setForm({ ...form, cartWeight_kg: e.target.value })} /></Field>
          <Field label={`Net wet weight — auto: ${fmtNum(netWetWeight_kg, 0)} kg`}><input disabled style={{ ...inputStyle, background: "#efe9d2", color: "var(--muted)" }} value={`${fmtNum(netWetQuintals, 2)} quintals`} readOnly /></Field>
          <Field label="Dry conversion (kg dry per 100kg wet)"><input type="number" step="0.01" style={inputStyle} value={form.dryConversionRate} onChange={(e) => setForm({ ...form, dryConversionRate: e.target.value })} /></Field>
          <Field label="Market rate (₹ per quintal dry)"><input type="number" style={inputStyle} value={form.marketRatePerQuintalDry} onChange={(e) => setForm({ ...form, marketRatePerQuintalDry: e.target.value })} /></Field>
          <Field label={`Amount — auto-calculated`}><input disabled style={{ ...inputStyle, background: "#efe9d2", color: "var(--ink)", fontWeight: 700 }} value={fmtINR(amount)} readOnly /></Field>
        </FormCard>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "auto", maxHeight: 520 }}>
        <table className="ledger">
          <thead><tr><th>Bidu</th><th>Date</th><th>Plot</th><th>Wet wt (cart)</th><th>Cart wt</th><th>Net wet</th><th>Quintals</th><th>Rate/qtl (dry)</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={10} style={{ color: "var(--muted)", padding: 16 }}>
                No harvest lots recorded for {year === "unknown" ? "undated entries" : year} yet — add this season's first lot with “Add harvest lot”.
              </td></tr>
            )}
            {sorted.map((h) => (
              <tr key={h.id || h.date + h.plot}>
                <td><span style={{ background: "var(--leaf)", color: "#F4F0DE", borderRadius: 20, padding: "1px 9px", fontSize: 11.5, fontWeight: 700 }}>{h.round}</span></td>
                <td className="mono">{fmtDate(h.date)}</td>
                <td>{h.plot}</td>
                <td className="mono">{fmtNum(h.wetWeightWithCart_kg, 0)} kg</td>
                <td className="mono">{fmtNum(h.cartWeight_kg, 0)} kg</td>
                <td className="mono">{fmtNum(h.netWetWeight_kg, 0)} kg</td>
                <td className="mono">{fmtNum(h.netWetQuintals, 2)}</td>
                <td className="mono">{fmtINR(h.marketRatePerQuintalDry)}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{fmtINR(h.amount)}</td>
                <td>{h.id && <RowActions onEdit={() => startEdit(h)} onDelete={() => onDelete(h.id)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Expenses tab ---------- */
function ExpensesTab({ expenses, onAdd, onUpdate, onDelete }) {
  const [section, setSection] = useState("farm");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const isHome = section === "home";
  const cats = isHome ? HOME_EXPENSE_CATEGORIES : EXPENSE_CATEGORIES;

  // An expense belongs to the Home sheet only if explicitly marked so; anything
  // else (including older rows with no sheet) is treated as a Farm expense.
  const sheetExpenses = expenses.filter((x) => (x.sheet === "Home") === isHome);
  const { months, month, setMonth } = useMonthPager(sheetExpenses);
  const filtered = sheetExpenses.filter((x) => monthKey(x.date) === month);
  const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const total = sorted.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  const blankFor = (home) => ({
    date: "", description: "", category: (home ? HOME_EXPENSE_CATEGORIES : EXPENSE_CATEGORIES)[0],
    amount: "", paymentMode: "Cash", paidTo: "", sheet: home ? "Home" : "Farm",
  });
  const [form, setForm] = useState(blankFor(false));

  const switchSection = (s) => { setSection(s); setOpen(false); setEditingId(null); setForm(blankFor(s === "home")); };
  const openAdd = () => { setForm(blankFor(isHome)); setEditingId(null); setOpen(true); };
  const closeForm = () => { setForm(blankFor(isHome)); setEditingId(null); setOpen(false); };
  const startEdit = (x) => { setForm({ ...blankFor(isHome), ...x, amount: x.amount ?? "" }); setEditingId(x.id); setOpen(true); };

  const submit = () => {
    if (!form.date || !form.description || !form.amount) return;
    const payload = { ...form, amount: Number(form.amount), sheet: isHome ? "Home" : "Farm" };
    if (editingId) onUpdate(editingId, payload); else onAdd(payload);
    setMonth(monthKey(form.date));
    closeForm();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <TabButton active={section === "farm"} onClick={() => switchSection("farm")}>Farm expenses</TabButton>
        <TabButton active={section === "home"} onClick={() => switchSection("home")}>Home expenses</TabButton>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <MonthPager months={months} month={month} setMonth={setMonth} />
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{sorted.length} entries · total {fmtINR(total)}</span>
        </div>
        <AddButton open={open} setOpen={(v) => (v ? openAdd() : closeForm())} label={isHome ? "Add home expense" : "Add farm expense"} />
      </div>

      {open && (
        <FormCard onCancel={closeForm} onSave={submit} editing={!!editingId}>
          <Field label="Date"><input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Description"><input style={inputStyle} placeholder={isHome ? "e.g. Monthly groceries" : "e.g. Fertilizer for Kengalu Hola"} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Category"><select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Amount (₹)"><input type="number" style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Payment mode"><input style={inputStyle} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })} /></Field>
          <Field label="Paid to"><input style={inputStyle} value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} /></Field>
        </FormCard>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "auto", maxHeight: 520 }}>
        <table className="ledger">
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Mode</th><th>Paid to</th><th></th></tr></thead>
          <tbody>
            {sorted.map((x) => (
              <tr key={x.id || x.date + x.description}>
                <td className="mono">{fmtDate(x.date)}</td>
                <td style={{ maxWidth: 340 }}>{x.description}</td>
                <td>{x.category}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{fmtINR(x.amount)}</td>
                <td>{x.paymentMode || "—"}</td>
                <td>{x.paidTo || "—"}</td>
                <td>{x.id && <RowActions onEdit={() => startEdit(x)} onDelete={() => onDelete(x.id)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Payments received tab ---------- */
function PaymentsTab({ payments, onAdd, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const { months, month, setMonth } = useMonthPager(payments);
  const blank = { date: "", amount: "", note: "" };
  const [form, setForm] = useState(blank);
  const filtered = payments.filter((p) => monthKey(p.date) === month);
  const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const total = sorted.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const openAdd = () => { setForm(blank); setEditingId(null); setOpen(true); };
  const closeForm = () => { setForm(blank); setEditingId(null); setOpen(false); };
  const startEdit = (p) => { setForm({ ...blank, ...p, amount: p.amount ?? "" }); setEditingId(p.id); setOpen(true); };

  const submit = () => {
    if (!form.date || !form.amount) return;
    const payload = { ...form, amount: Number(form.amount) };
    if (editingId) onUpdate(editingId, payload); else onAdd(payload);
    setMonth(monthKey(form.date));
    closeForm();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <MonthPager months={months} month={month} setMonth={setMonth} />
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{sorted.length} payment{sorted.length === 1 ? "" : "s"} · total {fmtINR(total)}</span>
        </div>
        <AddButton open={open} setOpen={(v) => (v ? openAdd() : closeForm())} label="Add payment" />
      </div>

      {open && (
        <FormCard onCancel={closeForm} onSave={submit} editing={!!editingId}>
          <Field label="Date"><input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Amount (₹)"><input type="number" style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Note"><input style={inputStyle} placeholder="e.g. RTGS advance" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </FormCard>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "auto", maxHeight: 520 }}>
        <table className="ledger">
          <thead><tr><th>Date</th><th>Amount</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id || p.date + p.amount}>
                <td className="mono">{fmtDate(p.date)}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{fmtINR(p.amount)}</td>
                <td>{p.note || "—"}</td>
                <td>{p.id && <RowActions onEdit={() => startEdit(p)} onDelete={() => onDelete(p.id)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- shared form widgets ---------- */
function AddButton({ open, setOpen, label }) {
  return (
    <button onClick={() => setOpen(!open)} style={{
      display: "flex", alignItems: "center", gap: 6, background: open ? "var(--rust)" : "var(--leaf)",
      color: "#F4F0DE", border: "none", borderRadius: 9, padding: "8px 14px", fontWeight: 600,
      fontSize: 13, cursor: "pointer", fontFamily: "'Inter', sans-serif",
    }}>
      {open ? <X size={15} /> : <Plus size={15} />} {open ? "Cancel" : label}
    </button>
  );
}

function FormCard({ children, onCancel, onSave, editing }) {
  return (
    <div style={{ background: "var(--card)", border: `1.5px ${editing ? "solid var(--gold)" : "dashed var(--line)"}`, borderRadius: 14, padding: 16 }}>
      {editing && <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gold)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Pencil size={13} /> Editing entry</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {children}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <button onClick={onCancel} style={{ border: "1px solid var(--line)", background: "transparent", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--muted)" }}>Cancel</button>
        <button onClick={onSave} style={{ border: "none", background: "var(--leaf)", color: "#F4F0DE", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{editing ? "Update entry" : "Save entry"}</button>
      </div>
    </div>
  );
}

/* ---------- Trees & Watering tab ---------- */
function TreesWateringTab({ treeLoss, watering, wages, onAddLoss, onUpdateLoss, onDeleteLoss, onAddWatering, onUpdateWatering, onDeleteWatering }) {
  const [section, setSection] = useState("loss");
  const [openLoss, setOpenLoss] = useState(false);
  const [openWater, setOpenWater] = useState(false);
  const [editLossId, setEditLossId] = useState(null);
  const [editWaterId, setEditWaterId] = useState(null);

  const blankLoss = { date: "", plot: PLOT_OPTIONS[0], treesLost: 1, cause: TREE_LOSS_CAUSES[0], notes: "" };
  const [lossForm, setLossForm] = useState(blankLoss);
  const openAddLoss = () => { setLossForm(blankLoss); setEditLossId(null); setOpenLoss(true); };
  const closeLoss = () => { setLossForm(blankLoss); setEditLossId(null); setOpenLoss(false); };
  const startEditLoss = (t) => { setLossForm({ ...blankLoss, ...t, treesLost: t.treesLost ?? 1 }); setEditLossId(t.id); setOpenLoss(true); };
  const submitLoss = () => {
    if (!lossForm.date) return;
    const payload = { ...lossForm, treesLost: Number(lossForm.treesLost) };
    if (editLossId) onUpdateLoss(editLossId, payload); else onAddLoss(payload);
    closeLoss();
  };

  const blankWater = { date: "", plot: PLOT_OPTIONS[0], method: WATERING_METHODS[0], notes: "" };
  const [waterForm, setWaterForm] = useState(blankWater);
  const openAddWater = () => { setWaterForm(blankWater); setEditWaterId(null); setOpenWater(true); };
  const closeWater = () => { setWaterForm(blankWater); setEditWaterId(null); setOpenWater(false); };
  const startEditWater = (w) => { setWaterForm({ ...blankWater, ...w }); setEditWaterId(w.id); setOpenWater(true); };
  const submitWater = () => {
    if (!waterForm.date) return;
    if (editWaterId) onUpdateWatering(editWaterId, waterForm); else onAddWatering(waterForm);
    closeWater();
  };

  const lossSorted = [...treeLoss].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const waterSorted = [...watering].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const irrigationFromWages = wages.filter((w) => (w.workType || "").toLowerCase().includes("irrigation") || (w.workType || "").toLowerCase().includes("drip")).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <TabButton active={section === "loss"} onClick={() => setSection("loss")}>Tree loss</TabButton>
        <TabButton active={section === "water"} onClick={() => setSection("water")}>Watering log</TabButton>
      </div>

      {section === "loss" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{lossSorted.reduce((s, t) => s + (Number(t.treesLost) || 0), 0)} trees lost across {lossSorted.length} incidents</span>
            <AddButton open={openLoss} setOpen={(v) => (v ? openAddLoss() : closeLoss())} label="Log tree loss" />
          </div>
          {openLoss && (
            <FormCard onCancel={closeLoss} onSave={submitLoss} editing={!!editLossId}>
              <Field label="Date"><input type="date" style={inputStyle} value={lossForm.date} onChange={(e) => setLossForm({ ...lossForm, date: e.target.value })} /></Field>
              <Field label="Plot"><select style={inputStyle} value={lossForm.plot} onChange={(e) => setLossForm({ ...lossForm, plot: e.target.value })}>{PLOT_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Trees lost"><input type="number" min="1" style={inputStyle} value={lossForm.treesLost} onChange={(e) => setLossForm({ ...lossForm, treesLost: e.target.value })} /></Field>
              <Field label="Suspected cause"><select style={inputStyle} value={lossForm.cause} onChange={(e) => setLossForm({ ...lossForm, cause: e.target.value })}>{TREE_LOSS_CAUSES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Notes"><input style={inputStyle} value={lossForm.notes} onChange={(e) => setLossForm({ ...lossForm, notes: e.target.value })} /></Field>
            </FormCard>
          )}
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "auto", maxHeight: 480 }}>
            <table className="ledger">
              <thead><tr><th>Date</th><th>Plot</th><th>Trees lost</th><th>Cause</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {lossSorted.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)", padding: 16 }}>No tree loss logged yet — good news, or just not tracked yet.</td></tr>}
                {lossSorted.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{fmtDate(t.date)}</td><td>{t.plot}</td>
                    <td className="mono" style={{ fontWeight: 600, color: "var(--rust)" }}>{t.treesLost}</td>
                    <td>{t.cause}</td><td>{t.notes || "—"}</td>
                    <td><RowActions onEdit={() => startEditLoss(t)} onDelete={() => onDeleteLoss(t.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === "water" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{waterSorted.length} manual entries · plus {irrigationFromWages} irrigation-tagged wage entries counted automatically on the dashboard</span>
            <AddButton open={openWater} setOpen={(v) => (v ? openAddWater() : closeWater())} label="Log watering" />
          </div>
          {openWater && (
            <FormCard onCancel={closeWater} onSave={submitWater} editing={!!editWaterId}>
              <Field label="Date"><input type="date" style={inputStyle} value={waterForm.date} onChange={(e) => setWaterForm({ ...waterForm, date: e.target.value })} /></Field>
              <Field label="Plot"><select style={inputStyle} value={waterForm.plot} onChange={(e) => setWaterForm({ ...waterForm, plot: e.target.value })}>{PLOT_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Method"><select style={inputStyle} value={waterForm.method} onChange={(e) => setWaterForm({ ...waterForm, method: e.target.value })}>{WATERING_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
              <Field label="Notes"><input style={inputStyle} value={waterForm.notes} onChange={(e) => setWaterForm({ ...waterForm, notes: e.target.value })} /></Field>
            </FormCard>
          )}
          <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--card)", border: "1px dashed var(--line)", borderRadius: 10, padding: "8px 12px" }}>
            Tip: you don't need to log every watering here if a laborer did it — those already show up automatically from the Labor Wages tab when the work type is Irrigation or Drip. Use this log for watering you do yourself, or to record method/duration detail.
          </div>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "auto", maxHeight: 420 }}>
            <table className="ledger">
              <thead><tr><th>Date</th><th>Plot</th><th>Method</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {waterSorted.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)", padding: 16 }}>No manual watering entries yet.</td></tr>}
                {waterSorted.map((w) => (
                  <tr key={w.id}><td className="mono">{fmtDate(w.date)}</td><td>{w.plot}</td><td>{w.method}</td><td>{w.notes || "—"}</td><td><RowActions onEdit={() => startEditWater(w)} onDelete={() => onDeleteWatering(w.id)} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Crop Health tab (pests & soil/water tests) ---------- */
function CropHealthTab({ pests, soilTests, onAddPest, onUpdatePest, onDeletePest, onAddSoilTest, onUpdateSoilTest, onDeleteSoilTest }) {
  const [section, setSection] = useState("pests");
  const [openPest, setOpenPest] = useState(false);
  const [openSoil, setOpenSoil] = useState(false);
  const [editPestId, setEditPestId] = useState(null);
  const [editSoilId, setEditSoilId] = useState(null);

  const blankPest = { date: "", plot: PLOT_OPTIONS[0], type: PEST_DISEASE_OPTIONS[0], severity: "Low", treesAffected: "", actionTaken: "", notes: "" };
  const [pestForm, setPestForm] = useState(blankPest);
  const openAddPest = () => { setPestForm(blankPest); setEditPestId(null); setOpenPest(true); };
  const closePest = () => { setPestForm(blankPest); setEditPestId(null); setOpenPest(false); };
  const startEditPest = (p) => { setPestForm({ ...blankPest, ...p }); setEditPestId(p.id); setOpenPest(true); };
  const submitPest = () => {
    if (!pestForm.date) return;
    if (editPestId) onUpdatePest(editPestId, pestForm); else onAddPest(pestForm);
    closePest();
  };

  const blankSoil = { date: "", plot: PLOT_OPTIONS[0], sampleType: "Soil", pH: "", ecOrOther: "", labName: "", recommendation: "" };
  const [soilForm, setSoilForm] = useState(blankSoil);
  const openAddSoil = () => { setSoilForm(blankSoil); setEditSoilId(null); setOpenSoil(true); };
  const closeSoil = () => { setSoilForm(blankSoil); setEditSoilId(null); setOpenSoil(false); };
  const startEditSoil = (s) => { setSoilForm({ ...blankSoil, ...s }); setEditSoilId(s.id); setOpenSoil(true); };
  const submitSoil = () => {
    if (!soilForm.date) return;
    if (editSoilId) onUpdateSoilTest(editSoilId, soilForm); else onAddSoilTest(soilForm);
    closeSoil();
  };

  const pestSorted = [...pests].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const soilSorted = [...soilTests].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <TabButton active={section === "pests"} onClick={() => setSection("pests")}>Pests & disease</TabButton>
        <TabButton active={section === "soil"} onClick={() => setSection("soil")}>Soil & water tests</TabButton>
      </div>

      {section === "pests" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><AddButton open={openPest} setOpen={(v) => (v ? openAddPest() : closePest())} label="Log pest / disease" /></div>
          {openPest && (
            <FormCard onCancel={closePest} onSave={submitPest} editing={!!editPestId}>
              <Field label="Date"><input type="date" style={inputStyle} value={pestForm.date} onChange={(e) => setPestForm({ ...pestForm, date: e.target.value })} /></Field>
              <Field label="Plot"><select style={inputStyle} value={pestForm.plot} onChange={(e) => setPestForm({ ...pestForm, plot: e.target.value })}>{PLOT_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Pest / disease"><select style={inputStyle} value={pestForm.type} onChange={(e) => setPestForm({ ...pestForm, type: e.target.value })}>{PEST_DISEASE_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Severity"><select style={inputStyle} value={pestForm.severity} onChange={(e) => setPestForm({ ...pestForm, severity: e.target.value })}>{SEVERITY_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Trees affected (approx.)"><input type="number" style={inputStyle} value={pestForm.treesAffected} onChange={(e) => setPestForm({ ...pestForm, treesAffected: e.target.value })} /></Field>
              <Field label="Action taken"><input style={inputStyle} value={pestForm.actionTaken} onChange={(e) => setPestForm({ ...pestForm, actionTaken: e.target.value })} /></Field>
              <Field label="Notes"><input style={inputStyle} value={pestForm.notes} onChange={(e) => setPestForm({ ...pestForm, notes: e.target.value })} /></Field>
            </FormCard>
          )}
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "auto", maxHeight: 480 }}>
            <table className="ledger">
              <thead><tr><th>Date</th><th>Plot</th><th>Issue</th><th>Severity</th><th>Trees</th><th>Action taken</th><th></th></tr></thead>
              <tbody>
                {pestSorted.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted)", padding: 16 }}>No pest or disease issues logged yet.</td></tr>}
                {pestSorted.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{fmtDate(p.date)}</td><td>{p.plot}</td><td style={{ maxWidth: 220 }}>{p.type}</td>
                    <td><span style={{ color: p.severity === "High" ? "var(--rust)" : p.severity === "Medium" ? "var(--gold)" : "var(--leaf)", fontWeight: 600 }}>{p.severity}</span></td>
                    <td className="mono">{p.treesAffected || "—"}</td><td>{p.actionTaken || "—"}</td>
                    <td><RowActions onEdit={() => startEditPest(p)} onDelete={() => onDeletePest(p.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === "soil" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><AddButton open={openSoil} setOpen={(v) => (v ? openAddSoil() : closeSoil())} label="Log soil / water test" /></div>
          {openSoil && (
            <FormCard onCancel={closeSoil} onSave={submitSoil} editing={!!editSoilId}>
              <Field label="Date"><input type="date" style={inputStyle} value={soilForm.date} onChange={(e) => setSoilForm({ ...soilForm, date: e.target.value })} /></Field>
              <Field label="Plot"><select style={inputStyle} value={soilForm.plot} onChange={(e) => setSoilForm({ ...soilForm, plot: e.target.value })}>{PLOT_OPTIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Sample type"><select style={inputStyle} value={soilForm.sampleType} onChange={(e) => setSoilForm({ ...soilForm, sampleType: e.target.value })}>{SAMPLE_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="pH"><input type="number" step="0.1" style={inputStyle} value={soilForm.pH} onChange={(e) => setSoilForm({ ...soilForm, pH: e.target.value })} /></Field>
              <Field label="NPK / EC / other readings"><input style={inputStyle} placeholder="e.g. N-280 P-12 K-140, EC 0.4" value={soilForm.ecOrOther} onChange={(e) => setSoilForm({ ...soilForm, ecOrOther: e.target.value })} /></Field>
              <Field label="Lab / tested by"><input style={inputStyle} value={soilForm.labName} onChange={(e) => setSoilForm({ ...soilForm, labName: e.target.value })} /></Field>
              <Field label="Recommendation received"><input style={inputStyle} value={soilForm.recommendation} onChange={(e) => setSoilForm({ ...soilForm, recommendation: e.target.value })} /></Field>
            </FormCard>
          )}
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "auto", maxHeight: 480 }}>
            <table className="ledger">
              <thead><tr><th>Date</th><th>Plot</th><th>Type</th><th>pH</th><th>Readings</th><th>Lab</th><th>Recommendation</th><th></th></tr></thead>
              <tbody>
                {soilSorted.length === 0 && <tr><td colSpan={8} style={{ color: "var(--muted)", padding: 16 }}>No soil or water tests logged yet — worth doing one per plot before the next fertilizer round.</td></tr>}
                {soilSorted.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{fmtDate(s.date)}</td><td>{s.plot}</td><td>{s.sampleType}</td>
                    <td className="mono">{s.pH || "—"}</td><td>{s.ecOrOther || "—"}</td><td>{s.labName || "—"}</td><td>{s.recommendation || "—"}</td>
                    <td><RowActions onEdit={() => startEditSoil(s)} onDelete={() => onDeleteSoilTest(s.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Advisor tab ---------- */
function AdvisorTab({ pests, treeLoss }) {
  const loggedIssues = useMemo(() => {
    const types = new Set([...pests.map((p) => p.type), ...treeLoss.map((t) => t.cause)]);
    return [...types].filter((t) => ADVISOR_NOTES[t] || Object.entries(ADVISOR_NOTES).some(([, v]) => v.also && v.also.includes(t)));
  }, [pests, treeLoss]);

  const lookup = (name) => ADVISOR_NOTES[name] || Object.values(ADVISOR_NOTES).find((v) => v.also && v.also.includes(name));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 780 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
        <BookOpen size={18} color="var(--leaf)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          General reference for areca (adike) cultivation, based on established agronomy practice for Karnataka growing regions. This isn't a substitute for a plant pathologist — for exact chemical dosages and confirmed diagnosis, contact your local Krishi Vigyana Kendra (KVK) or ICAR-CPCRI Regional Station, Vittal.
        </div>
      </div>

      {loggedIssues.length > 0 && (
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Based on your recent logs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loggedIssues.map((name) => {
              const info = lookup(name);
              if (!info) return null;
              return (
                <div key={name} style={{ background: "#F6E4D9", border: "1px solid var(--rust)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#5C2A10", marginBottom: 4 }}>{name}</div>
                  <div style={{ fontSize: 12.5, color: "#5C2A10", marginBottom: 4 }}><b>Symptoms:</b> {info.symptoms}</div>
                  <div style={{ fontSize: 12.5, color: "#5C2A10" }}><b>What to do:</b> {info.action}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>General good practice</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {GENERAL_ADVISOR_TIPS.map((tip) => (
            <div key={tip.title} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <tip.icon size={16} color="var(--leaf)" />
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{tip.title}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{tip.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, marginBottom: 10 }}>Common areca pests & diseases in Karnataka</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(ADVISOR_NOTES).map(([name, info]) => (
            <details key={name} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13.5 }}>{name}</summary>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                <div style={{ marginBottom: 4 }}><b>Symptoms:</b> {info.symptoms}</div>
                <div><b>What to do:</b> {info.action}</div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Live Agmarknet market price widget ---------- */
// District names as they appear in the data.gov.in Agmarknet feed. "All Karnataka"
// omits the district filter so every reporting APMC market comes back.
const DEFAULT_MAMCOS_MARKETS = ["SHIVAMOGGA", "SAGARA", "THIRTHAHALLI", "HOSANAGARA", "KOPPA", "BHADRAVATHI", "CHANNAGIRI"];

function MarketPriceWidget({ onUseRate }) {
  const [market, setMarket] = useState("SHIVAMOGGA");
  const [allRows, setAllRows] = useState([]);
  const [markets, setMarkets] = useState(DEFAULT_MAMCOS_MARKETS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const fetchRates = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all markets in one call via the Edge Function (scrapes mamcos.info
      // server-side → no CORS), then filter by the chosen market client-side.
      const { data, error: fnError } = await supabase.functions.invoke("areca-rates", { body: {} });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      const rows = data?.rows || [];
      const mk = data?.markets || [];
      setAllRows(rows);
      if (mk.length) {
        setMarkets(mk);
        if (!mk.includes(market)) setMarket(mk.includes("SHIVAMOGGA") ? "SHIVAMOGGA" : mk[0]);
      }
      if (rows.length === 0) setError("No rates published on mamcos.info right now — check back later.");
    } catch (e) {
      setError("Couldn't fetch rates: " + (e?.message || e) + ". Make sure the 'areca-rates' Edge Function is deployed to your Supabase project.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => { fetchRates(); }, []); // auto-load once on mount

  const shown = allRows.filter((r) => r.market === market);
  const asOf = shown[0]?.date;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 14.5 }}>Live areca rate — MAMCOS, Shivamogga</div>
          {asOf && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>Rates as of {asOf} · ₹ per quintal</div>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={market} onChange={(e) => setMarket(e.target.value)} style={inputStyle}>
            {markets.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={fetchRates} disabled={loading} style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--leaf)", color: "#F4F0DE",
            border: "none", borderRadius: 9, padding: "7px 13px", fontWeight: 600, fontSize: 12.5, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
          }}>
            {loading ? <Loader2 size={13} className="spin" /> : null} {loading ? "Loading…" : "Refresh"}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} style={{ background: "transparent", border: "1px solid var(--line)", borderRadius: 9, padding: "6px 10px", fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>About</button>
        </div>
      </div>

      {showSettings && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 }}>
          Rates come from MAMCOS (Malnad Areca Marketing Co-operative Society, Shivamogga) via{" "}
          <a href="https://mamcos.info/areca-market-rates/" target="_blank" rel="noreferrer" style={{ color: "var(--rust)" }}>mamcos.info</a>.
          A Supabase Edge Function (<span className="mono">areca-rates</span>) fetches and parses the page server-side,
          so there's no CORS issue in the browser. Prices are quoted per quintal for each grade
          (Rashi Edi, Gorabalu, Bette, Hasa, Chali…) and update on trading days.
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#5C2A10", background: "#F6E4D9", border: "1px solid var(--rust)", borderRadius: 8, padding: "8px 12px" }}>{error}</div>
      )}

      {loading && !loaded && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={14} className="spin" /> Fetching today's rates from mamcos.info…
        </div>
      )}

      {shown.length > 0 && (
        <div style={{ marginTop: 10, overflow: "auto" }}>
          <table className="ledger">
            <thead><tr><th>Grade / product</th><th>Date</th><th>Min (₹/qtl)</th><th>Max (₹/qtl)</th><th>Average (₹/qtl)</th><th></th></tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.product}</td>
                  <td className="mono">{r.date}</td>
                  <td className="mono">{fmtINR(r.min)}</td>
                  <td className="mono">{fmtINR(r.max)}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{fmtINR(r.average)}</td>
                  <td>
                    {onUseRate && r.average != null && (
                      <button onClick={() => onUseRate(Number(r.average))} title="Use this average as the harvest rate" style={{ fontSize: 11.5, border: "1px solid var(--leaf)", color: "var(--leaf)", background: "transparent", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Use avg</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loaded && !error && shown.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>No rates listed for {market} today. Try another market or Refresh.</div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
        Source: MAMCOS (Malnad Areca Marketing Co-operative Society) — mamcos.info. Rates are per quintal and posted on trading days only.
      </div>
    </div>
  );
}
