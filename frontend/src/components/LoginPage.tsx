import { useState } from "react";
import { authLogin, setToken } from "../api";

interface Props {
  onDone: (username: string) => void;
}

export default function LoginPage({ onDone }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) { setError("Enter username and password"); return; }
    setLoading(true);
    setError(null);
    try {
      const tok = await authLogin(username.trim(), password);
      setToken(tok.access_token);
      onDone(tok.username);
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <DiskIcon />
        <h1 style={{ fontWeight: 800, fontSize: "1.4rem", margin: "0.75rem 0 0.25rem" }}>
          DiskWatch
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "1.5rem" }}>
          Sign in to continue
        </p>

        <div style={{ marginBottom: "0.75rem", width: "100%" }}>
          <label style={{ display: "block", color: "#64748b", fontSize: "0.72rem", marginBottom: 4 }}>
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
        </div>

        <div style={{ marginBottom: "0.75rem", width: "100%" }}>
          <label style={{ display: "block", color: "#64748b", fontSize: "0.72rem", marginBottom: 4 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
        </div>

        {error && <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0.25rem 0" }}>{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={loading}
          style={btnStyle(loading)}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0f172a",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const cardStyle: React.CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 14,
  padding: "2rem",
  width: "100%",
  maxWidth: 340,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 7,
  color: "#e2e8f0",
  padding: "0.5rem 0.75rem",
  fontSize: "0.85rem",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  marginTop: "0.75rem",
  width: "100%",
  background: disabled ? "#334155" : "#1d4ed8",
  color: disabled ? "#64748b" : "#eff6ff",
  border: "none",
  borderRadius: 8,
  padding: "0.6rem 1rem",
  fontWeight: 700,
  fontSize: "0.85rem",
  cursor: disabled ? "not-allowed" : "pointer",
});

function DiskIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}
