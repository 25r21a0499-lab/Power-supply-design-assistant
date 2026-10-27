export type Topology = "buck" | "boost";
export interface Inputs { vin: number; vout: number; iout: number; fsw: number; rippleI: number; rippleV: number; }

const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export function nextStd(x: number) {
  if (!(x > 0)) return x;
  const d = Math.pow(10, Math.floor(Math.log10(x)));
  for (const v of E12) if (v * d >= x * 0.999) return v * d;
  return 10 * d;
}

export function design(t: Topology, p: Inputs) {
  const { vin, vout, iout, fsw } = p;
  const valid = t === "buck" ? vout < vin : vout > vin;
  const D = t === "buck" ? vout / vin : 1 - vin / vout;
  const iin = t === "buck" ? iout * D : iout / (1 - D);
  const iL = t === "buck" ? iout : iin;
  const dI = Math.max(iL * p.rippleI, 1e-3);
  const Lcalc = t === "buck" ? (vout * (1 - D)) / (dI * fsw) : (vin * D) / (dI * fsw);
  const L = nextStd(Lcalc);
  const dIa = t === "buck" ? (vout * (1 - D)) / (L * fsw) : (vin * D) / (L * fsw);
  const dV = vout * p.rippleV;
  const Ccalc = t === "buck" ? dIa / (8 * fsw * dV) : (iout * D) / (fsw * dV);
  const C = nextStd(Ccalc);
  const esr = 0.01;
  const vRipple = t === "buck" ? dIa / (8 * fsw * C) + dIa * esr : (iout * D) / (fsw * C) + (iL + dIa / 2) * esr;
  const ipk = iL + dIa / 2;
  // losses
  const rds = 0.02, vf = 0.4, dcr = 0.015, tr = 20e-9, cin = 10e-6;
  const irms = Math.sqrt(iL * iL + (dIa * dIa) / 12);
  const pCond = irms * irms * rds * D;
  const vsw = t === "buck" ? vin : vout;
  const pSw = 0.5 * vsw * iL * tr * 2 * fsw;
  const pDiode = vf * iL * (1 - D);
  const pL = irms * irms * dcr;
  const pOut = vout * iout;
  const losses = { "MOSFET conduction": pCond, "MOSFET switching": pSw, "Diode": pDiode, "Inductor DCR": pL };
  const pLoss = Object.values(losses).reduce((a, b) => a + b, 0);
  const eff = pOut / (pOut + pLoss);
  const rload = vout / iout;
  return { valid, D, iin, iL, L, Lcalc, C, Ccalc, dIa, vRipple, ipk, losses, pLoss, pOut, eff, rload, cin, esr, rds, vf, dcr };
}

export const fmt = (v: number, u: string) => {
  const s: [number, string][] = [[1e-9, "n"], [1e-6, "µ"], [1e-3, "m"], [1, ""], [1e3, "k"]];
  let pick: [number, string] = s[0]!;
  for (const x of s) if (Math.abs(v) >= x[0]) pick = x;
  return `${(v / pick[0]).toPrecision(3)} ${pick[1]}${u}`;
};

export function netlist(t: Topology, p: Inputs, r: ReturnType<typeof design>) {
  const per = 1 / p.fsw, ton = r.D * per;
  const tstop = Math.max(200 * per, 2e-3);
  const head = `* ${t.toUpperCase()} converter — auto-generated\n* Vin=${p.vin}V Vout=${p.vout}V Iout=${p.iout}A fsw=${p.fsw}Hz D=${r.D.toFixed(3)}\nV1 in 0 ${p.vin}\nVg g 0 PULSE(0 10 0 10n 10n ${ton.toExponential(4)} ${per.toExponential(4)})\n`;
  const body = t === "buck"
    ? `S1 in sw g 0 SW1\nD1 0 sw DS\nL1 sw out ${r.L.toExponential(3)} Rser=${r.dcr}\nC1 out 0 ${r.C.toExponential(3)} Rser=${r.esr}\n`
    : `L1 in sw ${r.L.toExponential(3)} Rser=${r.dcr}\nS1 sw 0 g 0 SW1\nD1 sw out DS\nC1 out 0 ${r.C.toExponential(3)} Rser=${r.esr}\n`;
  return head + body + `Cin in 0 ${r.cin}\nRload out 0 ${r.rload.toFixed(4)}\n.model SW1 SW(Ron=${r.rds} Roff=1Meg Vt=5)\n.model DS D(Is=1e-5 Rs=0.01 N=1)\n.tran 0 ${tstop.toExponential(3)} ${(tstop * 0.8).toExponential(3)} ${(per / 50).toExponential(3)} startup\n.meas TRAN Vavg AVG V(out)\n.meas TRAN Vpp PP V(out)\n.meas TRAN Pin AVG -V(in)*I(V1)\n.meas TRAN Pout AVG V(out)*I(Rload)\n.meas TRAN Eff PARAM Pout/Pin\n.end\n`;
}
