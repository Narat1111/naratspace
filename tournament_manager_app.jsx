import React, { useEffect, useMemo, useState } from "react";

/*
  TournamentManagerApp.jsx
  A single-file React app implementing a modern tournament manager (frontend-only demo).
  - Uses localStorage for persistence (mock backend)
  - Implements: authentication, tournament creation (single-elim, double-elim (simplified), round-robin, league),
    bracket generation, match scheduling, live score updates, leaderboards, notifications, admin controls, chat.
  - Tailwind-friendly classes are used for styling. If you don't have Tailwind, minimal inline CSS is included below.

  To run: paste into a create-react-app src/App.jsx or similar. Ensure React 18+.
*/

// Minimal fallback CSS (so it looks decent without Tailwind)
const fallbackCSS = `
:root{--bg:#0f172a;--card:#0b1220;--muted:#94a3b8;--accent:#60a5fa}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial;background:linear-gradient(180deg,#071029 0%, #071426 100%);color:#e6eef8}
.app{max-width:1100px;margin:24px auto;padding:18px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.card{background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;box-shadow:0 6px 18px rgba(2,6,23,0.6);}
.grid{display:grid;grid-template-columns:320px 1fr;gap:16px}
.sidebar{min-width:260px}
.btn{background:var(--accent);color:#04263a;border:none;padding:8px 12px;border-radius:10px;cursor:pointer}
.small{font-size:13px;color:var(--muted)}
.input{width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:inherit}
.tournament{margin-bottom:10px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.03)}
.bracket{display:flex;gap:12px;overflow:auto;padding:8px}
.round{min-width:220px}
.match{padding:8px;border-radius:8px;margin-bottom:10px;background:rgba(255,255,255,0.02)}
.small-muted{font-size:12px;color:var(--muted)}
`;

// Utilities
const uid = (prefix = "id") => prefix + "_" + Math.random().toString(36).slice(2, 9);
const nowISO = () => new Date().toISOString();

// Local storage helpers
const LS = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  },
};

// Default demo data
const seedData = () => {
  const users = [{ id: "u_admin", name: "Organizer", email: "org@example.com", pass: "pass", admin: true }];
  LS.set("tm_users", users);
  LS.set("tm_currentUser", null);
  LS.set("tm_tournaments", []);
};

// Bracket generation: single-elimination
function generateSingleElim(players) {
  // players: array of { id, name }
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const rounds = [];
  let currentRound = shuffled.map((p) => ({ id: uid("m"), players: [p], score: [], winner: null }));
  // pair into matches
  while (currentRound.length > 1) {
    const matches = [];
    for (let i = 0; i < currentRound.length; i += 2) {
      const p1 = currentRound[i] ? currentRound[i].players[0] : null;
      const p2 = currentRound[i + 1] ? currentRound[i + 1].players[0] : null;
      matches.push({ id: uid("m"), players: [p1, p2].filter(Boolean), score: [0, 0], winner: null, scheduledAt: null });
    }
    rounds.push(matches);
    // prepare next round placeholders
    currentRound = matches.map(() => ({ id: uid("r"), players: [], score: [], winner: null }));
  }
  // first round is rounds[0]
  return { rounds, type: "single" };
}

// Round-robin scheduler
function generateRoundRobin(players) {
  const p = [...players];
  if (p.length % 2 === 1) p.push({ id: null, name: "BYE" });
  const n = p.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const matches = [];
    for (let i = 0; i < n / 2; i++) {
      const a = p[i];
      const b = p[n - 1 - i];
      if (a.id && b.id) matches.push({ id: uid("m"), players: [a, b], score: [0, 0], winner: null, scheduledAt: null });
    }
    rounds.push(matches);
    // rotate (except first)
    p.splice(1, 0, p.pop());
  }
  return { rounds, type: "roundrobin" };
}

// Simplified double-elimination placeholder generator (creates winners bracket like single-elim and a losers placeholder)
function generateDoubleElim(players) {
  const single = generateSingleElim(players);
  // create parallel losers bracket placeholders (this is simplified: full double-elim is more complex)
  const losers = single.rounds.map((r) => r.map((m) => ({ ...m, id: uid("l") })));
  return { type: "double", winners: single.rounds, losers };
}

// Simple stats calculator
function computeLeaderboard(tournaments) {
  const players = {};
  tournaments.forEach((t) => {
    t.players.forEach((p) => {
      if (!players[p.id]) players[p.id] = { id: p.id, name: p.name, wins: 0, losses: 0, points: 0 };
    });
    if (t.matches) {
      t.matches.forEach((m) => {
        if (!m.players || m.players.length === 0) return;
        const [a, b] = m.players;
        if (m.winner) {
          players[m.winner].wins++;
          const loser = m.players.find((pp) => pp.id !== m.winner);
          if (loser) players[loser.id].losses++;
          players[m.winner].points += 3;
        }
      });
    }
  });
  return Object.values(players).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

// Notification helper
async function notify(title, body) {
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      try {
        const p = await Notification.requestPermission();
        if (p === "granted") new Notification(title, { body });
      } catch (e) {
        console.debug(e);
      }
    }
  }
}

export default function TournamentManagerApp() {
  // init seed
  useEffect(() => {
    if (!localStorage.getItem("tm_users")) seedData();
  }, []);

  // App state
  const [users, setUsers] = useState(LS.get("tm_users", []));
  const [currentUser, setCurrentUser] = useState(LS.get("tm_currentUser", null));
  const [tournaments, setTournaments] = useState(LS.get("tm_tournaments", []));
  const [view, setView] = useState("dashboard");
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);

  useEffect(() => LS.set("tm_users", users), [users]);
  useEffect(() => LS.set("tm_currentUser", currentUser), [currentUser]);
  useEffect(() => LS.set("tm_tournaments", tournaments), [tournaments]);

  // Auth handlers (mock)
  function signup(name, email, pass) {
    if (users.some((u) => u.email === email)) return { ok: false, error: "Email taken" };
    const newUser = { id: uid("u"), name, email, pass, admin: false };
    setUsers((s) => [...s, newUser]);
    setCurrentUser(newUser);
    return { ok: true };
  }
  function login(email, pass) {
    const u = users.find((x) => x.email === email && x.pass === pass);
    if (!u) return { ok: false, error: "Invalid credentials" };
    setCurrentUser(u);
    return { ok: true };
  }
  function logout() {
    setCurrentUser(null);
  }

  // Tournament actions
  function createTournament({ title, type, organizerId, players, scheduleMode }) {
    const id = uid("t");
    const base = { id, title, type, organizerId, players, createdAt: nowISO(), scheduleMode, chat: [], adminNotes: [], matches: [], meta: {} };
    // generate bracket or schedule
    if (type === "single") {
      const { rounds } = generateSingleElim(players);
      // flatten matches into a list for tracking
      base.matches = rounds.flat().map((m) => ({ ...m, tournamentId: id }));
      base.meta.rounds = rounds;
    } else if (type === "roundrobin") {
      const { rounds } = generateRoundRobin(players);
      base.matches = rounds.flat();
      base.meta.rounds = rounds;
    } else if (type === "double") {
      const d = generateDoubleElim(players);
      base.matches = [...d.winners.flat(), ...d.losers.flat()];
      base.meta = d;
    } else if (type === "league") {
      // league = round robin + points
      const { rounds } = generateRoundRobin(players);
      base.matches = rounds.flat();
      base.meta.rounds = rounds;
    }
    setTournaments((s) => [base, ...s]);
    return base;
  }

  function updateMatch(tournamentId, matchId, update) {
    setTournaments((ts) =>
      ts.map((t) => {
        if (t.id !== tournamentId) return t;
        const matches = t.matches.map((m) => (m.id === matchId ? { ...m, ...update } : m));
        // auto-advance for single-elim
        const newT = { ...t, matches };
        // update meta rounds too if present
        if (newT.meta && newT.meta.rounds) {
          const rounds = newT.meta.rounds.map((rnd) => rnd.map((m) => (m.id === matchId ? { ...m, ...update } : m)));
          newT.meta.rounds = rounds;
        }
        return newT;
      })
    );
  }

  function adminAction(tournamentId, action, payload) {
    setTournaments((ts) =>
      ts.map((t) => {
        if (t.id !== tournamentId) return t;
        if (action === "reschedule") {
          const matches = t.matches.map((m) => (payload.matchIds.includes(m.id) ? { ...m, scheduledAt: payload.scheduledAt } : m));
          return { ...t, matches };
        }
        if (action === "disqualify") {
          const { playerId } = payload;
          const players = t.players.filter((p) => p.id !== playerId);
          const adminNotes = [...t.adminNotes, `Disqualified ${playerId} by ${currentUser?.id} at ${nowISO()}`];
          return { ...t, players, adminNotes };
        }
        return t;
      })
    );
  }

  // Chat / comments
  function addComment(tournamentId, text) {
    setTournaments((ts) =>
      ts.map((t) => {
        if (t.id !== tournamentId) return t;
        const chat = [...(t.chat || []), { id: uid("c"), userId: currentUser?.id, text, createdAt: nowISO() }];
        return { ...t, chat };
      })
    );
  }

  // Scheduling notifier: check upcoming matches every 30s
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      tournaments.forEach((t) => {
        t.matches.forEach((m) => {
          if (m.scheduledAt) {
            const then = new Date(m.scheduledAt).getTime();
            const diff = then - now;
            if (diff > 0 && diff <= 60 * 60 * 1000) {
              // within next hour
              notify("Upcoming match", `${t.title}: match between ${m.players?.map((p) => p.name).join(" vs ")} at ${m.scheduledAt}`);
            }
          }
        });
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [tournaments]);

  // Leaderboard
  const leaderboard = useMemo(() => computeLeaderboard(tournaments), [tournaments]);

  // UI small components
  function AuthPanel() {
    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [pass, setPass] = useState("");
    const [name, setName] = useState("");
    const [err, setErr] = useState(null);
    return (
      <div className="card sidebar card-auth">
        <h3>{mode === "login" ? "Log in" : "Sign up"}</h3>
        {err && <div className="small-muted">{err}</div>}
        {mode === "signup" && (
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="btn"
            onClick={() => {
              if (mode === "login") {
                const r = login(email, pass);
                if (!r.ok) setErr(r.error);
              } else {
                const r = signup(name || "Player", email, pass);
                if (!r.ok) setErr(r.error);
              }
            }}
          >
            {mode === "login" ? "Log in" : "Create account"}
          </button>
          <button
            className="btn"
            onClick={() => {
              setMode((m) => (m === "login" ? "signup" : "login"));
              setErr(null);
            }}
          >
            {mode === "login" ? "Need account?" : "Have an account?"}
          </button>
        </div>
        <hr style={{ margin: "10px 0", opacity: 0.06 }} />
        <div className="small-muted">Demo accounts:</div>
        <div className="small-muted">Organizer: org@example.com / pass</div>
      </div>
    );
  }

  function NewTournament() {
    const [title, setTitle] = useState("");
    const [type, setType] = useState("single");
    const [playerText, setPlayerText] = useState("Alice\nBob\nCarol\nDave");
    const [scheduleMode, setScheduleMode] = useState("manual");

    return (
      <div className="card">
        <h3>Create tournament</h3>
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="single">Single Elimination</option>
            <option value="double">Double Elimination (simplified)</option>
            <option value="roundrobin">Round Robin</option>
            <option value="league">League</option>
          </select>
          <select className="input" value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value)}>
            <option value="manual">Manual schedule</option>
            <option value="auto">Auto schedule (even spacing)</option>
          </select>
        </div>
        <textarea
          className="input"
          rows={6}
          value={playerText}
          onChange={(e) => setPlayerText(e.target.value)}
          style={{ marginTop: 8 }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="btn"
            onClick={() => {
              if (!currentUser) return alert("Please log in to create tournaments");
              const players = playerText
                .split(/\n|,|;/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((name) => ({ id: uid("p"), name }));
              const t = createTournament({ title: title || "Untitled", type, organizerId: currentUser.id, players, scheduleMode });
              setSelectedTournamentId(t.id);
              setView("tournament");
            }}
          >
            Create
          </button>
        </div>
      </div>
    );
  }

  function TournamentList() {
    return (
      <div className="card">
        <h3>Your tournaments</h3>
        {tournaments.length === 0 && <div className="small-muted">No tournaments yet — create one!</div>}
        {tournaments.map((t) => (
          <div key={t.id} className="tournament card" style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div className="small-muted">{t.type} • {t.players.length} players</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                onClick={() => {
                  setSelectedTournamentId(t.id);
                  setView("tournament");
                }}
              >
                Open
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function LeaderboardPanel() {
    return (
      <div className="card">
        <h3>Leaderboard</h3>
        {leaderboard.length === 0 && <div className="small-muted">No data yet</div>}
        <ol>
          {leaderboard.map((p) => (
            <li key={p.id} style={{ marginBottom: 6 }}>
              <strong>{p.name}</strong> <span className="small-muted">{p.points} pts • {p.wins}W/{p.losses}L</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  function TournamentView({ tid }) {
    const t = tournaments.find((x) => x.id === tid);
    const [selectedMatch, setSelectedMatch] = useState(null);
    if (!t) return <div className="card">Tournament not found</div>;

    function setScore(m, aScore, bScore) {
      const winner = aScore === bScore ? null : m.players[aScore > bScore ? 0 : 1].id;
      updateMatch(t.id, m.id, { score: [aScore, bScore], winner });
    }

    function quickScheduleAll() {
      // set scheduledAt evenly across next days
      const matches = t.matches.map((m, i) => ({ ...m, scheduledAt: new Date(Date.now() + (i + 1) * 60 * 60 * 1000).toISOString() }));
      setTournaments((ts) => ts.map((tt) => (tt.id === t.id ? { ...tt, matches } : tt)));
    }

    function isAdmin() {
      return currentUser && (currentUser.admin || currentUser.id === t.organizerId);
    }

    return (
      <div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0 }}>{t.title}</h2>
              <div className="small-muted">{t.type} • {t.players.length} players • created {new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {isAdmin() && <button className="btn" onClick={() => quickScheduleAll()}>Auto-schedule</button>}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 360px", gap: 12 }}>
          <div>
            <div className="card">
              <h3>Bracket & Matches</h3>
              <div className="bracket">
                {/* If meta.rounds present, display rounds */}
                {t.meta && t.meta.rounds ? (
                  t.meta.rounds.map((rnd, idx) => (
                    <div key={idx} className="round card">
                      <div className="small-muted">Round {idx + 1}</div>
                      {rnd.map((m) => (
                        <div key={m.id} className="match card">
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{m.players?.map((p) => p.name).join(" vs ")}</div>
                              <div className="small-muted">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : "No time"}</div>
                            </div>
                            <div style={{ minWidth: 140 }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <input className="input" type="number" placeholder="A" onBlur={(e) => setScore(m, Number(e.target.value || 0), m.score?.[1] || 0)} />
                                <input className="input" type="number" placeholder="B" onBlur={(e) => setScore(m, m.score?.[0] || 0, Number(e.target.value || 0))} />
                              </div>
                              <div style={{ marginTop: 6 }}>
                                <button className="btn" onClick={() => { setSelectedMatch(m); }}>Open</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="small-muted">Bracket view not available for this format.</div>
                )}
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="card">
              <h3>Matches (flat)</h3>
              {t.matches.map((m) => (
                <div key={m.id} className="match card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{m.players?.map((p) => p.name).join(" vs ")}</div>
                    <div className="small-muted">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : "No time"} • {m.winner ? `Winner: ${m.winner}` : "Unplayed"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {isAdmin() && (
                      <button
                        className="btn"
                        onClick={() => {
                          const at = prompt("New ISO datetime (e.g. 2025-09-01T15:00:00):", m.scheduledAt || new Date().toISOString());
                          if (at) updateMatch(t.id, m.id, { scheduledAt: at });
                        }}
                      >
                        Reschedule
                      </button>
                    )}
                    {isAdmin() && (
                      <button
                        className="btn"
                        onClick={() => {
                          adminAction(t.id, "disqualify", { playerId: m.players?.[0]?.id });
                        }}
                      >
                        Disqualify
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>

          <div>
            <div className="card">
              <h3>Players</h3>
              <ol>
                {t.players.map((p) => (
                  <li key={p.id} style={{ marginBottom: 6 }}>{p.name} {isAdmin() && <button className="btn" style={{ marginLeft: 8 }} onClick={() => adminAction(t.id, "disqualify", { playerId: p.id })}>DQ</button>}</li>
                ))}
              </ol>
            </div>

            <div style={{ height: 12 }} />

            <div className="card">
              <h3>Chat</h3>
              {currentUser ? (
                <ChatBox t={t} onSend={(txt) => addComment(t.id, txt)} />
              ) : (
                <div className="small-muted">Log in to chat</div>
              )}
              <div style={{ marginTop: 8 }}>
                {(t.chat || []).map((c) => (
                  <div key={c.id} className="small-muted" style={{ marginBottom: 6 }}>{users.find((u) => u.id === c.userId)?.name || c.userId}: {c.text}</div>
                ))}
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="card">
              <h3>Admin</h3>
              <div className="small-muted">Notes</div>
              <textarea className="input" rows={4} value={t.adminNotes?.join("\n") || ""} onChange={(e) => { /* ephemeral */ }} />
            </div>

          </div>
        </div>
      </div>
    );
  }

  function ChatBox({ t, onSend }) {
    const [text, setText] = useState("");
    return (
      <div>
        <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={() => { if (!text.trim()) return; onSend(text); setText(""); }}>Send</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <style>{fallbackCSS}</style>
      <div className="header">
        <h1 style={{ margin: 0 }}>Tournament Manager</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {currentUser ? (
            <>
              <div className="small-muted">Signed in as <strong>{currentUser.name}</strong></div>
              <button className="btn" onClick={() => logout()}>Log out</button>
            </>
          ) : (
            <div className="small-muted">Not signed in</div>
          )}
        </div>
      </div>

      <div className="grid">
        <div className="sidebar">
          {!currentUser ? <AuthPanel /> : <div className="card"><h3>Profile</h3><div>{currentUser.name}</div><div className="small-muted">{currentUser.email}</div></div>}

          <div style={{ height: 12 }} />
          <NewTournament />
          <div style={{ height: 12 }} />
          <TournamentList />
          <div style={{ height: 12 }} />
          <LeaderboardPanel />
        </div>

        <div>
          {view === "dashboard" && (
            <div className="card">
              <h2>Welcome</h2>
              <div className="small-muted">Create tournaments, manage matches, and track leaderboards. Mobile-friendly minimal UI.</div>
            </div>
          )}

          {view === "tournament" && selectedTournamentId && <TournamentView tid={selectedTournamentId} />}
        </div>
      </div>
    </div>
  );
}
