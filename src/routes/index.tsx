import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { design, fmt, netlist, type Topology, type Inputs } from "@/lib/psu";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Buck/Boost Designer — Power Supply Calculator" },
      { name: "description", content: "Enter Vin, Vout and load current to get buck/boost component values, LTspice netlists, efficiency and ripple reports." },
      { property: "og:title", content: "Buck/Boost Designer" },
      { property: "og:description", content: "Component values, LTspice netlist, efficiency and ripple in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Field({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center border border-border bg-card focus-within:border-primary">
        <input type="number" step="any" value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full bg-transparent px-3 py-2 font-mono text-lg outline-none" />
        <span className="px-3 font-mono text-sm text-muted-foreground">{unit}</span>
      </div>
    </label>
  );
}

function Stat({ k, v, hi }: { k: string; v: string; hi?: boolean }) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{k}</div>
      <div className={`mt-1 font-mono text-2xl ${hi ? "text-primary" : ""}`}>{v}</div>
    </div>
  );
}

function Index() {
  const [t, setT] = useState<Topology>("buck");
  const [p, setP] = useState<Inputs>({ vin: 12, vout: 5, iout: 2, fsw: 500000, rippleI: 0.3, rippleV: 0.01 });
  const set = (k: keyof Inputs) => (n: number) => setP({ ...p, [k]: isNaN(n) ? 0 : n });
  const ok = p.vin > 0 && p.vout > 0 && p.iout > 0 && p.fsw > 0 && p.rippleI > 0 && p.rippleV > 0;
  const r = useMemo(() => (ok ? design(t, p) : null), [t, p, ok]);
  const net = r ? netlist(t, p, r) : "";

  const download = () => {
    const url = URL.createObjectURL(new Blob([net], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${t}_${p.vin}V_to_${p.vout}V.cir`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between">
          <h1 className="font-mono text-xl font-bold tracking-tight"><span className="text-primary">⏚</span> SMPS/Designer</h1>
          <span className="font-mono text-xs text-muted-foreground">buck · boost · ltspice</span>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="grid grid-cols-2 border border-border">
            {(["buck", "boost"] as Topology[]).map((x) => (
              <button key={x} onClick={() => setT(x)}
                className={`py-2 font-mono uppercase ${t === x ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{x}</button>
            ))}
          </div>
          <Field label="Input voltage" unit="V" value={p.vin} onChange={set("vin")} />
          <Field label="Output voltage" unit="V" value={p.vout} onChange={set("vout")} />
          <Field label="Load current" unit="A" value={p.iout} onChange={set("iout")} />
          <Field label="Switching freq" unit="Hz" value={p.fsw} onChange={set("fsw")} />
          <Field label="Inductor ripple" unit="×IL" value={p.rippleI} onChange={set("rippleI")} />
          <Field label="Output ripple" unit="×Vout" value={p.rippleV} onChange={set("rippleV")} />
          <p className="text-xs text-muted-foreground">Loss model assumes Rds(on) 20 mΩ, diode Vf 0.4 V, DCR 15 mΩ, ESR 10 mΩ, 20 ns edges.</p>
        </aside>

        {!r ? <p className="text-muted-foreground">Enter positive values for all inputs.</p> : (
          <section className="space-y-8">
            {!r.valid && (
              <div className="border border-destructive p-3 text-sm text-destructive">
                A {t} converter needs Vout {t === "buck" ? "<" : ">"} Vin. Switch topology.
              </div>
            )}
            <div>
              <h2 className="mb-3 font-mono text-sm uppercase tracking-widest text-muted-foreground">Components</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat k="Inductor (E12)" v={fmt(r.L, "H")} hi />
                <Stat k="Output cap (E12)" v={fmt(r.C, "F")} hi />
                <Stat k="Input cap" v={fmt(r.cin, "F")} />
                <Stat k="Duty cycle" v={`${(r.D * 100).toFixed(1)} %`} />
                <Stat k="L calculated" v={fmt(r.Lcalc, "H")} />
                <Stat k="C calculated" v={fmt(r.Ccalc, "F")} />
                <Stat k="Peak switch I" v={fmt(r.ipk, "A")} />
                <Stat k="Input current" v={fmt(r.iin, "A")} />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h2 className="mb-3 font-mono text-sm uppercase tracking-widest text-muted-foreground">Efficiency report</h2>
                <div className="border border-border bg-card p-4">
                  <div className="font-mono text-5xl text-primary">{(r.eff * 100).toFixed(1)}%</div>
                  <div className="mt-1 text-sm text-muted-foreground">Pout {fmt(r.pOut, "W")} · Loss {fmt(r.pLoss, "W")}</div>
                  <div className="mt-4 space-y-2">
                    {Object.entries(r.losses).map(([k, v]) => (
                      <div key={k}>
                        <div className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{fmt(v, "W")}</span></div>
                        <div className="h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${(v / r.pLoss) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <h2 className="mb-3 font-mono text-sm uppercase tracking-widest text-muted-foreground">Ripple report</h2>
                <div className="space-y-3">
                  <Stat k="Inductor ripple ΔIL" v={`${fmt(r.dIa, "A")} p-p`} />
                  <Stat k="Output ripple ΔVout" v={`${fmt(r.vRipple, "V")} p-p`} hi />
                  <Stat k="Ripple / Vout" v={`${((r.vRipple / p.vout) * 100).toFixed(2)} %`} />
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">LTspice netlist</h2>
                <button onClick={download} className="bg-primary px-4 py-2 font-mono text-sm text-primary-foreground hover:opacity-90">Download .cir</button>
              </div>
              <pre className="overflow-x-auto border border-border bg-card p-4 font-mono text-xs leading-relaxed">{net}</pre>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
