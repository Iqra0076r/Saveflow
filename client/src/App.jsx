import { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const PLATFORM_META = {
  youtube: { label: "YouTube", mark: "▶", className: "youtube", copy: "Videos & Shorts" },
  tiktok: { label: "TikTok", mark: "♪", className: "tiktok", copy: "Public videos" },
  instagram: { label: "Instagram", mark: "◎", className: "instagram", copy: "Reels & video posts" },
  facebook: { label: "Facebook", mark: "f", className: "facebook", copy: "Public videos" },
  x: { label: "X", mark: "𝕏", className: "x", copy: "Public posts" },
  vimeo: { label: "Vimeo", mark: "v", className: "vimeo", copy: "Permitted videos" },
  pinterest: { label: "Pinterest", mark: "p", className: "pinterest", copy: "Public video pins" }
};

const HOST_MATCHES = [
  ["youtube", ["youtube.com", "youtu.be"]],
  ["tiktok", ["tiktok.com"]],
  ["instagram", ["instagram.com"]],
  ["facebook", ["facebook.com", "fb.watch"]],
  ["x", ["x.com", "twitter.com"]],
  ["vimeo", ["vimeo.com"]],
  ["pinterest", ["pinterest.com", "pin.it"]]
];

function detectPlatform(value) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const found = HOST_MATCHES.find(([, domains]) =>
      domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
    );
    return found?.[0] || null;
  } catch {
    return null;
  }
}

function api(path) {
  return `${API_BASE}${path}`;
}

async function fetchJSON(path, options) {
  const response = await fetch(api(path), options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "The request could not be completed.");
  return data;
}

function secondsToTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatSize(bytes) {
  if (!bytes || !Number.isFinite(bytes)) return "Size calculated when available";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="SaveFlow home">
      <span className="brand-glyph"><i /><b /></span>
      <span>SaveFlow</span>
    </a>
  );
}

function PlatformChip({ id, compact = false }) {
  const meta = PLATFORM_META[id];
  if (!meta) return null;
  return (
    <span className={`platform-chip ${meta.className} ${compact ? "compact" : ""}`}>
      <strong>{meta.mark}</strong>
      <span>{meta.label}</span>
    </span>
  );
}

function Loader() {
  return (
    <div className="analysis-loader" role="status">
      <div className="loader-orbit"><span /><span /><span /></div>
      <div>
        <strong>Analyzing your link…</strong>
        <p>Reading public metadata and available permitted formats.</p>
      </div>
    </div>
  );
}

function ResultCard({ analysis, selected, setSelected, onDownload, downloading, job }) {
  const meta = PLATFORM_META[analysis.platform] || PLATFORM_META.youtube;
  const duration = secondsToTime(analysis.duration);
  return (
    <section className="result-shell" id="result" aria-live="polite">
      <div className="result-heading">
        <div>
          <span className="eyebrow">LINK ANALYZED</span>
          <h2>Your download is <em>ready.</em></h2>
        </div>
        <span className="success-pill">✓ {analysis.elapsedMs ? `Analyzed in ${(analysis.elapsedMs / 1000).toFixed(1)}s` : "Media found"}</span>
      </div>

      <div className="result-grid">
        <article className="preview-card glass">
          <div className="thumbnail">
            {analysis.thumbnail ? (
              <img src={analysis.thumbnail} alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="thumbnail-fallback"><span>SF</span></div>
            )}
            <div className="thumb-shade" />
            <button className="play-disc" type="button" aria-label="Media preview">▶</button>
            {duration && <span className="duration">{duration}</span>}
          </div>
          <div className="creator-row">
            <div className="avatar">{(analysis.creator || "S").slice(0, 1).toUpperCase()}</div>
            <div className="creator-copy">
              <strong>{analysis.creator || "Public creator"}</strong>
              <span>Source metadata</span>
            </div>
            <PlatformChip id={analysis.platform} compact />
          </div>
        </article>

        <article className="download-card glass">
          <div className="media-title">
            <span className={`platform-icon ${meta.className}`}>{meta.mark}</span>
            <div>
              <span className="subtle">{meta.label}</span>
              <h3>{analysis.title || "Untitled media"}</h3>
            </div>
          </div>

          <div className="quality-list">
            {analysis.formats?.map((format) => (
              <button
                type="button"
                key={format.id}
                onClick={() => setSelected(format.id)}
                className={`quality-option ${selected === format.id ? "selected" : ""}`}
              >
                <span className="radio-dot" />
                <span className="quality-badge">{format.badge || format.quality || "MEDIA"}</span>
                <span className="quality-copy">
                  <strong>{format.label || format.quality}</strong>
                  <small>{format.ext?.toUpperCase() || "MP4"} · {formatSize(format.filesize)}</small>
                </span>
                {format.recommended && <span className="best-tag">BEST</span>}
              </button>
            ))}
          </div>

          {job?.status === "processing" && (
            <div className="progress-wrap">
              <div className="progress-meta">
                <span>Preparing your download…</span>
                <span>{Number.isFinite(job.progress) ? `${Math.round(job.progress)}%` : ""}</span>
              </div>
              <div className={`progress-track ${Number.isFinite(job.progress) ? "" : "indeterminate"}`}>
                <span style={Number.isFinite(job.progress) ? { width: `${job.progress}%` } : undefined} />
              </div>
            </div>
          )}

          <button
            className="primary download-main"
            type="button"
            disabled={!selected || downloading}
            onClick={onDownload}
          >
            <span>↓</span>
            {downloading ? "Preparing…" : "Download selected quality"}
          </button>

          <div className="assurance-row">
            <span>✓ Best available</span>
            <span>✓ Temporary processing</span>
            <span>✓ No software</span>
          </div>

          <p className="legal-mini">🛡 Download only content you own or have permission to save.</p>
        </article>
      </div>
    </section>
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState(null);
  const [apiOnline, setApiOnline] = useState(null);
  const [platformStatus, setPlatformStatus] = useState({});

  const detected = useMemo(() => detectPlatform(url), [url]);

  useEffect(() => {
    fetchJSON("/api/health")
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));

    fetchJSON("/api/v1/platforms")
      .then((data) => {
        const entries = Object.fromEntries((data.platforms || []).map((p) => [p.id, p]));
        setPlatformStatus(entries);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!jobId) return undefined;
    let stopped = false;

    async function poll() {
      try {
        const data = await fetchJSON(`/api/v1/jobs/${jobId}`);
        if (stopped) return;
        setJob(data);
        if (data.status === "ready") {
          stopped = true;
          const anchor = document.createElement("a");
          anchor.href = api(`/api/v1/jobs/${jobId}/file`);
          anchor.rel = "noopener";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => {
            setJobId("");
            setJob(null);
          }, 1400);
        }
        if (data.status === "failed" || data.status === "expired") {
          stopped = true;
          setError(data.message || "Download processing failed.");
          setJobId("");
        }
      } catch (err) {
        setError(err.message);
        setJobId("");
        stopped = true;
      }
    }

    poll();
    const timer = setInterval(() => !stopped && poll(), 1400);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobId]);

  async function analyze(value = url) {
    const target = value.trim();
    setError("");
    setAnalysis(null);
    setJob(null);
    setJobId("");

    if (!detectPlatform(target)) {
      setError("Paste a valid public link from a supported platform.");
      return;
    }

    setLoading(true);
    try {
      const started = performance.now();
      const data = await fetchJSON("/api/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target })
      });
      const result = { ...data, elapsedMs: performance.now() - started };
      setAnalysis(result);
      const best = result.formats?.find((f) => f.recommended) || result.formats?.[0];
      setSelected(best?.id || "");
      setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function pasteLink() {
    setError("");
    try {
      const text = (await navigator.clipboard.readText()).trim();
      setUrl(text);
      if (!text) {
        setError("Your clipboard does not contain a link.");
        return;
      }
      await analyze(text);
    } catch {
      setError("Clipboard access was blocked. Paste the link manually and press Download.");
    }
  }

  async function startDownload() {
    if (!analysis || !selected) return;
    setError("");
    try {
      const data = await fetchJSON("/api/v1/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: analysis.sourceUrl || url, formatId: selected })
      });
      setJobId(data.jobId);
      setJob({ status: "processing", progress: null });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="site" id="top">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <div className="chrome-ribbon ribbon-left" />
      <div className="chrome-ribbon ribbon-right" />

      <header className="nav-wrap">
        <nav className="nav glass">
          <Brand />
          <div className="nav-links">
            <a className="active" href="#downloader">Downloader</a>
            <a href="#supported">Supported Sites</a>
            <a href="#how">How It Works</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-right">
            <span className={`api-dot ${apiOnline === true ? "online" : apiOnline === false ? "offline" : ""}`} />
            <span className="api-text">{apiOnline === true ? "API online" : apiOnline === false ? "API waking" : "Checking API"}</span>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero" id="downloader">
          <div className="hero-art left-art">
            <div className="art-card art-a"><span>good<br />videos<br /><em>brighter days</em></span></div>
            <div className="art-card art-b" />
          </div>

          <div className="hero-copy">
            <span className="eyebrow">YOUR MEDIA. YOUR FLOW.</span>
            <h1>Download Social<br /><em>Videos Easily</em></h1>
            <p>Paste a video link from a supported platform and save media you own or are authorized to download.</p>

            <div className="url-console glass">
              <div className="url-row">
                <span className="link-symbol">⌁</span>
                <input
                  aria-label="Social video URL"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && analyze()}
                  placeholder="Paste a video URL here…"
                  autoComplete="off"
                  inputMode="url"
                />
                <div className="detected">
                  {detected ? (
                    <>
                      <PlatformChip id={detected} compact />
                      <span className="detected-check">✓</span>
                    </>
                  ) : (
                    <span>Auto-detect platform</span>
                  )}
                </div>
              </div>
              <div className="action-row">
                <button className="secondary" type="button" onClick={pasteLink}>▣ Paste Link</button>
                <button className="primary" type="button" onClick={() => analyze()} disabled={loading}>
                  ↓ {loading ? "Analyzing…" : "Download"}
                </button>
              </div>
            </div>

            {error && <div className="error-card">! {error}</div>}
            {loading && <Loader />}

            <div className="platform-row">
              {Object.keys(PLATFORM_META).map((id) => <PlatformChip key={id} id={id} />)}
            </div>

            <div className="trust-row">
              <span>⚡ Fast processing</span>
              <i />
              <span>◈ Privacy focused</span>
              <i />
              <span>∞ No software</span>
            </div>
          </div>

          <div className="hero-art right-art">
            <div className="art-card art-c"><span>save<br />create<br /><em>keep your flow</em></span></div>
            <div className="art-card art-d" />
          </div>
        </section>

        {analysis && (
          <ResultCard
            analysis={analysis}
            selected={selected}
            setSelected={setSelected}
            onDownload={startDownload}
            downloading={Boolean(jobId)}
            job={job}
          />
        )}

        <section className="supported section" id="supported">
          <div className="section-heading">
            <span className="eyebrow">SUPPORTED SOURCES</span>
            <h2>One link. Your favorite <em>platforms.</em></h2>
            <p>A focused downloader experience built around supported public links.</p>
          </div>
          <div className="bento">
            {Object.entries(PLATFORM_META).map(([id, meta], index) => {
              const state = platformStatus[id];
              return (
                <article className={`platform-card glass card-${index + 1}`} key={id}>
                  <span className={`big-platform ${meta.className}`}>{meta.mark}</span>
                  <div>
                    <h3>{meta.label}</h3>
                    <p>{meta.copy}</p>
                  </div>
                  <span className={`status-tag ${state?.status === "unavailable" ? "limited" : ""}`}>
                    {state?.label || "Public links"}
                  </span>
                  <span className="card-arrow">↗</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="how section" id="how">
          <div className="section-heading narrow">
            <span className="eyebrow">THREE STEPS</span>
            <h2>Paste. Preview. <em>Save.</em></h2>
          </div>
          <div className="steps">
            <article className="step glass"><b>01</b><span className="step-icon">⌁</span><h3>Copy a public link</h3><p>Copy an individual video URL from a supported source.</p></article>
            <article className="step glass"><b>02</b><span className="step-icon">✦</span><h3>Let SaveFlow analyze it</h3><p>We detect the platform, thumbnail and formats returned by the backend.</p></article>
            <article className="step glass"><b>03</b><span className="step-icon">↓</span><h3>Choose and download</h3><p>The best available permitted option is preselected for you.</p></article>
          </div>
        </section>

        <section className="faq section" id="faq">
          <div className="faq-layout">
            <div className="section-heading left">
              <span className="eyebrow">FAQ</span>
              <h2>Good questions.<br /><em>Clear answers.</em></h2>
              <p>SaveFlow is designed around public and authorized media rather than bypassing platform protections.</p>
            </div>
            <div className="faq-list">
              <details className="glass" open><summary>Does SaveFlow download private videos?</summary><p>No. Private accounts, login-only media, DRM-protected media and authentication bypasses are intentionally unsupported.</p></details>
              <details className="glass"><summary>Why might a supported platform fail?</summary><p>Platforms change frequently and not every public post exposes a permitted downloadable stream. SaveFlow reports the source response rather than pretending a download exists.</p></details>
              <details className="glass"><summary>Which quality is selected?</summary><p>The interface preselects the best available format returned by the backend. You can choose another listed quality before processing.</p></details>
              <details className="glass"><summary>Do you permanently store videos?</summary><p>No. Processing uses temporary files and the backend automatically removes expired jobs.</p></details>
            </div>
          </div>
        </section>

        <section className="legal-strip glass">
          <span>🛡</span>
          <p><strong>Use SaveFlow responsibly.</strong> Download only content that you own or have permission to save. Users are responsible for complying with applicable copyright law and the terms of the source platform.</p>
        </section>
      </main>

      <footer>
        <Brand />
        <p>Your media. Your flow.</p>
        <div><a href="#downloader">Downloader</a><a href="#supported">Supported Sites</a><a href="#faq">FAQ</a></div>
        <small>© {new Date().getFullYear()} SaveFlow</small>
      </footer>
    </div>
  );
}
