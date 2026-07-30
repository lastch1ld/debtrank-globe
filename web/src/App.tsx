import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Globe } from "./components/Globe";
import { runDebtRank, type DebtRankResult } from "./lib/debtrank";
import { buildExposureNetwork, countries } from "./lib/network";
import "./App.css";

function App() {
  const network = useMemo(() => buildExposureNetwork(), []);
  const [shockedId, setShockedId] = useState<string | null>(null);
  const [result, setResult] = useState<DebtRankResult | null>(null);
  const [iteration, setIteration] = useState(0);
  const timerRef = useRef<number | null>(null);

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  function triggerShock(id: string) {
    if (timerRef.current) window.clearInterval(timerRef.current);
    const res = runDebtRank(network, { [id]: 1.0 });
    setShockedId(id);
    setResult(res);
    setIteration(0);

    timerRef.current = window.setInterval(() => {
      setIteration((prev) => {
        if (prev >= res.history.length - 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, 500);
  }

  function reset() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setShockedId(null);
    setResult(null);
    setIteration(0);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const distress = result ? result.history[iteration] : new Array(countries.length).fill(0);

  const ranked = useMemo(() => {
    if (!result) return [];
    return result.nodeIds
      .map((id, i) => ({ id, name: countries.find((c) => c.id === id)?.name ?? id, level: distress[i] }))
      .filter((r) => r.level > 1e-6)
      .sort((a, b) => b.level - a.level);
  }, [result, distress]);

  return (
    <div className="app">
      <div className="globe-pane">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <Globe distress={distress} shockedId={shockedId} onSelect={triggerShock} />
        </Canvas>
      </div>

      <aside className="panel">
        <h1>debtrank-globe</h1>
        <p className="subtitle">
          Sovereign external debt contagion, modeled with DebtRank on real
          World Bank + BIS cross-border exposure data. Click a country on the
          globe (or pick one below) to simulate a full default and watch
          distress propagate through the network.
        </p>

        <div className="controls">
          <select
            value={shockedId ?? ""}
            onChange={(e) => e.target.value && triggerShock(e.target.value)}
          >
            <option value="">Select a country to shock...</option>
            {sortedCountries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={reset} disabled={!result}>
            Reset
          </button>
        </div>

        {result && (
          <div className="results">
            <p>
              Iteration {iteration} / {result.history.length - 1} &middot; Aggregate
              DebtRank impact: <strong>{result.debtrank.toFixed(4)}</strong>
            </p>
            <ol>
              {ranked.map((r) => (
                <li key={r.id}>
                  <span>{r.name}</span>
                  <span className="level">{(r.level * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </aside>
    </div>
  );
}

export default App;
