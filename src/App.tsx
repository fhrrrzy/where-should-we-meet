import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Crosshair,
  GitFork,
  House,
  MapPin,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import MapView from "./MapView";
import {
  colors,
  initialFriends,
  places,
  friendLabel,
  friendInitial,
  friendColor,
  friendColorIndex,
  sameLocation,
  type Friend,
  type Place,
} from "./places";
import { distance, type Network, type SearchResult } from "./graph";
import {
  STORAGE_KEY,
  readPlanner,
  plannerUrl,
  insideCoverage,
  searchPlaces,
  outsideQuery,
  type Method,
  type Objective,
} from "./planner";
import { validateNetwork, nearStreet } from "./network";
import { locate } from "./geolocate";
import { nearestSnap } from "./sheet";

export default function App() {
  const [initial] = useState(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* Storage may be unavailable. */
    }
    return readPlanner(location.search, stored);
  });
  const [friends, setFriends] = useState<Friend[]>(initial.friends),
    [network, setNetwork] = useState<Network | null>(null),
    [loadError, setLoadError] = useState(false),
    [result, setResult] = useState<SearchResult | null>(null),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState(0),
    [computing, setComputing] = useState(false),
    [method, setMethod] = useState<Method>(initial.method),
    [objective, setObjective] = useState<Objective>(initial.objective),
    [active, setActive] = useState<number | null>(null),
    [query, setQuery] = useState(""),
    [help, setHelp] = useState(false),
    [notification, setNotification] = useState({
      message: initial.invalid
        ? "Need 2 to 6 friends in Jakarta. Invalid link cleared."
        : "",
      serial: 0,
    }),
    [copied, setCopied] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const notice = notification.message;
  function setNotice(message: string) {
    setNotification((n) => ({ message, serial: n.serial + 1 }));
  }
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [download, setDownload] = useState(0);
  const [sheet, setSheet] = useState<"peek" | "half" | "full">(() =>
    window.innerWidth > 760 ? "half" : "peek",
  );
  const [phonePortrait, setPhonePortrait] = useState(
    () =>
      window.matchMedia("(max-width: 760px) and (min-height: 501px)").matches,
  );
  const [highlightedOption, setHighlightedOption] = useState<number | null>(
    null,
  );
  useEffect(() => {
    if (highlightedOption === null) return;
    document
      .getElementById(`place-option-${highlightedOption}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightedOption]);
  const shared = useRef(initial.shared),
    autoFind = useRef(initial.autoFind),
    skip = useRef(false);
  const initialPlan = useRef(
    JSON.stringify({
      friends: initial.friends,
      objective: initial.objective,
      method: initial.method,
    }),
  );
  const savePlan = useRef(!initial.shared);
  const worker = useRef<Worker | null>(null),
    timer = useRef<number>(0),
    nextId = useRef(Math.max(...initial.friends.map((f) => f.id)) + 1),
    dialog = useRef<HTMLDialogElement>(null),
    sheetDrag = useRef<{
      pointerId: number;
      startY: number;
      startHeight: number;
      peekHeight: number;
      moved: boolean;
    } | null>(null);
  const panelOpen = sheet !== "peek";
  useEffect(() => {
    const query = window.matchMedia(
      "(max-width: 760px) and (min-height: 501px)",
    );
    const update = () => setPhonePortrait(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const workspace = document.querySelector<HTMLElement>(".workspace");
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!workspace || !sidebar) return;
    const resize = new ResizeObserver(() => {
      workspace.style.setProperty(
        "--sheet-height",
        `${sidebar.getBoundingClientRect().height}px`,
      );
    });
    resize.observe(sidebar);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    if (initial.invalid) history.replaceState(null, "", location.pathname);
  }, [initial.invalid]);
  useEffect(() => {
    const planner = { friends, objective, method };
    const serialized = JSON.stringify(planner);
    if (serialized !== initialPlan.current) savePlan.current = true;
    try {
      if (savePlan.current) localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      /* URL sharing still works. */
    }
    if (shared.current)
      history.replaceState(null, "", plannerUrl(location.href, planner));
  }, [friends, objective, method]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), 20000);
    setLoadError(false);
    setDownload(0);
    fetch(`${import.meta.env.BASE_URL}data/jakarta-network.json`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        if (!r.body) return r.json();
        const reader = r.body.getReader(),
          chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          clearTimeout(timeout);
          timeout = setTimeout(() => controller.abort(), 20000);
          chunks.push(value);
          received += value.length;
          if (live) setDownload(received);
        }
        const bytes = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return JSON.parse(new TextDecoder().decode(bytes));
      })
      .then((data) => {
        if (!validateNetwork(data)) throw new Error("Invalid street data");
        if (live) setNetwork(data);
      })
      .catch(() => {
        if (live) setLoadError(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timeout);
      worker.current?.terminate();
      cancelAnimationFrame(timer.current);
    };
  }, [loadAttempt]);
  useEffect(() => {
    if (network && autoFind.current) {
      autoFind.current = false;
      start();
    }
  }, [network]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notification.serial]);
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
  function validatedClosest(lat: number, lng: number) {
    if (!insideCoverage(lat, lng)) {
      setNotice("Choose a point within Jakarta.");
      return null;
    }
    if (!network || !nearStreet(network, [lat, lng])) {
      setNotice("Choose a point near a Jakarta street, not water.");
      return null;
    }
    return [...places].sort(
      (a, b) =>
        distance([a.lat, a.lng], [lat, lng]) -
        distance([b.lat, b.lng], [lat, lng]),
    )[0];
  }
  function moveFriend(id: number, lat: number, lng: number) {
    const closest = validatedClosest(lat, lng);
    if (!closest) {
      setFriends((f) => [...f]);
      return;
    }
    clearResult();
    setFriends((fs) =>
      fs.map((f) =>
        f.id === id
          ? { ...f, place: { name: `Pin near ${closest.name}`, lat, lng } }
          : f,
      ),
    );
    setActive(null);
    focusLocation(id);
  }
  function addFriend(
    place: Place = places[4],
    { select = true }: { select?: boolean } = {},
  ) {
    clearResult();
    const id = nextId.current++;
    setFriends((fs) => [
      ...fs,
      {
        id,
        name: `Friend ${id + 1}`,
        place,
        color: colors.findIndex(
          (_, index) =>
            !fs.some((friend) => friendColorIndex(friend) === index),
        ),
      },
    ]);
    if (select) setActive(id);
    setQuery("");
    setHighlightedOption(null);
  }
  function addFriendAt(lat: number, lng: number) {
    if (friends.length >= 6) return;
    const closest = validatedClosest(lat, lng);
    if (!closest) return;
    addFriend(
      { name: `Pin near ${closest.name}`, lat, lng },
      { select: false },
    );
  }
  function focusLocation(id: number) {
    requestAnimationFrame(() =>
      document.getElementById(`location-${id}`)?.focus(),
    );
  }
  function choosePlace(place: Place) {
    clearResult();
    setFriends((fs) => fs.map((f) => (f.id === active ? { ...f, place } : f)));
    const id = active;
    setActive(null);
    if (id !== null) focusLocation(id);
  }
  async function chooseMyLocation() {
    const id = active;
    if (id === null) return;
    try {
      const position = await locate();
      if (activeRef.current === id) moveFriend(id, position.lat, position.lng);
    } catch {
      if (activeRef.current === id) setNotice("Location unavailable.");
    }
  }
  function chooseOption(index: number) {
    if (index === 0) {
      void chooseMyLocation();
    } else if (index === 1) {
      setSheet("peek");
    } else {
      const place = matches[index - 2];
      if (place) choosePlace(place);
    }
  }
  function collapsedHeight() {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!sidebar) return 0;
    const clone = sidebar.cloneNode(true) as HTMLElement;
    clone.classList.add("collapsed", "sheet-peek");
    clone.classList.remove("sheet-half", "sheet-full", "sheet-dragging");
    clone
      .querySelector<HTMLElement>(".panel-content")
      ?.setAttribute("hidden", "");
    Object.assign(clone.style, {
      position: "fixed",
      top: "0",
      right: "auto",
      bottom: "auto",
      left: "-10000px",
      height: "auto",
      maxHeight: "none",
      visibility: "hidden",
    });
    document.body.append(clone);
    const height = clone.getBoundingClientRect().height;
    clone.remove();
    return height;
  }
  function beginSheetDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!phonePortrait || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest("button, input, select, a")
    )
      return;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!sidebar) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetDrag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: sidebar.getBoundingClientRect().height,
      peekHeight: collapsedHeight(),
      moved: false,
    };
  }
  function moveSheetDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = sheetDrag.current;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!drag || !sidebar || drag.pointerId !== event.pointerId) return;
    const delta = drag.startY - event.clientY;
    if (Math.abs(delta) >= 5) drag.moved = true;
    if (!drag.moved) return;
    const max = window.innerHeight - 72;
    const height = Math.max(
      drag.peekHeight,
      Math.min(max, drag.startHeight + delta),
    );
    sidebar.style.height = `${height}px`;
    sidebar.classList.add("sheet-dragging");
  }
  function endSheetDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = sheetDrag.current;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (!drag || !sidebar || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      const snaps = [
        drag.peekHeight,
        window.innerHeight * 0.5,
        window.innerHeight - 72,
      ];
      const index = nearestSnap(sidebar.getBoundingClientRect().height, snaps);
      setSheet((["peek", "half", "full"] as const)[index] ?? "peek");
    } else {
      setSheet(sheet === "peek" ? "half" : "peek");
    }
    sidebar.style.removeProperty("height");
    sidebar.classList.remove("sheet-dragging");
    sheetDrag.current = null;
  }
  function start(replay = false) {
    if (!network) return;
    setActive(null);
    setNotice("");
    skip.current = false;
    if (window.innerWidth <= 760) setSheet("peek");
    requestAnimationFrame(() =>
      document.getElementById("planner-toggle")?.focus(),
    );
    const animate = (r: SearchResult) => {
      setResult(r);
      setComputing(false);
      if (
        skip.current ||
        r.maxDistance < 0.001 ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        setProgress(1);
        setRunning(false);
        return;
      }
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
    const url = plannerUrl(location.href, { friends, objective, method });
    shared.current = true;
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
  useEffect(() => {
    if (done && phonePortrait) setSheet("peek");
  }, [done, phonePortrait]);
  const together = !!result && sameLocation(friends);
  const meeting =
    result && network
      ? together
        ? [friends[0].place.lat, friends[0].place.lng]
        : network.nodes[result.meeting]
      : null;
  const nearby = together
    ? friends[0].place
    : meeting
      ? [...places].sort(
          (a, b) =>
            distance([a.lat, a.lng], meeting) -
            distance([b.lat, b.lng], meeting),
        )[0]
      : null;
  const busy = running || computing;
  const matches = searchPlaces(query);
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
          <a
            className="home-nav"
            href={import.meta.env.BASE_URL}
            aria-label="Your saved plan"
            title="Your saved plan"
          >
            <House size={16} />
          </a>
          <button
            className="text-button help-nav"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={16} />
            Help
          </button>
          <span className="nav-divider" />
          <button
            className="share-button"
            onClick={share}
            aria-label={copied ? "Group link copied" : "Share your group"}
          >
            {copied ? <Check size={15} /> : <Share2 size={15} />}
            <span>{copied ? "Copied" : "Share"}</span>
          </button>
        </nav>
      </header>
      <main>
        <section className="workspace" aria-label="Plan your meetup">
          <aside
            className={`sidebar sheet-${sheet}${panelOpen ? "" : " collapsed"}`}
            aria-label="Friends and search"
          >
            <div
              className="sheet-grab-area"
              onPointerDown={beginSheetDrag}
              onPointerMove={moveSheetDrag}
              onPointerUp={endSheetDrag}
              onPointerCancel={endSheetDrag}
            >
              <span className="sheet-grab-handle" aria-hidden="true" />
              <div className="sidebar-title">
                <h1>Friends</h1>
                <span className="friend-count">
                  <Users size={13} />
                  {friends.length}/6
                </span>
                <button
                  id="planner-toggle"
                  className="panel-toggle icon-button"
                  aria-label={
                    panelOpen ? "Collapse controls" : "Edit friends and search"
                  }
                  aria-expanded={panelOpen}
                  aria-controls="planner-controls"
                  onClick={() => {
                    setSheet(sheet === "peek" ? "half" : "peek");
                    setActive(null);
                  }}
                >
                  <ChevronDown size={18} />
                </button>
              </div>
            </div>
            {phonePortrait && done && nearby && meeting && active === null && (
              <ResultCard
                result={result!}
                together={together}
                nearby={nearby}
                meeting={meeting}
                onShare={share}
                onCopy={() => {
                  navigator.clipboard
                    ?.writeText(`${meeting[0]}, ${meeting[1]}`)
                    .then(() => setNotice("Meeting coordinates copied."))
                    .catch(() => setNotice("Could not copy coordinates."));
                }}
                onReplay={() => start(true)}
              />
            )}
            <div
              className="panel-content"
              id="planner-controls"
              hidden={!panelOpen}
            >
              <div className="friend-list">
                {friends.map((f, i) => (
                  <div
                    className={`friend-entry ${active === f.id ? "has-picker" : ""}`}
                    key={f.id}
                  >
                    <div
                      className="friend-row"
                      style={
                        {
                          "--friend-color": friendColor(f),
                        } as React.CSSProperties
                      }
                    >
                      <div className="friend-avatar">{friendInitial(f)}</div>
                      <div className="friend-inputs">
                        <div className="friend-name-line">
                          <input
                            aria-label={`Friend ${i + 1} name`}
                            value={f.name}
                            placeholder={friendLabel({ ...f, name: "" })}
                            maxLength={30}
                            onBlur={() => {
                              if (!f.name.trim())
                                setFriends((fs) =>
                                  fs.map((x) =>
                                    x.id === f.id
                                      ? { ...x, name: friendLabel(f) }
                                      : x,
                                  ),
                                );
                            }}
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
                              aria-label={`Remove ${friendLabel(f)}`}
                              onClick={() => {
                                clearResult();
                                setActive(null);
                                setFriends((fs) =>
                                  fs.filter((x) => x.id !== f.id),
                                );
                                focusLocation(
                                  friends[i + 1]?.id ?? friends[i - 1].id,
                                );
                              }}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <button
                          id={`location-${f.id}`}
                          aria-label={`${friendLabel(f)} starting point: ${f.place.name}`}
                          className={`location-field ${active === f.id ? "is-active" : ""}`}
                          disabled={busy}
                          onClick={() => {
                            setActive(active === f.id ? null : f.id);
                            setQuery("");
                            setHighlightedOption(null);
                          }}
                        >
                          <MapPin size={12} />
                          <span>{f.place.name}</span>
                          <ChevronDown size={12} />
                        </button>
                      </div>
                    </div>
                    {active === f.id && (
                      <div className="place-picker">
                        <div className="picker-heading">
                          <strong>Starting point</strong>
                          <button
                            className="icon-button"
                            aria-label="Close location search"
                            onClick={() => setActive(null)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <div className="place-search-wrap">
                          <Search size={16} aria-hidden="true" />
                          <input
                            autoFocus
                            id="place-search"
                            role="combobox"
                            aria-label="Search Jakarta"
                            aria-expanded="true"
                            aria-controls="place-options"
                            aria-autocomplete="list"
                            aria-activedescendant={
                              highlightedOption === null
                                ? undefined
                                : `place-option-${highlightedOption}`
                            }
                            className="place-search"
                            placeholder="Search Jakarta"
                            value={query}
                            onChange={(event) => {
                              const value = event.target.value;
                              const nextMatches = searchPlaces(value);
                              setQuery(value);
                              setHighlightedOption(
                                value && nextMatches.length ? 2 : null,
                              );
                            }}
                            onKeyDown={(event) => {
                              const optionCount = 2 + matches.length;
                              if (event.key === "Escape") {
                                event.preventDefault();
                                const id = active;
                                setActive(null);
                                if (id !== null) focusLocation(id);
                              } else if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setHighlightedOption((current) =>
                                  current === null
                                    ? 0
                                    : (current + 1) % optionCount,
                                );
                              } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setHighlightedOption((current) =>
                                  current === null
                                    ? optionCount - 1
                                    : (current - 1 + optionCount) % optionCount,
                                );
                              } else if (
                                event.key === "Enter" &&
                                highlightedOption !== null
                              ) {
                                event.preventDefault();
                                chooseOption(highlightedOption);
                              }
                            }}
                          />
                          {query && (
                            <button
                              className="clear-search"
                              aria-label="Clear search"
                              onClick={() => {
                                setQuery("");
                                setHighlightedOption(null);
                                document
                                  .getElementById("place-search")
                                  ?.focus();
                              }}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                        <div
                          className="place-options"
                          id="place-options"
                          role="listbox"
                          aria-label="Location suggestions"
                        >
                          <button
                            type="button"
                            id="place-option-0"
                            role="option"
                            aria-selected={highlightedOption === 0}
                            onClick={() => chooseOption(0)}
                          >
                            <Navigation size={15} />
                            Your location
                          </button>
                          <button
                            type="button"
                            id="place-option-1"
                            role="option"
                            aria-selected={highlightedOption === 1}
                            onClick={() => chooseOption(1)}
                          >
                            <Crosshair size={15} />
                            Choose on map
                          </button>
                          {matches.map((place, index) => (
                            <button
                              type="button"
                              key={place.name}
                              id={`place-option-${index + 2}`}
                              role="option"
                              aria-selected={highlightedOption === index + 2}
                              onClick={() => choosePlace(place)}
                            >
                              <MapPin size={14} />
                              {place.name}
                            </button>
                          ))}
                          {!!query && !matches.length && (
                            <div
                              className="place-empty"
                              role="option"
                              aria-disabled="true"
                            >
                              {outsideQuery(query)
                                ? "Only mainland Jakarta is covered."
                                : "No match. Place a pin on the map."}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {friends.length < 6 && (
                <button
                  className="add-friend"
                  disabled={busy}
                  onClick={() => addFriend()}
                >
                  <Plus size={15} />
                  Add friend
                </button>
              )}
              <div className="search-options">
                <label className="objective-label" htmlFor="objective">
                  Optimize
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
                    <option value="balanced">Shortest longest trip</option>
                    <option value="total">Shortest total distance</option>
                  </select>
                  <ChevronDown size={14} />
                </div>
                <div className="method-label">
                  Animation{" "}
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
                    aria-pressed={method === "together"}
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
                    aria-pressed={method === "sequential"}
                    disabled={busy}
                    onClick={() => setMethod("sequential")}
                  >
                    <ArrowDown size={14} />
                    One by one
                  </button>
                </div>
              </div>
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
                    Searching…
                  </>
                ) : (
                  <>
                    {!network ? (
                      <span className="spinner" />
                    ) : (
                      <Sparkles size={17} />
                    )}
                    {!network
                      ? loadError
                        ? "Map unavailable"
                        : "Loading streets…"
                      : "Find meeting point"}
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
                  setObjective("balanced");
                  setMethod("together");
                  shared.current = false;
                  setActive(null);
                  history.replaceState(null, "", location.pathname);
                }}
              >
                <RotateCcw size={12} />
                Reset
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
              onAdd={addFriendAt}
              onNotice={setNotice}
            />
            {(!network || loadError) && (
              <div className="map-loading" role="status">
                {loadError ? (
                  <>
                    <strong>Couldn’t load Jakarta’s streets.</strong>
                    <button onClick={() => setLoadAttempt((x) => x + 1)}>
                      Try again
                    </button>
                  </>
                ) : (
                  <>
                    <span className="spinner" />
                    Loading streets
                    {download > 0
                      ? ` · ${(download / 1000000).toFixed(1)} MB`
                      : "…"}
                  </>
                )}
              </div>
            )}
            {active !== null && (
              <div className="map-pick-message">
                <Crosshair size={15} />
                Place {friendLabel(friends.find((f) => f.id === active)!)}’s pin
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
                      ? "Searching…"
                      : method === "together"
                        ? "Searching…"
                        : `Searching: ${friendLabel(friends[Math.min(friends.length - 1, Math.floor(progress * friends.length))])}`}
                  </strong>
                  <span>
                    {result
                      ? `${exploredNow.toLocaleString()} street segments explored`
                      : "Searching the real street network"}
                  </span>
                </div>
                <button
                  className="skip-button"
                  onClick={() => {
                    skip.current = true;
                    if (running) {
                      cancelAnimationFrame(timer.current);
                      setProgress(1);
                      setRunning(false);
                    }
                  }}
                >
                  Skip
                </button>
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
            {!phonePortrait && done && nearby && meeting && active === null && (
              <ResultCard
                result={result!}
                together={together}
                nearby={nearby}
                meeting={meeting}
                onShare={share}
                onCopy={() => {
                  navigator.clipboard
                    ?.writeText(`${meeting[0]}, ${meeting[1]}`)
                    .then(() => setNotice("Meeting coordinates copied."))
                    .catch(() => setNotice("Could not copy coordinates."));
                }}
                onReplay={() => start(true)}
              />
            )}
          </div>
        </section>
      </main>
      <span className="sr-only" role="status" aria-live="polite">
        {done && nearby
          ? `Meeting point: ${together ? "Together at" : "Near"} ${nearby.name}. Total distance ${result.trips.reduce((a, b) => a + b, 0).toFixed(1)} kilometres.`
          : ""}
      </span>
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
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Add 2–6 friends.</strong>
            <span>
              Choose 2–6 starting points from saved Jakarta places, drag a pin,
              or click the map.
            </span>
          </li>
          <li>
            <strong>Choose an objective.</strong>
            <span>
              “Balance everyone’s distance” minimizes the longest street trip.
              “Shortest total group distance” minimizes everyone’s combined
              distance.
            </span>
          </li>
          <li>
            <strong>Find a meeting point.</strong>
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
            Coverage: mainland Jakarta, 106.68–106.98°E, 6.08–6.38°S. Islands
            and locations away from mapped streets are not supported. Street
            data is bundled, so no map API key is needed. Shared links contain
            your chosen names and locations.
          </p>
        </div>
        <button
          className="find-button"
          disabled={!network || busy}
          onClick={() => {
            setHelp(false);
            start();
          }}
        >
          Find meeting point
          <ArrowRight size={16} />
        </button>
      </dialog>
    </>
  );
}

function ResultCard({
  result,
  together,
  nearby,
  meeting,
  onShare,
  onCopy,
  onReplay,
}: {
  result: SearchResult;
  together: boolean;
  nearby: Place;
  meeting: number[];
  onShare: () => void;
  onCopy: () => void;
  onReplay: () => void;
}) {
  const total = result.trips.reduce((sum, trip) => sum + trip, 0);
  return (
    <div className="result-card" aria-live="polite">
      <div className="result-eyebrow">
        <span className="result-check">
          <Check size={11} />
        </span>
        Meeting point
      </div>
      <h2>
        {together ? "Together at" : "Near"} {nearby.name}
      </h2>
      <div className="result-stats">
        <div>
          <strong>
            {together
              ? "0"
              : Math.max(...result.trips) < 0.05
                ? "<0.1"
                : Math.max(...result.trips).toFixed(1)}
            <small> km</small>
          </strong>
          <span>{together ? "no travel needed" : "longest trip"}</span>
        </div>
        <div>
          <strong>
            {together ? "0" : total < 0.05 ? "<0.1" : total.toFixed(1)}
            <small> km</small>
          </strong>
          <span>total distance</span>
        </div>
      </div>
      <div className="result-actions">
        <a
          className="directions-link"
          href={`https://www.google.com/maps/dir/?api=1&destination=${meeting[0]},${meeting[1]}`}
          target="_blank"
          rel="noreferrer"
        >
          <Navigation size={15} />
          Directions
        </a>
        <div className="result-action">
          <button onClick={onShare} aria-label="Share meeting point">
            <Share2 size={16} />
          </button>
          <span>Share</span>
        </div>
        <div className="result-action">
          <button onClick={onCopy} aria-label="Copy meeting coordinates">
            <Copy size={16} />
          </button>
          <span>Copy</span>
        </div>
        <div className="result-action">
          <button onClick={onReplay} aria-label="Replay the search">
            <RotateCcw size={16} />
          </button>
          <span>Replay</span>
        </div>
      </div>
    </div>
  );
}
