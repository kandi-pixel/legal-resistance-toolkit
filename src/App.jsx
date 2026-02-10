import { useState } from "react";

const STEPS = ["filing", "employment", "income", "results"];

const TAX_BRACKETS_2024 = {
  single: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
  married_jointly: [
    { min: 0, max: 23200, rate: 0.10 },
    { min: 23200, max: 94300, rate: 0.12 },
    { min: 94300, max: 201050, rate: 0.22 },
    { min: 201050, max: 383900, rate: 0.24 },
    { min: 383900, max: 487450, rate: 0.32 },
    { min: 487450, max: 731200, rate: 0.35 },
    { min: 731200, max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 16550, rate: 0.10 },
    { min: 16550, max: 63100, rate: 0.12 },
    { min: 63100, max: 100500, rate: 0.22 },
    { min: 100500, max: 191950, rate: 0.24 },
    { min: 191950, max: 243700, rate: 0.32 },
    { min: 243700, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
};

const STANDARD_DEDUCTIONS = { single: 14600, married_jointly: 29200, head_of_household: 21900 };
const US_WORKFORCE = 130000000;
const ANNUAL_WITHHOLDING = 2100000000000;
const MEDIAN_INCOME = 63000;

function calcTax(income, brackets) {
  let tax = 0;
  for (const b of brackets) {
    if (income <= b.min) break;
    tax += (Math.min(income, b.max) - b.min) * b.rate;
  }
  return tax;
}

function fmt(n) { return "$" + Math.round(Math.abs(n)).toLocaleString(); }
function fmtBig(n) {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + " trillion";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + " billion";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + " million";
  return fmt(n);
}
function fmtBw(annual) { return fmt(annual / 26); }
function fmtQ(annual) { return fmt(annual / 4); }

export default function App() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    filingStatus: "", employmentType: "", annualIncome: "", preTaxContributions: "",
    customWithholding: "", useAdvanced: false,
    childrenUnder17: "", otherDependents: "",
  });
  const [expandedRisk, setExpandedRisk] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState({});
  const [expandedMath, setExpandedMath] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeImpactTab, setActiveImpactTab] = useState("l3");

  const currentStep = STEPS[step];
  const update = (f, v) => setData(d => ({ ...d, [f]: v }));
  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep(s => Math.max(s - 1, 0));
  const restart = () => {
    setStep(0);
    setData({ filingStatus: "", employmentType: "", annualIncome: "", preTaxContributions: "", customWithholding: "", useAdvanced: false, childrenUnder17: "", otherDependents: "" });
    setExpandedRisk(null); setExpandedSteps({}); setExpandedMath({}); setShowAdvanced(false); setActiveImpactTab("l3");
  };
  const toggleSteps = (id) => setExpandedSteps(s => ({ ...s, [id]: !s[id] }));
  const toggleMath = (id) => setExpandedMath(s => ({ ...s, [id]: !s[id] }));
  const toggleRisk = (id) => setExpandedRisk(expandedRisk === id ? null : id);

  const isW2 = data.employmentType === "w2";
  const isSE = data.employmentType === "self";
  const isBoth = data.employmentType === "both";

  const income = parseFloat(data.annualIncome) || 0;
  const preTax = parseFloat(data.preTaxContributions) || 0;
  const kidsUnder17 = parseInt(data.childrenUnder17) || 0;
  const otherDeps = parseInt(data.otherDependents) || 0;
  const brackets = TAX_BRACKETS_2024[data.filingStatus] || TAX_BRACKETS_2024.single;
  const stdDed = STANDARD_DEDUCTIONS[data.filingStatus] || 14600;

  // Child tax credit: $2,000 per child under 17, phases out at $200k single / $400k MFJ
  const childCredit = kidsUnder17 * 2000;
  // Other dependent credit: $500 per
  const otherDepCredit = otherDeps * 500;
  const totalCredits = childCredit + otherDepCredit;

  // SE tax calculation
  const seNetIncome = income * 0.9235;
  const seTaxTotal = (isSE || isBoth) ? seNetIncome * 0.153 : 0;
  const seDeduction = seTaxTotal * 0.5; // deductible half

  // Current tax
  const taxableIncome = Math.max(0, income - preTax - stdDed - ((isSE || isBoth) ? seDeduction : 0));
  const taxBeforeCredits = calcTax(taxableIncome, brackets);
  const actualTax = Math.max(0, taxBeforeCredits - totalCredits);

  // Withholding estimate
  const customWH = parseFloat(data.customWithholding) || 0;
  const estWithholding = data.useAdvanced && customWH > 0
    ? customWH * (isW2 ? 26 : 4)
    : actualTax * 1.15;
  const overpayment = Math.max(0, estWithholding - actualTax);

  // Layer 1 — pre-tax optimization
  const maxPreTaxW2 = Math.min(income * 0.20, 23000 + 4150);
  const maxPreTaxSE = Math.min(income * 0.25, 66000 + 4150);
  const maxPreTax = isSE ? maxPreTaxSE : isW2 ? maxPreTaxW2 : Math.max(maxPreTaxW2, maxPreTaxSE);
  const additionalPreTax = Math.max(0, maxPreTax - preTax);
  const l1TaxableIncome = Math.max(0, income - maxPreTax - stdDed - ((isSE || isBoth) ? seDeduction : 0));
  const l1TaxBeforeCredits = calcTax(l1TaxableIncome, brackets);
  const l1Tax = Math.max(0, l1TaxBeforeCredits - totalCredits);
  const l1TaxReduction = actualTax - l1Tax;
  const l1Savings = l1TaxReduction + overpayment;

  // Layer 2 — charitable redirect
  const charitable = income * 0.1;
  const l2TaxableIncome = Math.max(0, income - maxPreTax - stdDed - charitable - ((isSE || isBoth) ? seDeduction : 0));
  const l2TaxBeforeCredits = calcTax(l2TaxableIncome, brackets);
  const l2Tax = Math.max(0, l2TaxBeforeCredits - totalCredits);
  const l2TaxReduction = actualTax - l2Tax;
  const l2Savings = l2TaxReduction + overpayment;

  // Layer 3
  const exemptAnnual = estWithholding;
  const underpayPenalty = actualTax * 0.08;
  const falseW4Penalty = (isW2 || isBoth) ? 500 : 0;
  const totalRisk = underpayPenalty + falseW4Penalty;

  // Collective
  const avgWH = ANNUAL_WITHHOLDING / US_WORKFORCE;
  const avgL1 = MEDIAN_INCOME * 0.03;
  const avgL2 = MEDIAN_INCOME * 0.07;
  const pops = [
    { pct: "1%", n: "1.3 million", count: US_WORKFORCE * 0.01 },
    { pct: "5%", n: "6.5 million", count: US_WORKFORCE * 0.05 },
    { pct: "10%", n: "13 million", count: US_WORKFORCE * 0.10 },
  ];
  const impactData = {
    l1: { label: "Optimize", color: "#48bb78", desc: "Money kept from overpaying — stays in workers' pockets instead of the Treasury", rows: pops.map(p => ({ ...p, annual: avgL1 * p.count })) },
    l2: { label: "Redirect", color: "#ecc94b", desc: "Money redirected from the government to communities, mutual aid, and causes", rows: pops.map(p => ({ ...p, annual: avgL2 * p.count })) },
    l3: { label: "Withhold", color: "#e85d3a", desc: "Total federal income tax withheld from the Treasury", rows: pops.map(p => ({ ...p, annual: avgWH * p.count })) },
  };

  const canProceed = () => {
    if (currentStep === "filing") return !!data.filingStatus;
    if (currentStep === "employment") return !!data.employmentType;
    if (currentStep === "income") return income > 0;
    return true;
  };

  const card = (sel) => ({
    padding: "16px 20px", border: sel ? "2px solid #e85d3a" : "2px solid #2a2a2a",
    borderRadius: "12px", background: sel ? "rgba(232,93,58,0.08)" : "rgba(255,255,255,0.02)",
    cursor: "pointer", transition: "all 0.2s", textAlign: "left",
  });
  const inputS = {
    width: "100%", padding: "14px 16px 14px 28px", fontSize: "18px",
    background: "rgba(255,255,255,0.06)", border: "2px solid #2a2a2a", borderRadius: "12px",
    color: "#f0ece4", outline: "none", fontFamily: "'DM Mono', monospace", boxSizing: "border-box",
  };
  const inputNum = { ...inputS, paddingLeft: "16px", width: "80px", textAlign: "center" };
  const btnP = {
    padding: "14px 32px", background: "#e85d3a", color: "#0a0a0a", border: "none",
    borderRadius: "10px", fontSize: "16px", fontWeight: "700", cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
  };
  const btnSt = {
    padding: "14px 24px", background: "transparent", color: "#666", border: "1px solid #2a2a2a",
    borderRadius: "10px", fontSize: "14px", cursor: "pointer", fontFamily: "'Syne', sans-serif",
  };
  const nxtBtn = (color) => ({
    width: "100%", padding: "12px 16px", background: color + "12",
    border: `1px solid ${color}44`, borderRadius: "10px", cursor: "pointer",
    color, fontWeight: "700", fontSize: "14px", fontFamily: "'Syne', sans-serif",
    marginTop: "12px", textAlign: "center",
  });
  const mathBtn = (color) => ({
    width: "100%", padding: "10px 16px", background: "rgba(255,255,255,0.02)",
    border: "1px solid #1e1e1e", borderRadius: "8px", cursor: "pointer",
    color: "#777", fontWeight: "500", fontSize: "12px", fontFamily: "'DM Mono', monospace",
    marginTop: "8px", textAlign: "center",
  });

  const hdr = (num, label, color, risk) => (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "50%", background: color + "22",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "14px", fontWeight: "700", color, flexShrink: 0,
      }}>{num}</div>
      <div style={{ fontWeight: "700", fontSize: "17px", color }}>{label}</div>
      {risk && (
        <div style={{
          marginLeft: "auto", padding: "3px 10px", borderRadius: "20px", fontSize: "10px",
          fontWeight: "600", letterSpacing: "1px", textTransform: "uppercase",
          fontFamily: "'DM Mono', monospace",
          background: risk === "ZERO RISK" ? "#48bb7818" : risk === "LOW RISK" ? "#ecc94b18" : "#e85d3a18",
          color: risk === "ZERO RISK" ? "#48bb78" : risk === "LOW RISK" ? "#ecc94b" : "#e85d3a",
        }}>{risk}</div>
      )}
    </div>
  );

  const stp = (num, text) => (
    <div style={{ display: "flex", gap: "12px", marginBottom: "12px", alignItems: "flex-start" }}>
      <div style={{
        width: "24px", height: "24px", borderRadius: "50%", background: "rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "12px", fontWeight: "700", color: "#ccc", flexShrink: 0, marginTop: "1px",
      }}>{num}</div>
      <div style={{ color: "#ccc", fontSize: "14px", lineHeight: "1.6" }}>{text}</div>
    </div>
  );

  const mathRow = (label, value, bold, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1a1a1a" }}>
      <span style={{ color: "#999", fontSize: "12px", fontWeight: bold ? "700" : "400" }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono', monospace", color: color || "#bbb", fontSize: "12px", fontWeight: bold ? "700" : "400" }}>{value}</span>
    </div>
  );

  const activeImp = impactData[activeImpactTab];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(170deg, #0a0a0a 0%, #130e0e 50%, #0a0a0a 100%)",
      color: "#f0ece4", fontFamily: "'Syne', sans-serif",
    }}>
      <div style={{ padding: "28px 24px 22px", borderBottom: "1px solid rgba(232,93,58,0.12)", background: "rgba(232,93,58,0.02)" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "#e85d3a", marginBottom: "8px", fontFamily: "'DM Mono', monospace" }}>Kandra Finances</div>
          <h1 style={{ fontSize: "30px", fontWeight: "800", margin: "0 0 6px", lineHeight: "1.15", fontFamily: "'Instrument Serif', serif" }}>Tax Resistance Calculator</h1>
          <p style={{ color: "#888", margin: 0, fontSize: "14px", lineHeight: "1.5" }}>Know your options. Know the risks. Make an informed decision. Act on it.</p>
        </div>
      </div>

      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px 24px 0" }}>
        <div style={{ display: "flex", gap: "5px", marginBottom: "32px" }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, height: "3px", borderRadius: "2px", background: i <= step ? "#e85d3a" : "#1a1a1a", transition: "background 0.3s" }} />
          ))}
        </div>

        {/* FILING */}
        {currentStep === "filing" && (
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "6px", fontFamily: "'Instrument Serif', serif" }}>How do you file?</h2>
            <p style={{ color: "#888", fontSize: "14px", marginBottom: "24px" }}>This affects your tax brackets and standard deduction.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { v: "single", l: "Single", d: "Unmarried or legally separated" },
                { v: "married_jointly", l: "Married Filing Jointly", d: "Married and filing together" },
                { v: "head_of_household", l: "Head of Household", d: "Unmarried with dependents" },
              ].map(o => (
                <div key={o.v} onClick={() => update("filingStatus", o.v)} style={card(data.filingStatus === o.v)}>
                  <div style={{ fontWeight: "600", fontSize: "16px" }}>{o.l}</div>
                  <div style={{ color: "#888", fontSize: "13px", marginTop: "2px" }}>{o.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EMPLOYMENT */}
        {currentStep === "employment" && (
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "6px", fontFamily: "'Instrument Serif', serif" }}>How do you earn your money?</h2>
            <p style={{ color: "#888", fontSize: "14px", marginBottom: "24px" }}>This changes what options you have — and how easy they are.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { v: "w2", l: "W-2 Employee", d: "Employer withholds taxes for you" },
                { v: "self", l: "Self-Employed / 1099", d: "You handle your own taxes" },
                { v: "both", l: "Both", d: "Mix of W-2 and self-employment" },
              ].map(o => (
                <div key={o.v} onClick={() => update("employmentType", o.v)} style={card(data.employmentType === o.v)}>
                  <div style={{ fontWeight: "600", fontSize: "16px" }}>{o.l}</div>
                  <div style={{ color: "#888", fontSize: "13px", marginTop: "2px" }}>{o.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INCOME + DEPENDENTS */}
        {currentStep === "income" && (
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "6px", fontFamily: "'Instrument Serif', serif" }}>Your numbers</h2>
            <p style={{ color: "#888", fontSize: "14px", marginBottom: "24px" }}>Best estimates are fine. We'll show our math.</p>

            {/* Income */}
            <label style={{ display: "block", color: "#aaa", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>Annual income (gross, before taxes)</label>
            <div style={{ position: "relative", marginBottom: "20px" }}>
              <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: "18px", fontFamily: "'DM Mono', monospace" }}>$</span>
              <input type="number" placeholder="65000" value={data.annualIncome} onChange={e => update("annualIncome", e.target.value)} style={inputS} />
            </div>

            {/* Dependents */}
            <label style={{ display: "block", color: "#aaa", fontSize: "14px", fontWeight: "600", marginBottom: "12px" }}>Dependents</label>
            <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ display: "block", color: "#777", fontSize: "12px", marginBottom: "6px" }}>Children under 17</label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    onClick={() => update("childrenUnder17", Math.max(0, (parseInt(data.childrenUnder17) || 0) - 1).toString())}
                    style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#888", fontSize: "18px", userSelect: "none" }}
                  >−</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "20px", fontWeight: "700", minWidth: "24px", textAlign: "center" }}>
                    {parseInt(data.childrenUnder17) || 0}
                  </div>
                  <div
                    onClick={() => update("childrenUnder17", ((parseInt(data.childrenUnder17) || 0) + 1).toString())}
                    style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#888", fontSize: "18px", userSelect: "none" }}
                  >+</div>
                </div>
                {kidsUnder17 > 0 && <div style={{ color: "#48bb78", fontSize: "11px", marginTop: "4px", fontFamily: "'DM Mono', monospace" }}>{fmt(childCredit)} child tax credit</div>}
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ display: "block", color: "#777", fontSize: "12px", marginBottom: "6px" }}>Other dependents (17+, parents, etc.)</label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    onClick={() => update("otherDependents", Math.max(0, (parseInt(data.otherDependents) || 0) - 1).toString())}
                    style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#888", fontSize: "18px", userSelect: "none" }}
                  >−</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "20px", fontWeight: "700", minWidth: "24px", textAlign: "center" }}>
                    {parseInt(data.otherDependents) || 0}
                  </div>
                  <div
                    onClick={() => update("otherDependents", ((parseInt(data.otherDependents) || 0) + 1).toString())}
                    style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#888", fontSize: "18px", userSelect: "none" }}
                  >+</div>
                </div>
                {otherDeps > 0 && <div style={{ color: "#48bb78", fontSize: "11px", marginTop: "4px", fontFamily: "'DM Mono', monospace" }}>{fmt(otherDepCredit)} dependent credit</div>}
              </div>
            </div>

            {/* Pre-tax */}
            <label style={{ display: "block", color: "#aaa", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
              Current pre-tax contributions/year
            </label>
            <div style={{ color: "#666", fontSize: "12px", marginBottom: "8px" }}>
              {isW2 ? "401k, HSA, etc." : isSE ? "SEP-IRA, Solo 401k, HSA, etc." : "401k, SEP-IRA, HSA, etc."} — enter 0 if none
            </div>
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: "18px", fontFamily: "'DM Mono', monospace" }}>$</span>
              <input type="number" placeholder="0" value={data.preTaxContributions} onChange={e => update("preTaxContributions", e.target.value)} style={inputS} />
            </div>

            {/* Advanced */}
            <div onClick={() => setShowAdvanced(!showAdvanced)} style={{ cursor: "pointer", color: "#e85d3a", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>{showAdvanced ? "▾" : "▸"}</span>
              <span>Want more exact numbers? Enter your actual {isW2 ? "withholding" : isSE ? "quarterly payments" : "withholding"}</span>
            </div>
            {showAdvanced && (
              <div style={{ marginTop: "12px", padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid #222" }}>
                <label style={{ display: "block", color: "#888", fontSize: "13px", marginBottom: "8px" }}>
                  {isW2 ? 'Federal tax per biweekly paycheck (check pay stub for "FIT")' :
                   isSE ? "Quarterly estimated tax payment amount" :
                   'Federal tax per biweekly paycheck (W-2 portion)'}
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: "18px", fontFamily: "'DM Mono', monospace" }}>$</span>
                  <input type="number" placeholder={isW2 ? "500" : "3000"} value={data.customWithholding}
                    onChange={e => { update("customWithholding", e.target.value); update("useAdvanced", true); }}
                    style={inputS} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== RESULTS ==================== */}
        {currentStep === "results" && (
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: "700", marginBottom: "4px", fontFamily: "'Instrument Serif', serif" }}>Your Resistance Options</h2>
            <p style={{ color: "#666", fontSize: "13px", marginBottom: "28px" }}>
              {fmt(income)} · {data.filingStatus?.replace(/_/g, " ")} · {isW2 ? "W-2" : isSE ? "self-employed" : "mixed"}
              {(kidsUnder17 > 0 || otherDeps > 0) && ` · ${kidsUnder17 + otherDeps} dependent${(kidsUnder17 + otherDeps) > 1 ? "s" : ""}`}
              {!data.useAdvanced && <span style={{ color: "#555" }}> · estimated</span>}
            </p>

            {/* Current */}
            <div style={{ padding: "18px", background: "rgba(255,255,255,0.03)", borderRadius: "14px", marginBottom: "14px", border: "1px solid #1e1e1e" }}>
              <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#666", marginBottom: "12px", fontFamily: "'DM Mono', monospace" }}>Right Now</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <div style={{ color: "#666", fontSize: "11px", marginBottom: "2px" }}>It's probable you owe</div>
                  <div style={{ fontSize: "22px", fontWeight: "700", fontFamily: "'DM Mono', monospace" }}>{fmt(actualTax)}<span style={{ fontSize: "11px", color: "#555" }}>/yr</span></div>
                </div>
                <div>
                  <div style={{ color: "#666", fontSize: "11px", marginBottom: "2px" }}>You're likely paying in {isSE ? "estimated taxes" : "withholding"}</div>
                  <div style={{ fontSize: "22px", fontWeight: "700", fontFamily: "'DM Mono', monospace" }}>{fmt(estWithholding)}<span style={{ fontSize: "11px", color: "#555" }}>/yr</span></div>
                </div>
              </div>
              {overpayment > 100 && (
                <div style={{ marginTop: "14px", padding: "12px", background: "rgba(232,93,58,0.08)", borderRadius: "8px", border: "1px solid rgba(232,93,58,0.15)" }}>
                  <span style={{ color: "#e85d3a", fontWeight: "700", fontSize: "14px" }}>~{fmt(overpayment)}/year overpaid</span>
                  <div style={{ color: "#a06040", fontSize: "12px", marginTop: "3px" }}>That's an interest-free loan to the government.</div>
                </div>
              )}

              {/* Show the math for current */}
              <div onClick={() => toggleMath("current")} style={mathBtn()}>
                {expandedMath.current ? "Hide the math ▲" : "Show the math ▼"}
              </div>
              {expandedMath.current && (
                <div style={{ marginTop: "8px", padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid #1a1a1a" }}>
                  {mathRow("Gross income", fmt(income))}
                  {preTax > 0 && mathRow("− Pre-tax contributions", "−" + fmt(preTax))}
                  {mathRow("− Standard deduction", "−" + fmt(stdDed))}
                  {(isSE || isBoth) && mathRow("− SE tax deduction (half of SE tax)", "−" + fmt(seDeduction))}
                  {mathRow("= Taxable income", fmt(taxableIncome), true)}
                  {mathRow("Federal income tax (from brackets)", fmt(taxBeforeCredits))}
                  {totalCredits > 0 && mathRow(`− Tax credits (${kidsUnder17 > 0 ? kidsUnder17 + " child × $2,000" : ""}${kidsUnder17 > 0 && otherDeps > 0 ? " + " : ""}${otherDeps > 0 ? otherDeps + " dependent × $500" : ""})`, "−" + fmt(totalCredits), false, "#48bb78")}
                  {mathRow("= Federal tax you actually owe", fmt(actualTax), true, "#e85d3a")}
                  <div style={{ marginTop: "8px", borderTop: "1px solid #1e1e1e", paddingTop: "8px" }}>
                    {mathRow(`Estimated annual ${isSE ? "estimated payments" : "withholding"} (~115% of tax)`, fmt(estWithholding))}
                    {overpayment > 100 && mathRow("= You're overpaying by", fmt(overpayment), true, "#e85d3a")}
                  </div>
                </div>
              )}
            </div>

            {/* ===== LAYER 1 ===== */}
            <div style={{ padding: "18px", background: "linear-gradient(135deg, rgba(72,187,120,0.05), transparent)", borderRadius: "14px", marginBottom: "12px", border: "1px solid rgba(72,187,120,0.18)" }}>
              {hdr("1", "Optimize Within the System", "#48bb78", "ZERO RISK")}
              <div style={{ fontSize: "24px", fontWeight: "700", fontFamily: "'DM Mono', monospace", color: "#48bb78", marginBottom: "4px" }}>
                You withhold from the government {fmt(l1Savings)}<span style={{ fontSize: "13px", color: "#6aa87a" }}>/year</span>
              </div>
              <div style={{ color: "#999", fontSize: "13px", marginBottom: "4px" }}>
                <strong style={{ color: "#48bb78" }}>{isW2 ? fmtBw(l1Savings) + " more per paycheck" : fmtQ(l1Savings) + " more per quarter"}</strong>
              </div>
              <div style={{ color: "#888", fontSize: "13px", lineHeight: "1.6", marginTop: "8px" }}>
                {isW2 && "Stop overpaying through your paycheck. Adjust your W-4 and max out pre-tax accounts so the money builds your future — not the feds'."}
                {isSE && "Right-size your quarterly estimated payments and open retirement accounts that slash your taxable income. Self-employed people have bigger pre-tax options than W-2 workers."}
                {isBoth && "Adjust your W-4 AND recalculate your quarterly payments. You have access to more pre-tax vehicles than most people."}
              </div>

              <div onClick={() => toggleMath("l1")} style={mathBtn()}>
                {expandedMath.l1 ? "Hide the math ▲" : "How is this calculated? ▼"}
              </div>
              {expandedMath.l1 && (
                <div style={{ marginTop: "8px", padding: "12px", background: "rgba(72,187,120,0.04)", borderRadius: "8px", border: "1px solid rgba(72,187,120,0.1)" }}>
                  <div style={{ color: "#6aa87a", fontSize: "11px", marginBottom: "8px", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>Two things save you money:</div>
                  {overpayment > 100 && (<>
                    {mathRow(`1. Stop overpaying ${isSE ? "estimated taxes" : "withholding"}`, "")}
                    {mathRow(`   You currently pay`, fmt(estWithholding) + "/yr")}
                    {mathRow(`   You actually owe`, fmt(actualTax) + "/yr")}
                    {mathRow(`   = Your refund`, fmt(overpayment), true, "#48bb78")}
                  </>)}
                  {mathRow(`${overpayment > 100 ? "2" : "1"}. Max out pre-tax accounts`, "")}
                  {mathRow(`   You currently contribute`, fmt(preTax) + "/yr")}
                  {mathRow(`   You could contribute up to`, fmt(maxPreTax) + "/yr")}
                  {additionalPreTax > 0 && mathRow(`   = Additional pre-tax savings`, fmt(additionalPreTax))}
                  {mathRow(`   Tax reduction from more pre-tax`, fmt(l1TaxReduction), false, "#48bb78")}
                  <div style={{ marginTop: "8px", borderTop: "1px solid rgba(72,187,120,0.1)", paddingTop: "8px" }}>
                    {mathRow("Total you withhold from the government", fmt(l1Savings) + "/year", true, "#48bb78")}
                  </div>
                  {isSE && (
                    <div style={{ marginTop: "8px", color: "#6aa87a", fontSize: "11px", lineHeight: "1.5" }}>
                      SE pre-tax options: SEP-IRA (up to 25% of net SE income, max $66k), Solo 401k (up to $66-69k), HSA ($4,150)
                    </div>
                  )}
                </div>
              )}

              <div onClick={() => toggleSteps("l1")} style={nxtBtn("#48bb78")}>
                {expandedSteps.l1 ? "Hide Steps ▲" : "What's My Next Step? ▼"}
              </div>
              {expandedSteps.l1 && (
                <div style={{ marginTop: "12px", padding: "16px", background: "rgba(72,187,120,0.06)", borderRadius: "10px", border: "1px solid rgba(72,187,120,0.12)" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#48bb78", marginBottom: "14px", fontFamily: "'DM Mono', monospace" }}>Do These In Order</div>
                  {isW2 && (<>
                    {stp("1", <span><strong>Get a new W-4 from HR/payroll</strong> or download from irs.gov.</span>)}
                    {stp("2", <span><strong>Use the IRS Withholding Estimator</strong> (Google it). It tells you exactly what to put on your W-4 so you stop overpaying.</span>)}
                    {stp("3", <span><strong>Submit the new W-4.</strong> Takes effect in 1-2 pay periods.</span>)}
                    {stp("4", <span><strong>Max your 401k</strong> — log into benefits portal or ask HR. Max: $23,000/yr.</span>)}
                    {stp("5", <span><strong>Max your HSA</strong> if you have a high-deductible health plan. Max: $4,150/yr. Triple tax advantage.</span>)}
                  </>)}
                  {isSE && (<>
                    {stp("1", <span><strong>Recalculate your quarterly estimated payments</strong> using Form 1040-ES or the IRS worksheet. You may be overpaying significantly.</span>)}
                    {stp("2", <span><strong>Open a SEP-IRA.</strong> Up to 25% of net SE income, max $66k/yr. Open at Fidelity, Schwab, or Vanguard — 15 minutes online.</span>)}
                    {stp("3", <span><strong>Or open a Solo 401k</strong> for even higher limits ($66-69k/yr).</span>)}
                    {stp("4", <span><strong>Max your HSA</strong> if eligible. Max: $4,150/yr.</span>)}
                    {stp("5", <span><strong>Track every business expense.</strong> Mileage, home office, equipment, software — each one reduces SE tax AND income tax.</span>)}
                  </>)}
                  {isBoth && (<>
                    {stp("1", <span><strong>Adjust your W-4</strong> at your W-2 job using the IRS Withholding Estimator.</span>)}
                    {stp("2", <span><strong>Recalculate quarterly payments</strong> for your SE income.</span>)}
                    {stp("3", <span><strong>Max your employer 401k</strong> ($23k) AND open a SEP-IRA for SE income (up to 25% of net).</span>)}
                    {stp("4", <span><strong>Max your HSA</strong> if eligible.</span>)}
                    {stp("5", <span><strong>Track all SE expenses.</strong> Every deduction counts twice.</span>)}
                  </>)}
                  <div style={{ marginTop: "8px", padding: "10px 12px", background: "rgba(72,187,120,0.08)", borderRadius: "8px", fontSize: "12px", color: "#6aa87a", fontStyle: "italic" }}>
                    {isW2 ? "~30 minutes. Lunch break project." : isSE ? "~1-2 hours for accounts, then ongoing expense tracking." : "~1-2 hours. Start with whichever is easier."}
                  </div>
                </div>
              )}
            </div>

            {/* ===== LAYER 2 ===== */}
            <div style={{ padding: "18px", background: "linear-gradient(135deg, rgba(236,201,75,0.05), transparent)", borderRadius: "14px", marginBottom: "12px", border: "1px solid rgba(236,201,75,0.18)" }}>
              {hdr("2", "Legal But Aggressive", "#ecc94b", "LOW RISK")}
              <div style={{ fontSize: "24px", fontWeight: "700", fontFamily: "'DM Mono', monospace", color: "#ecc94b", marginBottom: "4px" }}>
                You withhold from the government {fmt(l2Savings)}<span style={{ fontSize: "13px", color: "#b0a040" }}>/year</span>
              </div>
              <div style={{ color: "#999", fontSize: "13px", marginBottom: "4px" }}>
                Tax bill drops to <strong style={{ color: "#ecc94b" }}>{fmt(l2Tax)}/year</strong>
              </div>
              <div style={{ color: "#888", fontSize: "13px", lineHeight: "1.6", marginTop: "8px" }}>
                Everything in Layer 1, plus redirect 10% of your income ({fmt(charitable)}) to qualified charitable causes. Mutual aid, legal defense funds, community orgs. Your money goes to your values instead of the government.
              </div>
              <div onClick={() => toggleSteps("l2")} style={nxtBtn("#ecc94b")}>
                {expandedSteps.l2 ? "Hide Steps ▲" : "What's My Next Step? ▼"}
              </div>
              {expandedSteps.l2 && (
                <div style={{ marginTop: "12px", padding: "16px", background: "rgba(236,201,75,0.06)", borderRadius: "10px", border: "1px solid rgba(236,201,75,0.12)" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#ecc94b", marginBottom: "14px", fontFamily: "'DM Mono', monospace" }}>Do These In Order</div>
                  {stp("1", <span><strong>Do everything in Layer 1 first.</strong></span>)}
                  {stp("2", <span><strong>Pick your causes.</strong> Must be 501(c)(3) orgs. Google any org + "501c3 status" to verify.</span>)}
                  {stp("3", <span><strong>Set up recurring donations.</strong> {fmt(charitable/12)}/month across orgs you believe in.</span>)}
                  {stp("4", <span><strong>Keep every receipt.</strong> Create a "2025 donations" folder.</span>)}
                  {stp("5", <span><strong>Itemize at tax time.</strong> Only saves money if total deductions exceed {fmt(stdDed)}. A tax preparer helps here.</span>)}
                  {stp("6", <span><strong>Need help with this process?</strong> Deciding where to send your money to have the greatest impact on society is its own skill. Book a session with Kandra below — we'll map it out together.</span>)}
                  <div style={{ marginTop: "8px", padding: "10px 12px", background: "rgba(236,201,75,0.08)", borderRadius: "8px", fontSize: "12px", color: "#b0a040", fontStyle: "italic" }}>
                    You choose where your money goes.
                  </div>
                </div>
              )}
            </div>

            {/* ===== LAYER 3 ===== */}
            <div style={{ padding: "20px", background: "linear-gradient(135deg, rgba(232,93,58,0.07), transparent)", borderRadius: "14px", marginBottom: "12px", border: "1px solid rgba(232,93,58,0.25)" }}>
              {hdr("3", isSE ? "Civil Disobedience: Stop Paying" : "Civil Disobedience: Claim Exempt", "#e85d3a", "REAL RISK")}
              <div style={{ fontSize: "13px", color: "#bbb", lineHeight: "1.6", marginBottom: "14px" }}>
                {isW2 && (<>Writing <strong style={{ color: "#e85d3a" }}>"Exempt"</strong> on your W-4 tells your employer to withhold <strong>$0 federal income tax</strong>. If you actually owe taxes, this is a false statement on a federal form. <strong>This is civil disobedience.</strong></>)}
                {isSE && (<>You simply <strong style={{ color: "#e85d3a" }}>stop sending quarterly estimated payments</strong> to the IRS. No form to file, no employer involved. You just keep your money. <strong>This is civil disobedience.</strong></>)}
                {isBoth && (<>Claim <strong style={{ color: "#e85d3a" }}>exempt</strong> on your W-4 AND stop sending quarterly estimated payments. <strong>This is civil disobedience.</strong></>)}
              </div>

              <div style={{ fontSize: "24px", fontWeight: "700", fontFamily: "'DM Mono', monospace", color: "#e85d3a", marginBottom: "4px" }}>
                You withhold from the government {isW2 ? fmtBw(exemptAnnual) : fmtQ(exemptAnnual)}<span style={{ fontSize: "13px", color: "#b06040" }}>{isW2 ? "/paycheck" : "/quarter"}</span>
              </div>
              <div style={{ color: "#999", fontSize: "13px", marginBottom: "14px" }}>
                {fmt(exemptAnnual)}/year stays in your account.{(isW2 || isBoth) ? " FICA (Social Security + Medicare) still comes out." : ""}
              </div>

              <div onClick={() => toggleRisk("risks")} style={{
                padding: "14px 16px", background: "rgba(232,93,58,0.06)", borderRadius: "10px",
                cursor: "pointer", border: "1px solid rgba(232,93,58,0.15)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: "700", fontSize: "14px", color: "#e85d3a" }}>Real Risks — What It Actually Costs You</div>
                  <span style={{ color: "#e85d3a", fontSize: "12px" }}>{expandedRisk === "risks" ? "▲" : "▼"}</span>
                </div>
                {expandedRisk !== "risks" && (
                  <div style={{ color: "#999", fontSize: "12px", marginTop: "4px" }}>
                    Max penalty: {fmt(totalRisk)} on top of {fmt(actualTax)} owed. Tap for breakdown.
                  </div>
                )}
                {expandedRisk === "risks" && (
                  <div style={{ marginTop: "12px", borderTop: "1px solid rgba(232,93,58,0.15)", paddingTop: "12px" }}>
                    {isSE && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e1e1e" }}>
                          <span style={{ color: "#bbb", fontSize: "13px" }}>W-4 penalty</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "#48bb78", fontWeight: "700", fontSize: "13px" }}>$0</span>
                        </div>
                        <div style={{ color: "#666", fontSize: "12px", padding: "2px 0 8px", lineHeight: "1.5" }}>No potential W-4 penalty like W-2 employees. Self-employed people don't file W-4s.</div>
                      </>
                    )}
                    {(isW2 || isBoth) && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e1e1e" }}>
                          <span style={{ color: "#bbb", fontSize: "13px" }}>False W-4 penalty (IRC §6682)</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "#e85d3a", fontWeight: "700", fontSize: "13px" }}>{fmt(falseW4Penalty)}</span>
                        </div>
                        <div style={{ color: "#666", fontSize: "12px", padding: "2px 0 8px", lineHeight: "1.5" }}>Flat $500 per false W-4. Per occurrence, not per paycheck.</div>
                      </>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e1e1e" }}>
                      <span style={{ color: "#bbb", fontSize: "13px" }}>Underpayment penalty (IRC §6654)</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: "#e85d3a", fontWeight: "700", fontSize: "13px" }}>{fmt(underpayPenalty)}</span>
                    </div>
                    <div style={{ color: "#666", fontSize: "12px", padding: "2px 0 8px", lineHeight: "1.5" }}>~8% annually on unpaid amount. Accrues quarterly.</div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e1e1e" }}>
                      <span style={{ color: "#bbb", fontSize: "13px", fontWeight: "700" }}>Total max penalty</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: "#e85d3a", fontWeight: "700", fontSize: "14px" }}>{fmt(totalRisk)}</span>
                    </div>
                    <div style={{ color: "#666", fontSize: "12px", padding: "2px 0 8px", lineHeight: "1.5" }}>On top of {fmt(actualTax)} owed. Worst case: {fmt(actualTax + totalRisk)}.</div>
                    {(isW2 || isBoth) && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e1e1e" }}>
                          <span style={{ color: "#bbb", fontSize: "13px" }}>IRS lock-in letter</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "#777", fontWeight: "600", fontSize: "13px" }}>Possible</span>
                        </div>
                        <div style={{ color: "#666", fontSize: "12px", padding: "2px 0 8px", lineHeight: "1.5" }}>IRS can force your employer to withhold. Requires active review.</div>
                      </>
                    )}
                    {isSE && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e1e1e" }}>
                          <span style={{ color: "#bbb", fontSize: "13px" }}>IRS lien/levy</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "#777", fontWeight: "600", fontSize: "13px" }}>Possible (slow)</span>
                        </div>
                        <div style={{ color: "#666", fontSize: "12px", padding: "2px 0 8px", lineHeight: "1.5" }}>IRS can place liens on property or levy bank accounts. Takes months to years with multiple notices first.</div>
                      </>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                      <span style={{ color: "#bbb", fontSize: "13px" }}>Criminal prosecution</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: "#555", fontWeight: "600", fontSize: "13px" }}>Extremely rare</span>
                    </div>
                    <div style={{ color: "#666", fontSize: "12px", padding: "2px 0", lineHeight: "1.5" }}>~2,000 criminal cases/yr out of 150M+ filers. Almost always large-scale fraud.</div>
                  </div>
                )}
              </div>

              <div onClick={() => toggleSteps("l3")} style={nxtBtn("#e85d3a")}>
                {expandedSteps.l3 ? "Hide Steps ▲" : "What's My Next Step? ▼"}
              </div>
              {expandedSteps.l3 && (
                <div style={{ marginTop: "12px", padding: "16px", background: "rgba(232,93,58,0.06)", borderRadius: "10px", border: "1px solid rgba(232,93,58,0.12)" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#e85d3a", marginBottom: "14px", fontFamily: "'DM Mono', monospace" }}>Step by Step</div>
                  {isW2 && (<>
                    {stp("1", <span><strong>Get a W-4 form</strong> from HR or irs.gov.</span>)}
                    {stp("2", <span><strong>Fill out Step 1 only:</strong> name, address, SSN, filing status.</span>)}
                    {stp("3", <span><strong>Skip Steps 2, 3, 4(a)-(b).</strong> Leave blank.</span>)}
                    {stp("4", <span><strong>Below Step 4(c), write "Exempt."</strong></span>)}
                    {stp("5", <span><strong>Sign, date, submit</strong> to HR/payroll.</span>)}
                    {stp("6", <span><strong>Check next paycheck.</strong> Federal Income Tax = $0. FICA still comes out.</span>)}
                  </>)}
                  {isSE && (<>
                    {stp("1", <span><strong>Stop sending quarterly payments.</strong> If you mail checks, stop. If you pay online via EFTPS or IRS Direct Pay, stop scheduling them.</span>)}
                    {stp("2", <span><strong>Cancel any automatic payments</strong> at eftps.gov or IRS Direct Pay.</span>)}
                    {stp("3", <span><strong>Consider keeping the money in a separate account</strong> for flexibility at filing time.</span>)}
                    {stp("4", <span><strong>That's it.</strong> No forms. No employer. You just keep your money.</span>)}
                  </>)}
                  {isBoth && (<>
                    {stp("1", <span><strong>W-2 job:</strong> Get a W-4, fill Step 1 only, write "Exempt" below Step 4(c), submit to HR.</span>)}
                    {stp("2", <span><strong>SE income:</strong> Stop sending quarterly estimated payments. Cancel auto-pay.</span>)}
                    {stp("3", <span><strong>Check next W-2 paycheck.</strong> FIT should show $0.</span>)}
                    {stp("4", <span><strong>Consider a separate savings account</strong> for flexibility at filing time.</span>)}
                  </>)}
                  <div style={{ marginTop: "10px", padding: "10px 12px", background: "rgba(232,93,58,0.08)", borderRadius: "8px", fontSize: "12px", color: "#b06040" }}>
                    <strong>Important:</strong> {(isW2 || isBoth) ? "Exempt W-4s expire February 15. " : ""}At tax time you'll owe {fmt(actualTax)}. Talk to a tax professional before filing. <strong>Don't wing that part.</strong>
                  </div>
                </div>
              )}
            </div>

            {/* ===== COLLECTIVE IMPACT ===== */}
            <div style={{ padding: "20px", background: "linear-gradient(135deg, rgba(180,130,255,0.06), transparent)", borderRadius: "14px", marginBottom: "12px", border: "1px solid rgba(180,130,255,0.2)" }}>
              <div style={{ fontWeight: "700", fontSize: "18px", color: "#b482ff", fontFamily: "'Instrument Serif', serif", marginBottom: "4px" }}>
                What Happens When We Act Together
              </div>
              <p style={{ color: "#888", fontSize: "13px", marginBottom: "18px", lineHeight: "1.5" }}>
                What happens when people collectively withhold their money from the US government? Here are the numbers by population:
              </p>
              <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
                {[
                  { id: "l1", label: "Optimize", color: "#48bb78" },
                  { id: "l2", label: "Redirect", color: "#ecc94b" },
                  { id: "l3", label: "Withhold", color: "#e85d3a" },
                ].map(tab => (
                  <div key={tab.id} onClick={() => setActiveImpactTab(tab.id)} style={{
                    flex: 1, padding: "10px 8px", borderRadius: "8px", textAlign: "center",
                    cursor: "pointer", fontSize: "13px", fontWeight: "700",
                    background: activeImpactTab === tab.id ? tab.color + "18" : "rgba(255,255,255,0.03)",
                    color: activeImpactTab === tab.id ? tab.color : "#666",
                    border: activeImpactTab === tab.id ? `1px solid ${tab.color}44` : "1px solid #1e1e1e",
                  }}>{tab.label}</div>
                ))}
              </div>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "14px", lineHeight: "1.5" }}>{activeImp.desc}</div>
              {activeImp.rows.map(r => (
                <div key={r.pct} style={{ padding: "14px", background: activeImp.color + "08", borderRadius: "10px", marginBottom: "8px", border: `1px solid ${activeImp.color}18` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "3px" }}>
                    <span style={{ fontWeight: "700", color: activeImp.color, fontSize: "15px" }}>{r.pct} ({r.n})</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: "700", color: activeImp.color, fontSize: "16px" }}>{fmtBig(r.annual)}/yr</span>
                  </div>
                  <div style={{ color: "#777", fontSize: "12px" }}>{fmtBig(r.annual / 26)} every two weeks</div>
                </div>
              ))}
              <div style={{ marginTop: "14px", padding: "12px", background: "rgba(180,130,255,0.05)", borderRadius: "8px", color: "#a88acc", fontSize: "13px", lineHeight: "1.6" }}>
                The IRS has ~80,000 employees and audits &lt;0.5% of returns. They are not staffed for mass collective action — especially after recent budget cuts.
              </div>
            </div>

            {/* ===== HISTORY ===== */}
            <div style={{ padding: "18px", background: "rgba(255,255,255,0.03)", borderRadius: "14px", marginBottom: "14px", border: "1px solid #1e1e1e" }}>
              <div style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "#888", marginBottom: "12px", fontFamily: "'DM Mono', monospace" }}>People Have Always Done This</div>
              <div style={{ color: "#bbb", fontSize: "14px", lineHeight: "1.8", fontFamily: "'Instrument Serif', serif" }}>
                <p style={{ margin: "0 0 10px" }}>
                  War tax resistance has been organized since at least World War II. <strong>Wally Nelson</strong> — a Black pacifist, civil rights activist, and conscientious objector — refused to pay federal taxes beginning in the 1940s. He and his wife, <strong>Juanita Nelson</strong>, lived long and full lives as war tax resisters, farming and organizing for decades. They are considered founders of the modern war tax resistance movement.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  Since then, thousands have withheld some or all of their federal income taxes — during Vietnam, during Iraq, and now. The <strong>National War Tax Resistance Coordinating Committee</strong> (NWTRCC) has supported resisters since 1982. War tax resistance is an international movement, with organizations across the globe.
                </p>
                <p style={{ margin: "0 0 10px" }}>Thoreau refused to pay over slavery. Suffragists organized under "no taxation without representation."</p>
                <p style={{ margin: 0, color: "#888" }}>Individual resistance is powerful. But collective resistance is what changes systems. The more people who know their options, the more leverage we all have.</p>
                <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#555", fontStyle: "italic", fontFamily: "'Syne', sans-serif" }}>More on the history of war tax resistance coming soon.</p>
              </div>
            </div>

            {/* CTA */}
            <div style={{ padding: "20px", background: "linear-gradient(135deg, rgba(232,93,58,0.06), transparent)", borderRadius: "14px", marginBottom: "14px", border: "1px solid rgba(232,93,58,0.2)", textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px", fontFamily: "'Instrument Serif', serif" }}>Want help navigating this?</div>
              <div style={{ color: "#999", fontSize: "13px", marginBottom: "16px", lineHeight: "1.5" }}>
                Book a session with Kandra Finances. Sliding scale pricing.<br />Education over dependency. Your money, your decisions.
              </div>
              <a href="https://kandrafinances.com" target="_blank" rel="noopener noreferrer" style={{
                display: "inline-block", padding: "12px 28px", background: "#e85d3a", color: "#0a0a0a",
                borderRadius: "10px", fontSize: "15px", fontWeight: "700", textDecoration: "none", fontFamily: "'Syne', sans-serif",
              }}>Book a Session</a>
            </div>

            <div style={{ padding: "14px", textAlign: "center" }}>
              <div style={{ color: "#444", fontSize: "11px", lineHeight: "1.6", fontStyle: "italic" }}>
                Financial education, not financial advice. Not legal counsel. Consult a tax professional for your situation. ✊
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
              <button onClick={goBack} style={{ ...btnSt, flex: 1 }}>← Back</button>
              <button onClick={restart} style={{ ...btnSt, flex: 1 }}>Start Over</button>
            </div>
          </div>
        )}

        {currentStep !== "results" && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px", paddingBottom: "40px" }}>
            {step > 0 ? <button onClick={goBack} style={btnSt}>← Back</button> : <div />}
            <button onClick={next} disabled={!canProceed()} style={{ ...btnP, opacity: canProceed() ? 1 : 0.4, cursor: canProceed() ? "pointer" : "not-allowed" }}>
              {step === STEPS.length - 2 ? "Show My Options" : "Continue"}
            </button>
          </div>
        )}

        <div style={{ height: "40px" }} />
      </div>
    </div>
  );
}
