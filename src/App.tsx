import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Crosshair,
  GitFork,
  MapPin,
  Navigation,
  Plus,
  RotateCcw,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import MapView from "./MapView";
import { colors, initialFriends, places, type Friend } from "./places";
import { distance, type Network, type SearchResult } from "./graph";

function readFriends(): Friend[] {
  try {
    const value = new URLSearchParams(location.search).get("group");
    if (value) {
      const raw = JSON.parse(value);
      if (
        Array.isArray(raw) &&
        raw.length >= 2 &&
        raw.length <= 6 &&
        raw.every(
          (f) =>
            typeof f.name === "string" &&
            f.name.length <= 30 &&
            typeof f.place?.name === "string" &&
            f.place.name.length <= 100 &&
            Number.isFinite(f.place.lat) &&
            Number.isFinite(f.place.lng) &&
            f.place.lat >= -6.36 &&
            f.place.lat <= -6.1 &&
            f.place.lng >= 106.72 &&
            f.place.lng <= 106.97,
        )
      )
        return raw.map((f, i) => ({ ...f, id: i }));
    }
  } catch {
    /* Invalid shared links use the Jakarta demo. */
  }
  return initialFriends();
}
export default function App() {
  const [friends, setFriends] = useState<Friend[]>(readFriends),
    [network, setNetwork] = useState<Network | null>(null),
    [loadError, setLoadError] = useState(false),
    [result, setResult] = useState<SearchResult | null>(null),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState(0),
    [computing, setComputing] = useState(false),
    [method, setMethod] = useState<"together" | "sequential">("together"),
    [objective, setObjective] = useState<"balanced" | "total">("balanced"),
    [active, setActive] = useState<number | null>(null),
    [query, setQuery] = useState(""),
    [help, setHelp] = useState(false),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState(false);
  const worker = useRef<Worker | null>(null),
    timer = useRef<number>(0),
    nextId = useRef(10),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}data/jakarta-network.json`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (live) setNetwork(data);
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    return () => {
      live = false;
      worker.current?.terminate();
      cancelAnimationFrame(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (help) dialog.current?.showModal();
    else dialog.current?.close();
  }, [help]);
  function clearResult() {
    worker.current?.terminate();
    cancelAnimationFrame(timer.current);
    setResult(null);
    setProgress(0);
    setRunning(false);
    setComputing(false);
  }
  function moveFriend(id: number, lat: number, lng: number) {
    if (lat < -6.36 || lat > -6.1 || lng < 106.72 || lng > 106.97) {
      setNotice("Keep your starting point inside our Jakarta coverage.");
      setFriends((f) => [...f]);
      return;
    }
    clearResult();
    const closest = [...places].sort(
      (a, b) =>
        distance([a.lat, a.lng], [lat, lng]) -
        distance([b.lat, b.lng], [lat, lng]),
    )[0];
    setFriends((fs) =>
      fs.map((f) =>
        f.id === id
          ? { ...f, place: { name: `Pin near ${closest.name}`, lat, lng } }
          : f,
      ),
    );
    setActive(null);
  }
  function start(replay = false) {
    if (!network) return;
    setActive(null);
    setNotice("");
    if (window.innerWidth <= 760)
      document
        .querySelector(".map-column")
        ?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "start",
        });
    const animate = (r: SearchResult) => {
      setResult(r);
      setComputing(false);
      setRunning(true);
      setProgress(0);
      const startTime = performance.now(),
        duration = matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 50
          : method === "together"
            ? 5200
            : friends.length * 2200;
      const frame = (now: number) => {
        const p = Math.min((now - startTime) / duration, 1);
        setProgress(p);
        if (p < 1) timer.current = requestAnimationFrame(frame);
        else setRunning(false);
      };
      timer.current = requestAnimationFrame(frame);
    };
    if (replay && result) {
      animate(result);
      return;
    }
    clearResult();
    setComputing(true);
    const w = new Worker(new URL("./search.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.error) {
        setComputing(false);
        setNotice(data.error);
      } else animate(data.result);
      w.terminate();
    };
    w.onerror = () => {
      setComputing(false);
      setNotice("The search could not finish. Please try again.");
      w.terminate();
    };
    w.postMessage({
      network,
      points: friends.map((f) => [f.place.lat, f.place.lng]),
      objective,
    });
  }
  function share() {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("group", JSON.stringify(friends));
    navigator.clipboard
      ?.writeText(url.href)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() =>
        setNotice(
          "Could not copy. You can copy the link from your address bar.",
        ),
      );
    history.replaceState(null, "", url);
    if (!navigator.clipboard)
      setNotice(
        "Your group is saved in the address bar. Copy that link to share.",
      );
  }
  const done = !!result && !running && !computing;
  const meeting = result && network ? network.nodes[result.meeting] : null;
  const nearby = meeting
    ? [...places].sort(
        (a, b) =>
          distance([a.lat, a.lng], meeting) - distance([b.lat, b.lng], meeting),
      )[0]
    : null;
  const busy = running || computing;
  function countUntil(values: number[], radius: number) {
    let lo = 0,
      hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[mid] <= radius) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  const stage = Math.min(
    friends.length - 1,
    Math.floor(progress * friends.length),
  );
  const exploredNow = result
    ? method === "together"
      ? countUntil(result.arrivals, result.maxDistance * progress)
      : result.perSourceArrivals
          .slice(0, stage)
          .reduce((sum, ds) => sum + countUntil(ds, result.maxDistance), 0) +
        countUntil(
          result.perSourceArrivals[stage],
          result.maxDistance * (progress * friends.length - stage),
        )
    : 0;
  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="Meet halfway home"
        >
          <span className="brand-symbol">
            <GitFork size={23} strokeWidth={2.4} />
          </span>
          meet halfway<span className="brand-period">.</span>
        </a>
        <nav>
          <button
            className="text-button help-nav"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={16} />
            How it works
          </button>
          <span className="nav-divider" />
          <button
            className="share-button"
            onClick={share}
            aria-label={copied ? "Group link copied" : "Share your group"}
          >
            {copied ? <Check size={15} /> : <Share2 size={15} />}
            <span>{copied ? "Link copied" : "Share your group"}</span>
          </button>
        </nav>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span />
              GOOD FRIENDS. FAIR JOURNEYS.
            </div>
            <h1>
              Different starts. <span>One common ground.</span>
            </h1>
            <p>
              Find a place that’s a little closer to everyone. Not just someone.
            </p>
          </div>
          <div className="intro-note">
            <div className="mini-avatars">
              {["B", "P", "D", "S"].map((x, i) => (
                <span key={x} style={{ color: colors[i] }}>
                  {x}
                </span>
              ))}
              <ArrowRight size={17} />
              <span className="mini-meeting">✳</span>
            </div>
            <span>
              Less “where should we go?”
              <br />
              <strong>More “see you there.”</strong>
            </span>
          </div>
        </section>
        <section className="workspace" aria-label="Plan your meetup">
          <aside className="sidebar">
            <div className="sidebar-title">
              <div>
                <span className="step-number">01</span>
                <h2>Where’s everyone?</h2>
              </div>
              <span className="friend-count">
                <Users size={13} />
                {friends.length} friends
              </span>
            </div>
            <p className="section-description">
              Add your starting points. We’ll find the sweet spot.
            </p>
            <div className="friend-list">
              {friends.map((f, i) => (
                <div
                  className="friend-row"
                  key={f.id}
                  style={{ "--friend-color": colors[i] } as React.CSSProperties}
                >
                  <div className="friend-avatar">
                    {(f.name || "?")[0].toUpperCase()}
                  </div>
                  <div className="friend-inputs">
                    <div className="friend-name-line">
                      <input
                        aria-label={`Friend ${i + 1} name`}
                        value={f.name}
                        maxLength={30}
                        onChange={(e) => {
                          setFriends((fs) =>
                            fs.map((x) =>
                              x.id === f.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          );
                        }}
                      />
                      {done && (
                        <span className="trip-distance">
                          {result.trips[i].toFixed(1)} <small>km</small>
                        </span>
                      )}
                      {friends.length > 2 && (
                        <button
                          className="remove-friend"
                          disabled={busy}
                          aria-label={`Remove ${f.name || `friend ${i + 1}`}`}
                          onClick={() => {
                            clearResult();
                            setActive(null);
                            setFriends((fs) => fs.filter((x) => x.id !== f.id));
                          }}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <button
                      className={`location-field ${active === f.id ? "is-active" : ""}`}
                      disabled={busy}
                      onClick={() => {
                        setActive(active === f.id ? null : f.id);
                        setQuery("");
                      }}
                    >
                      <MapPin size={12} />
                      <span>{f.place.name}</span>
                      <ChevronDown size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {friends.length < 6 && (
              <button
                className="add-friend"
                disabled={busy}
                onClick={() => {
                  clearResult();
                  const id = nextId.current++;
                  setFriends((fs) => [
                    ...fs,
                    { id, name: `Friend ${fs.length + 1}`, place: places[4] },
                  ]);
                  setActive(id);
                  setQuery("");
                }}
              >
                <Plus size={15} />
                Add a friend
              </button>
            )}
            <div className="map-tip">
              <Crosshair size={14} />
              <span>You can drag the pins on the map, too.</span>
            </div>
            {active !== null && (
              <div className="place-picker">
                <div className="picker-heading">
                  <strong>Choose a starting point</strong>
                  <button
                    className="icon-button"
                    aria-label="Close location search"
                    onClick={() => setActive(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <input
                  autoFocus
                  className="place-search"
                  placeholder="Search Jakarta neighborhoods…"
                  aria-label="Search Jakarta neighborhoods"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="place-options">
                  {places
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <button
                        key={p.name}
                        onClick={() => {
                          clearResult();
                          setFriends((fs) =>
                            fs.map((f) =>
                              f.id === active ? { ...f, place: p } : f,
                            ),
                          );
                          setActive(null);
                        }}
                      >
                        <MapPin size={14} />
                        {p.name}
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  {!places.some((p) =>
                    p.name.toLowerCase().includes(query.toLowerCase()),
                  ) && (
                    <p>
                      No saved place found. Click the map to drop a precise pin
                      instead.
                    </p>
                  )}
                </div>
                <div className="picker-footer">
                  <Crosshair size={13} />
                  Or click anywhere on the map to place the pin.
                </div>
              </div>
            )}
            <div className="search-options">
              <div className="section-label">
                <span className="step-number">02</span>
                <h2>Make it fair</h2>
              </div>
              <label className="objective-label" htmlFor="objective">
                Choose what matters most
              </label>
              <div className="select-wrap">
                <select
                  id="objective"
                  value={objective}
                  disabled={busy}
                  onChange={(e) => {
                    clearResult();
                    setObjective(e.target.value as "balanced" | "total");
                  }}
                >
                  <option value="balanced">Balance everyone’s distance</option>
                  <option value="total">Shortest total group distance</option>
                </select>
                <ChevronDown size={14} />
              </div>
              <div className="method-label">
                WATCH THE SEARCH{" "}
                <button
                  className="icon-button"
                  aria-label="About the search animation"
                  onClick={() => setHelp(true)}
                >
                  <CircleHelp size={12} />
                </button>
              </div>
              <div className="segmented">
                <button
                  className={method === "together" ? "selected" : ""}
                  disabled={busy}
                  onClick={() => {
                    setMethod("together");
                  }}
                >
                  <Users size={14} />
                  All at once
                </button>
                <button
                  className={method === "sequential" ? "selected" : ""}
                  disabled={busy}
                  onClick={() => setMethod("sequential")}
                >
                  <ArrowDown size={14} />
                  One by one
                </button>
              </div>
              <p className="method-description">
                {method === "together"
                  ? "Everyone sets off together. Watch their paths meet."
                  : "One friend at a time. Same fair destination."}
              </p>
            </div>
            <div className="sidebar-bottom">
              <button
                className="find-button"
                disabled={!network || busy}
                onClick={() => start()}
              >
                {busy ? (
                  <>
                    <span className="spinner" />
                    {computing
                      ? "Finding common ground…"
                      : "Following the streets…"}
                  </>
                ) : (
                  <>
                    <Sparkles size={17} />
                    {done
                      ? "Find a new meeting point"
                      : "Find our meeting point"}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              <button
                className="reset-button"
                disabled={busy}
                onClick={() => {
                  clearResult();
                  setFriends(initialFriends());
                  setActive(null);
                  history.replaceState(null, "", location.pathname);
                }}
              >
                <RotateCcw size={12} />
                Reset to the Jakarta example
              </button>
            </div>
          </aside>
          <div className="map-column">
            <MapView
              network={network}
              friends={friends}
              result={result}
              progress={progress}
              running={running}
              method={method}
              active={active}
              onPick={(lat, lng) => {
                if (active !== null) moveFriend(active, lat, lng);
              }}
              onMove={moveFriend}
            />
            {(!network || loadError) && (
              <div className="map-loading" role="status">
                {loadError ? (
                  <>
                    <strong>Couldn’t load Jakarta’s streets.</strong>
                    <button onClick={() => location.reload()}>Try again</button>
                  </>
                ) : (
                  <>
                    <span className="spinner" />
                    Unfolding Jakarta’s streets…
                  </>
                )}
              </div>
            )}
            {!result && network && !computing && active === null && (
              <div className="map-invitation">
                <div className="invitation-icon">
                  <GitFork size={19} />
                </div>
                <div>
                  <strong>Four corners. One catch-up.</strong>
                  <span>Your next good plan starts here.</span>
                </div>
                <ArrowUpRight size={17} />
              </div>
            )}
            {active !== null && (
              <div className="map-pick-message">
                <Crosshair size={15} />
                Click the map to set{" "}
                {friends.find((f) => f.id === active)?.name}’s starting point
                <button
                  aria-label="Cancel placing pin"
                  onClick={() => setActive(null)}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {busy && (
              <div className="search-status" role="status">
                <span className="spinner" />
                <div>
                  <strong>
                    {computing
                      ? "Finding the fairest street…"
                      : method === "together"
                        ? "Finding where your worlds meet…"
                        : `Following ${friends[Math.min(friends.length - 1, Math.floor(progress * friends.length))].name}’s streets…`}
                  </strong>
                  <span>
                    {result
                      ? `${exploredNow.toLocaleString()} street segments explored`
                      : "Searching the real street network"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    clearResult();
                  }}
                  className="icon-button"
                  aria-label="Cancel search"
                >
                  <X size={16} />
                </button>
                <div
                  className="search-progress"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
            {done && nearby && meeting && (
              <div className="result-card" aria-live="polite">
                <div className="result-eyebrow">
                  <span className="result-check">
                    <Check size={11} />
                  </span>
                  COMMON GROUND FOUND
                  <button
                    onClick={() => start(true)}
                    title="Replay the search"
                    aria-label="Replay the search"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
                <h2>
                  Meet near {nearby.name}
                  <span>↗</span>
                </h2>
                <p>
                  {objective === "balanced"
                    ? "A shorter longest journey. A fairer catch-up."
                    : "The least distance for your whole group."}
                </p>
                <div className="result-stats">
                  <div>
                    <strong>
                      {Math.max(...result.trips).toFixed(1)}
                      <small> km</small>
                    </strong>
                    <span>longest trip</span>
                  </div>
                  <div>
                    <strong>
                      {(
                        result.trips.reduce((a, b) => a + b, 0) / friends.length
                      ).toFixed(1)}
                      <small> km</small>
                    </strong>
                    <span>average trip</span>
                  </div>
                  <div>
                    <strong>{friends.length}</strong>
                    <span>happy friends</span>
                  </div>
                </div>
                <a
                  className="maps-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${meeting[0]},${meeting[1]}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation size={14} />
                  Explore this spot in Maps
                  <ArrowUpRight size={15} />
                </a>
                <button
                  className="copy-coordinates"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(`${meeting[0]}, ${meeting[1]}`)
                      .then(() => setNotice("Meeting coordinates copied."))
                      .catch(() => setNotice("Could not copy coordinates."));
                  }}
                >
                  <Copy size={11} />
                  {meeting[0].toFixed(5)}, {meeting[1].toFixed(5)}
                </button>
              </div>
            )}
          </div>
        </section>
        <footer className="site-footer">
          <span>
            <i />
            Made for the plans that actually leave the group chat.
          </span>
          <span>
            Jakarta edition <span className="footer-dot">·</span> Street
            distance, not travel time{" "}
            <button onClick={() => setHelp(true)} aria-label="Distance details">
              <CircleHelp size={12} />
            </button>
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="alert">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={() => setHelp(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setHelp(false);
        }}
      >
        <button
          className="dialog-close icon-button"
          onClick={() => setHelp(false)}
          aria-label="Close how it works"
        >
          <X size={20} />
        </button>
        <span className="eyebrow">A FAIRER WAY TO CATCH UP</span>
        <h2>
          Not the middle.
          <br />
          The common ground.
        </h2>
        <p>
          A midpoint on a map can leave one friend with a much longer journey.
          We follow Jakarta’s actual streets instead.
        </p>
        <ol>
          <li>
            <strong>Start with your people.</strong>
            <span>
              Choose 2–6 starting points from saved Jakarta places, drag a pin,
              or click the map.
            </span>
          </li>
          <li>
            <strong>Choose your kind of fair.</strong>
            <span>
              Balanced trips minimizes the longest street distance. Shortest
              total minimizes the distance everyone travels combined.
            </span>
          </li>
          <li>
            <strong>Watch your paths come together.</strong>
            <span>
              Colored waves follow shortest street distances from each friend.
              Both animation modes find the same point.
            </span>
          </li>
        </ol>
        <div className="method-note">
          <strong>A starting point, not a navigation app.</strong>
          <p>
            Distances use an approximate, undirected street graph derived from
            OpenStreetMap map tiles and exclude traffic, one-way rules, turn
            restrictions, transit, service roads and walking-only paths. Pins
            snap to the closest connected junction. Results optimize over street
            junctions, not every possible point or café. Check routes and nearby
            venues in Maps before heading out.
          </p>
          <p>
            Coverage: central Jakarta and surrounding neighborhoods,
            106.72–106.97°E, 6.10–6.36°S. Street data is bundled, so no map API
            key is needed. Shared links contain your chosen names and locations.
          </p>
        </div>
        <button className="find-button" onClick={() => setHelp(false)}>
          Let’s find our spot
          <ArrowRight size={16} />
        </button>
      </dialog>
    </>
  );
}
