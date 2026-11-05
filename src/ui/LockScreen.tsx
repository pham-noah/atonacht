import { useEffect } from "react";
import { Logo } from "./common";

export function LockScreen({ error, onUnlock }: { error: string; onUnlock: () => void }) {
  useEffect(() => { onUnlock(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="lockscreen" role="dialog" aria-label="Atonacht is locked">
      <Logo size={88} />
      <div className="brandname">Atonacht</div>
      <p className="muted">Locked</p>
      {error && <p className="errtext">{error}</p>}
      <button className="btn big" onClick={onUnlock}>Unlock</button>
    </div>
  );
}
