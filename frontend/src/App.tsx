import { useCallback, useEffect, useState } from "react";
import type {
  DiskListItem,
  DiskDetail,
  TemperaturePoint,
  HealthSummary,
} from "./api";
import {
  clearToken,
  changePassword,
  deleteDisk,
  fetchAuthStatus,
  fetchHealth,
  fetchDisks,
  fetchDisk,
  fetchMe,
  fetchTemperatureHistory,
  getToken,
  onUnauthorized,
  setToken,
  triggerScan,
} from "./api";
import DiskCard from "./components/DiskCard";
import DiskDetailView from "./components/DiskDetail";
import AlertsPage from "./components/AlertsPage";
import LoginPage from "./components/LoginPage";
import SetupPage from "./components/SetupPage";

type View = "dashboard" | "detail" | "alerts";
type AuthState = "loading" | "setup" | "login" | "authenticated";

export default function App() {
  // ── All hooks first (React rules of hooks — no hooks after early returns) ────
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [authUser, setAuthUser] = useState<string | null>(null);

  const [view, setView] = useState<View>("dashboard");
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [disks, setDisks] = useState<DiskListItem[]>([]);
  const [diskDetails, setDiskDetails] = useState<Map<number, DiskDetail>>(new Map());
  const [tempHistories7d, setTempHistories7d] = useState<Map<number, TemperaturePoint[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tempHistory30d, setTempHistory30d] = useState<TemperaturePoint[]>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    onUnauthorized.handler = () => {
      clearToken();
      setAuthState("login");
      setAuthUser(null);
    };
    void checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const status = await fetchAuthStatus();
      if (status.setup_required) { setAuthState("setup"); return; }
    } catch { setAuthState("login"); return; }

    if (!getToken()) { setAuthState("login"); return; }
    try {
      const me = await fetchMe();
      setAuthUser(me.username);
      setAuthState("authenticated");
    } catch {
      clearToken();
      setAuthState("login");
    }
  };

  const handleAuthDone = (username: string) => {
    setAuthUser(username);
    setAuthState("authenticated");
  };

  const handleLogout = () => {
    clearToken();
    setAuthUser(null);
    setAuthState("login");
  };

  // ── Load dashboard ────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, diskList] = await Promise.all([fetchHealth(), fetchDisks()]);
      setHealth(h);
      setDisks(diskList);

      // Fetch details + 7-day temps for each disk in parallel
      const [details, histories] = await Promise.all([
        Promise.all(diskList.map((d) => fetchDisk(d.id).catch(() => null))),
        Promise.all(
          diskList.map((d) => fetchTemperatureHistory(d.id, 7).catch(() => [])),
        ),
      ]);

      const detailMap = new Map<number, DiskDetail>();
      const histMap = new Map<number, TemperaturePoint[]>();
      diskList.forEach((d, i) => {
        const det = details[i];
        if (det) detailMap.set(d.id, det);
        histMap.set(d.id, histories[i]);
      });
      setDiskDetails(detailMap);
      setTempHistories7d(histMap);
    } catch {
      setError("Could not reach the DiskWatch API. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authState === "authenticated") void loadDashboard();
  }, [authState, loadDashboard]);

  // Auto-refresh dashboard data every 5 minutes
  useEffect(() => {
    if (authState !== "authenticated") return;
    const id = setInterval(() => void loadDashboard(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [authState, loadDashboard]);

  // ── Auth gates (after all hooks) ─────────────────────────────────────────────
  if (authState === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#475569" }}>Loading…</span>
      </div>
    );
  }
  if (authState === "setup") return <SetupPage onDone={handleAuthDone} />;
  if (authState === "login") return <LoginPage onDone={handleAuthDone} />;

  // ── Scan ──────────────────────────────────────────────────────────────────────
  const scan = async () => {
    setScanning(true);
    try {
      await triggerScan();
      await loadDashboard();
      // Refresh 30d history if a detail view is open
      if (selectedId != null) {
        const h = await fetchTemperatureHistory(selectedId, 30).catch(() => []);
        setTempHistory30d(h);
      }
    } finally {
      setScanning(false);
    }
  };

  // ── Open detail ───────────────────────────────────────────────────────────────
  const openDetail = async (id: number) => {
    setSelectedId(id);
    setView("detail");
    // Fetch 30-day temp history for detail chart
    const h = await fetchTemperatureHistory(id, 30).catch(() => []);
    setTempHistory30d(h);
  };

  const closeDetail = () => {
    setView("dashboard");
    setSelectedId(null);
    setTempHistory30d([]);
  };

  const handleDeleteDisk = async (id: number) => {
    await deleteDisk(id);
    setDisks((prev) => prev.filter((d) => d.id !== id));
    setDiskDetails((prev) => { const m = new Map(prev); m.delete(id); return m; });
    setTempHistories7d((prev) => { const m = new Map(prev); m.delete(id); return m; });
    if (selectedId === id) closeDetail();
  };

  const selectedDisk = selectedId != null ? diskDetails.get(selectedId) ?? null : null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <Header
        health={health}
        scanning={scanning}
        onScan={scan}
        activeView={view === "detail" ? "dashboard" : view}
        onNav={(v) => {
          if (v === "dashboard") closeDetail();
          else setView(v);
        }}
        username={authUser}
        onLogout={handleLogout}
        onChangePassword={() => setShowPasswordModal(true)}
      />

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
        {error && (
          <div
            style={{
              background: "#450a0a",
              border: "1px solid #ef4444",
              borderRadius: 8,
              padding: "0.75rem 1rem",
              marginBottom: "1.5rem",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        {view === "dashboard" && (
          <>
            {loading && disks.length === 0 && (
              <p style={{ color: "#475569" }}>Loading…</p>
            )}
            {!loading && disks.length === 0 && !error && (
              <p style={{ color: "#475569" }}>
                No disks found. Click <strong>Scan now</strong> to discover drives.
              </p>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "1rem",
              }}
            >
              {disks.map((disk) => (
                <DiskCard
                  key={disk.id}
                  disk={disk}
                  detail={diskDetails.get(disk.id) ?? null}
                  sparkData={tempHistories7d.get(disk.id) ?? []}
                  onClick={() => void openDetail(disk.id)}
                  onDelete={() => void handleDeleteDisk(disk.id)}
                />
              ))}
            </div>
          </>
        )}

        {view === "detail" && selectedDisk && (
          <DiskDetailView
            disk={selectedDisk}
            tempHistory={tempHistory30d}
            onBack={closeDetail}
          />
        )}

        {view === "detail" && !selectedDisk && !loading && (
          <p style={{ color: "#475569" }}>Disk not found. <button onClick={closeDetail} style={{ color: "#38bdf8", background: "none", border: "none", cursor: "pointer" }}>Go back</button></p>
        )}

        {view === "alerts" && <AlertsPage />}
      </main>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({
  health,
  scanning,
  onScan,
  activeView,
  onNav,
  username,
  onLogout,
  onChangePassword,
}: {
  health: HealthSummary | null;
  scanning: boolean;
  onScan: () => void;
  activeView: "dashboard" | "alerts";
  onNav: (v: "dashboard" | "alerts") => void;
  username: string | null;
  onLogout: () => void;
  onChangePassword: () => void;
}) {
  const unread = health?.unacknowledged_alerts ?? 0;

  return (
    <header
      style={{
        background: "#0d1829",
        borderBottom: "1px solid #1e293b",
        padding: "0.75rem 1rem",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        {/* Logo + nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DiskIcon />
            <span style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.01em" }}>
              DiskWatch
            </span>
          </div>

          {/* Nav tabs */}
          <nav style={{ display: "flex", gap: "0.2rem" }}>
            <NavTab label="Dashboard" active={activeView === "dashboard"} onClick={() => onNav("dashboard")} />
            <NavTab
              label="Alerts"
              active={activeView === "alerts"}
              badge={unread > 0 ? unread : undefined}
              onClick={() => onNav("alerts")}
            />
          </nav>

          <SystemStatus health={health} />
        </div>

        {/* Right side: last scan + scan btn + user */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {health?.last_scan_at && (
            <span style={{ color: "#475569", fontSize: "0.78rem" }}>
              Last scan: {relativeTime(health.last_scan_at)}
            </span>
          )}
          <button
            onClick={onScan}
            disabled={scanning}
            style={{
              background: scanning ? "#1e293b" : "#1d4ed8",
              color: scanning ? "#475569" : "#eff6ff",
              border: "none",
              borderRadius: 7,
              padding: "0.45rem 1rem",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: scanning ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {scanning ? "Scanning…" : "Scan now"}
          </button>
          {username && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "#64748b", fontSize: "0.78rem" }}>{username}</span>
              <button
                onClick={onChangePassword}
                title="Change password"
                style={{
                  background: "transparent",
                  border: "1px solid #334155",
                  color: "#64748b",
                  borderRadius: 6,
                  padding: "0.25rem 0.6rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Password
              </button>
              <button
                onClick={onLogout}
                title="Sign out"
                style={{
                  background: "transparent",
                  border: "1px solid #334155",
                  color: "#64748b",
                  borderRadius: 6,
                  padding: "0.25rem 0.6rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NavTab({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#1e293b" : "transparent",
        border: `1px solid ${active ? "#334155" : "transparent"}`,
        color: active ? "#e2e8f0" : "#64748b",
        borderRadius: 7,
        padding: "0.3rem 0.8rem",
        fontWeight: active ? 600 : 400,
        fontSize: "0.82rem",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        transition: "color 0.15s",
      }}
    >
      {label}
      {badge != null && (
        <span
          style={{
            background: "#ef4444",
            color: "#fff",
            borderRadius: 10,
            padding: "0 5px",
            fontSize: "0.65rem",
            fontWeight: 700,
            lineHeight: "16px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function SystemStatus({ health }: { health: HealthSummary | null }) {
  if (!health) return null;

  if (health.total_disks === 0) {
    return <StatusPill color="#475569" dot="#64748b" text="No disks detected" />;
  }
  if (health.failed > 0) {
    return (
      <StatusPill
        color="#fca5a5"
        dot="#ef4444"
        text={`CRITICAL — ${health.failed} disk${health.failed > 1 ? "s" : ""} failed`}
        bg="#450a0a"
      />
    );
  }
  if (health.unknown > 0) {
    return (
      <StatusPill
        color="#fcd34d"
        dot="#f59e0b"
        text={`${health.unknown} disk${health.unknown > 1 ? "s" : ""} need attention`}
        bg="#451a03"
      />
    );
  }
  return (
    <StatusPill
      color="#86efac"
      dot="#22c55e"
      text={`All ${health.total_disks} disk${health.total_disks > 1 ? "s" : ""} healthy`}
      bg="#052e16"
    />
  );
}

function StatusPill({
  color,
  dot,
  text,
  bg,
}: {
  color: string;
  dot: string;
  text: string;
  bg?: string;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        background: bg ?? "transparent",
        borderRadius: 20,
        padding: bg ? "0.25rem 0.75rem" : 0,
        fontSize: "0.82rem",
        color,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dot,
          flexShrink: 0,
          boxShadow: `0 0 6px ${dot}`,
        }}
      />
      {text}
    </div>
  );
}

function DiskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!current || !next) { setError("All fields are required"); return; }
    if (next.length < 6) { setError("New password must be at least 6 characters"); return; }
    if (next !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: "#1e293b", border: "1px solid #334155", borderRadius: 14,
        padding: "1.75rem", width: "100%", maxWidth: 360,
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "1.25rem" }}>
          Change Password
        </h2>

        {done ? (
          <>
            <p style={{ color: "#4ade80", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Password changed successfully.
            </p>
            <button onClick={onClose} style={pwBtnStyle(false)}>Close</button>
          </>
        ) : (
          <>
            {(["Current password", "New password", "Confirm new password"] as const).map((label, i) => {
              const val = [current, next, confirm][i];
              const set = [setCurrent, setNext, setConfirm][i];
              return (
                <div key={label} style={{ marginBottom: "0.75rem" }}>
                  <label style={{ display: "block", color: "#64748b", fontSize: "0.72rem", marginBottom: 4 }}>
                    {label}
                  </label>
                  <input
                    type="password"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void submit()}
                    style={{
                      width: "100%", background: "#0f172a", border: "1px solid #334155",
                      borderRadius: 7, color: "#e2e8f0", padding: "0.5rem 0.75rem",
                      fontSize: "0.85rem", fontFamily: "inherit", boxSizing: "border-box",
                    }}
                  />
                </div>
              );
            })}
            {error && <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0.25rem 0 0.5rem" }}>{error}</p>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button onClick={onClose} style={{ ...pwBtnStyle(false), background: "#334155", color: "#94a3b8" }}>
                Cancel
              </button>
              <button onClick={() => void submit()} disabled={loading} style={pwBtnStyle(loading)}>
                {loading ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const pwBtnStyle = (disabled: boolean): React.CSSProperties => ({
  flex: 1, background: disabled ? "#334155" : "#1d4ed8",
  color: disabled ? "#64748b" : "#eff6ff",
  border: "none", borderRadius: 8, padding: "0.55rem 1rem",
  fontWeight: 700, fontSize: "0.85rem",
  cursor: disabled ? "not-allowed" : "pointer",
});

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}
