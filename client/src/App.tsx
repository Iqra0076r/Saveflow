import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { siteConfig } from './config/site';
import { navigate, usePath } from './router';
import type { MediaMetadata, PlatformInfo, PlatformKey } from './types';

const platformBrand: Record<PlatformKey, { label: string; glyph: string; cls: string }> = {
  youtube: { label: 'YouTube', glyph: '▶', cls: 'youtube' },
  tiktok: { label: 'TikTok', glyph: '♪', cls: 'tiktok' },
  instagram: { label: 'Instagram', glyph: '◎', cls: 'instagram' },
  facebook: { label: 'Facebook', glyph: 'f', cls: 'facebook' },
  x: { label: 'X', glyph: '𝕏', cls: 'x' },
  vimeo: { label: 'Vimeo', glyph: 'v', cls: 'vimeo' },
  pinterest: { label: 'Pinterest', glyph: 'p', cls: 'pinterest' },
};

function detectPlatform(raw: string): PlatformKey | null {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('facebook.com') || host === 'fb.watch') return 'facebook';
    if (host === 'x.com' || host.endsWith('.x.com') || host.includes('twitter.com')) return 'x';
    if (host.includes('vimeo.com')) return 'vimeo';
    if (host.includes('pinterest.com') || host === 'pin.it') return 'pinterest';
    return null;
  } catch { return null; }
}

function formatDuration(seconds?: number) {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="logo" aria-label="SaveFlow home" onClick={() => navigate('/')} role="button" tabIndex={0}>
    <span className="logo-mark"><i /><i /></span>{!compact && <strong>SaveFlow</strong>}
  </div>;
}

function PlatformIcon({ platform, size = 'md' }: { platform: PlatformKey; size?: 'sm' | 'md' | 'lg' }) {
  const item = platformBrand[platform];
  return <span className={`platform-icon ${item.cls} ${size}`}>{item.glyph}</span>;
}

function ThemeToggle() {
  const [light, setLight] = useState(() => localStorage.getItem('sf-theme') === 'light');
  useEffect(() => {
    document.documentElement.classList.toggle('light', light);
    localStorage.setItem('sf-theme', light ? 'light' : 'dark');
  }, [light]);
  return <button className="theme-toggle" onClick={() => setLight(v => !v)} aria-label="Toggle theme"><span>☼</span><i className={light ? 'on' : ''}>☾</i></button>;
}

function Navbar() {
  return <header className="nav-shell">
    <nav className="navbar wrap">
      <Logo />
      <div className="nav-links">
        <button onClick={() => navigate('/')}>Downloader</button>
        <button onClick={() => navigate('/supported-sites')}>Supported Sites</button>
        <a href={`${import.meta.env.BASE_URL}#how`}>How It Works</a>
        <a href={`${import.meta.env.BASE_URL}#faq`}>FAQ</a>
      </div>
      <div className="nav-actions"><ThemeToggle /><button className="btn glass small" onClick={() => navigate('/admin')}>Sign In</button></div>
    </nav>
  </header>;
}

function AmbientArt({ variant = 'hero' }: { variant?: 'hero' | 'supported' | 'admin' }) {
  return <div className={`ambient-art ${variant}`} aria-hidden="true">
    <span className="art-sphere s1" /><span className="art-sphere s2" /><span className="art-sphere s3" />
    <span className="orb o1" /><span className="orb o2" /><span className="orb o3" />
    <span className="chrome-ribbon r1" /><span className="chrome-ribbon r2" />
  </div>;
}

function PlatformPill({ platform }: { platform: PlatformKey }) {
  const info = platformBrand[platform];
  return <span className="platform-pill"><PlatformIcon platform={platform} size="sm" />{info.label}</span>;
}

function Downloader() {
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [selected, setSelected] = useState('best');
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'ready' | 'downloading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const pollRef = useRef<number | null>(null);
  const detected = useMemo(() => detectPlatform(url), [url]);

  useEffect(() => {
    api.platforms().then(data => setEngineReady(data.engine.ready)).catch(() => setEngineReady(false));
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  async function analyze(nextUrl = url) {
    const clean = nextUrl.trim();
    if (!clean) return;
    if (!detectPlatform(clean)) {
      setPhase('error'); setMessage('Paste a supported YouTube, TikTok, Instagram, Facebook, X, Vimeo or Pinterest link.'); return;
    }
    setPhase('analyzing'); setMetadata(null); setMessage('Analyzing your link…'); setProgress(null);
    try {
      const data = await api.analyze(clean);
      setMetadata(data); setSelected(data.formats.find(f => f.recommended)?.id || data.formats[0]?.id || 'best');
      setPhase('ready'); setMessage('Your download is ready');
    } catch (error) {
      setPhase('error'); setMessage(error instanceof Error ? error.message : 'Could not analyze this link.');
    }
  }

  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      if (text) void analyze(text);
    } catch {
      setMessage('Clipboard permission was not granted. Paste the link into the field manually.');
      setPhase('error');
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!text) return;
    setUrl(text);
    window.setTimeout(() => void analyze(text), 80);
  }

  async function download() {
    if (!metadata) return;
    setPhase('downloading'); setProgress(null); setMessage('Preparing your download…');
    try {
      const { jobId } = await api.startDownload(url, selected, metadata.title);
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          const { job } = await api.job(jobId);
          setProgress(job.progress); setMessage(job.message);
          if (job.status === 'ready') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            setPhase('success'); setProgress(100); setMessage('Download ready — starting now.');
            const link = document.createElement('a'); link.href = `/api/v1/jobs/${jobId}/file`; link.download = ''; document.body.appendChild(link); link.click(); link.remove();
          } else if (job.status === 'failed' || job.status === 'expired') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            setPhase('error'); setMessage(job.error || 'The download could not be prepared.');
          }
        } catch (error) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setPhase('error'); setMessage(error instanceof Error ? error.message : 'Download failed.');
        }
      }, 1000);
    } catch (error) {
      setPhase('error'); setMessage(error instanceof Error ? error.message : 'Could not start the download.');
    }
  }

  return <section className="downloader-zone" id="downloader">
    <div className="input-shell">
      <span className="link-glyph">↗</span>
      <input value={url} onChange={e => { setUrl(e.target.value); if (metadata) { setMetadata(null); setPhase('idle'); } }} onPaste={onPaste} onKeyDown={e => e.key === 'Enter' && void analyze()} placeholder="Paste a video URL here..." aria-label="Video URL" />
      <div className="detected-slot">
        {detected ? <><PlatformIcon platform={detected} size="sm" /><span>{platformBrand[detected].label} detected</span><b>✓</b></> : <><span className="pulse-dot" /><span>Detecting platform…</span></>}
      </div>
    </div>
    <div className="download-actions">
      <button className="btn glass" onClick={pasteLink}>▣ <span>Paste Link</span></button>
      <button className="btn primary" onClick={() => metadata ? download() : analyze()} disabled={phase === 'analyzing' || phase === 'downloading'}>↓ <span>{metadata ? 'Download' : 'Analyze & Download'}</span></button>
    </div>

    {engineReady === false && <div className="notice warning">Media engine not installed on this server. Run <strong>npm run setup:media</strong> once, then restart the backend.</div>}

    {(phase === 'analyzing') && <div className="result-card loading-card">
      <div className="skeleton thumb" /><div className="skeleton-lines"><i /><i /><i /><i /></div><strong>Analyzing your link…</strong>
    </div>}

    {metadata && ['ready', 'downloading', 'success'].includes(phase) && <ResultCard metadata={metadata} selected={selected} setSelected={setSelected} phase={phase} message={message} progress={progress} onDownload={download} />}
    {phase === 'error' && message && <div className="notice error"><b>!</b><span>{message}</span></div>}
  </section>;
}

function ResultCard({ metadata, selected, setSelected, phase, message, progress, onDownload }: { metadata: MediaMetadata; selected: string; setSelected: (id: string) => void; phase: string; message: string; progress: number | null; onDownload: () => void }) {
  return <div className="result-card">
    <div className="result-topline"><span className="success-pill">✓ Analyzed successfully</span><span className="spark">✦</span></div>
    <div className="result-grid">
      <div className="video-preview">
        {metadata.thumbnail ? <img src={metadata.thumbnail} alt={metadata.title} /> : <div className="thumbnail-fallback">SF</div>}
        <span className="play">▶</span>{metadata.duration && <span className="duration">{formatDuration(metadata.duration)}</span>}
        <div className="creator-row"><div><strong>{metadata.creator || 'Public creator'}</strong><small>{platformBrand[metadata.platform].label}</small></div><PlatformPill platform={metadata.platform} /></div>
      </div>
      <div className="result-options">
        <p className="eyebrow">YOUR DOWNLOAD IS READY</p>
        <h2>{metadata.title}</h2>
        <p className="muted">Choose a permitted format. Best available quality is selected automatically.</p>
        <div className="formats">
          {metadata.formats.map(format => <button key={format.id} className={`format-row ${selected === format.id ? 'selected' : ''}`} onClick={() => setSelected(format.id)} disabled={phase === 'downloading'}>
            <span className="radio">{selected === format.id ? '●' : '○'}</span><span className="quality-badge">{format.recommended ? 'BEST' : format.quality}</span><strong>{format.label}</strong>{format.recommended && <em>Recommended</em>}
          </button>)}
        </div>
        <button className="btn primary full" onClick={onDownload} disabled={phase === 'downloading'}>↓ {phase === 'downloading' ? 'Preparing…' : selected === 'best' ? 'Download Best Quality' : 'Download Selected'}</button>
        {phase === 'downloading' && <div className="progress-wrap"><div className={progress == null ? 'progress indeterminate' : 'progress'}><i style={progress == null ? undefined : { width: `${progress}%` }} /></div><span>{progress == null ? message : `${Math.round(progress)}% · ${message}`}</span></div>}
        {phase === 'success' && <div className="mini-success">✓ {message}</div>}
        <p className="legal-mini">♢ {siteConfig.legalNotice}</p>
      </div>
    </div>
  </div>;
}

function Home() {
  return <><Navbar /><main>
    <section className="hero"><AmbientArt /><div className="wrap hero-inner">
      <p className="eyebrow">{siteConfig.tagline}</p>
      <h1>Download Social<br /><span>Videos Easily</span><b>✦</b></h1>
      <p className="hero-copy">Paste a video link from a supported platform and save media you own or are authorized to download.</p>
      <Downloader />
      <div className="platform-row">{(Object.keys(platformBrand) as PlatformKey[]).map(p => <PlatformPill platform={p} key={p} />)}</div>
      <div className="trust-row"><span>⚡ Fast processing</span><i>•</i><span>♢ Privacy focused</span><i>•</i><span>∞ No software</span></div>
    </div></section>
    <HowItWorks /><Features /><SupportedPreview /><FAQ />
  </main><Footer /></>;
}

function HowItWorks() {
  return <section className="section wrap" id="how"><div className="section-head"><p className="eyebrow">THREE MOVES</p><h2>Paste. Detect. <span>Flow.</span></h2><p>No clutter, no confusing controls — just a direct path from public link to permitted media.</p></div>
    <div className="steps"><article><b>01</b><div className="step-icon">↗</div><h3>Copy Link</h3><p>Copy the public video URL from a supported social platform.</p></article><article><b>02</b><div className="step-icon">⌁</div><h3>Paste Link</h3><p>SaveFlow detects the platform and fetches available metadata automatically.</p></article><article><b>03</b><div className="step-icon">↓</div><h3>Download</h3><p>Best available quality is preselected. Choose another permitted format if you want.</p></article></div>
  </section>;
}

function Features() {
  const features = [['⚡','Fast Processing'],['◈','Mobile Friendly'],['▤','Multiple Formats'],['♢','Secure Processing'],['∞','No Installation'],['✦','Premium Interface']];
  return <section className="section wrap"><div className="feature-grid">{features.map(([icon, title]) => <article className="feature-card" key={title}><span>{icon}</span><h3>{title}</h3><p>Designed around a clean, private and focused download experience.</p></article>)}</div></section>;
}

function SupportedPreview() {
  return <section className="section supported-preview"><AmbientArt variant="supported" /><div className="wrap"><div className="section-head left"><p className="eyebrow">SUPPORTED SOURCES</p><h2>One link. Your favorite <span>platforms.</span></h2><p>Support is verified at runtime. SaveFlow does not pretend a blocked source is downloadable.</p></div><button className="btn glass" onClick={() => navigate('/supported-sites')}>Explore supported sites →</button></div></section>;
}

function FAQ() {
  const items = [
    ['What sites are supported?', 'SaveFlow recognizes YouTube, TikTok, Instagram, Facebook, X/Twitter, Vimeo and Pinterest. Actual download availability depends on the public source and what the media engine can lawfully access.'],
    ['Can I download private videos?', 'No. SaveFlow does not use social credentials, private-account scraping, cookie extraction, authentication bypass or similar methods.'],
    ['Does SaveFlow store my downloaded videos?', 'Downloads are prepared in temporary storage and expire automatically. The default design does not keep a public download history.'],
    ['Why can a download fail?', 'A source may be private, unavailable, rate-limited, protected, unsupported by the extractor, or may simply not expose a downloadable stream.'],
    ['Which quality does it choose?', 'SaveFlow preselects Best available. You can choose another returned quality or audio-only option when the backend reports one.'],
  ];
  return <section className="section wrap" id="faq"><div className="section-head"><p className="eyebrow">FAQ</p><h2>Questions, <span>answered.</span></h2></div><div className="faq-list">{items.map(([q,a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>;
}

function SupportedSites() {
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [engine, setEngine] = useState<boolean | null>(null);
  useEffect(() => { api.platforms().then(d => { setPlatforms(d.platforms); setEngine(d.engine.ready); }).catch(() => setEngine(false)); }, []);
  return <><Navbar /><main className="page-main"><AmbientArt variant="supported" /><section className="wrap page-hero"><p className="eyebrow">{siteConfig.tagline}</p><h1>One link. Your favorite <span>platforms.</span></h1><p>A focused downloader experience built around supported public links.</p>{engine === false && <div className="notice warning">This server has not installed the media engine yet; platform cards are shown as unavailable until setup is completed.</div>}</section>
    <section className="wrap platform-grid">{platforms.length ? platforms.map(p => <article className={`platform-card ${p.key}`} key={p.key}><PlatformIcon platform={p.key} size="lg" /><div><h2>{p.name}</h2><p>{p.description}</p><span className={`status ${p.status === 'Unavailable' ? 'off' : p.status === 'Supported' ? 'on' : 'limited'}`}>{p.status === 'Supported' ? '✓' : p.status === 'Unavailable' ? '×' : '◷'} {p.status}</span></div><button onClick={() => navigate('/')}>→</button></article>) : <div className="loading-lines">Loading platform status…</div>}</section></main><Footer /></>;
}


const platformRoutes: Record<string, { platform: PlatformKey; title: string; description: string }> = {
  '/youtube-video-downloader': { platform: 'youtube', title: 'YouTube Video Downloader', description: 'Paste a public YouTube video or Shorts link and SaveFlow will show the metadata and permitted formats reported by the backend.' },
  '/tiktok-video-downloader': { platform: 'tiktok', title: 'TikTok Video Downloader', description: 'Paste a public TikTok video link to detect the source, preview its thumbnail and see available permitted qualities.' },
  '/instagram-video-downloader': { platform: 'instagram', title: 'Instagram Video Downloader', description: 'Public Reels and public video posts only. Private Instagram accounts are not supported.' },
  '/facebook-video-downloader': { platform: 'facebook', title: 'Facebook Video Downloader', description: 'Analyze public Facebook video links where the source exposes media through a supported method.' },
  '/twitter-video-downloader': { platform: 'x', title: 'X / Twitter Video Downloader', description: 'Paste a public post URL containing video and SaveFlow will report what the source makes available.' },
  '/vimeo-video-downloader': { platform: 'vimeo', title: 'Vimeo Video Downloader', description: 'Download permitted public Vimeo videos when a downloadable format is available.' },
  '/pinterest-video-downloader': { platform: 'pinterest', title: 'Pinterest Video Downloader', description: 'Analyze public video pins and select from the permitted formats returned by the backend.' },
};

function PlatformLanding({ config }: { config: { platform: PlatformKey; title: string; description: string } }) {
  return <><Navbar /><main className="page-main"><AmbientArt /><section className="wrap page-hero"><PlatformIcon platform={config.platform} size="lg" /><p className="eyebrow">{siteConfig.tagline}</p><h1>{config.title}</h1><p>{config.description}</p><Downloader /></section><HowItWorks /><FAQ /></main><Footer /></>;
}

const legalCopy: Record<string, { title: string; text: string[] }> = {
  '/privacy': { title: 'Privacy Policy', text: ['SaveFlow is designed to minimize personal-data collection. The core downloader does not require social-media credentials and does not permanently store downloaded media by default.', 'Server operators may retain limited operational logs for security and reliability. Configure production logging to minimize IP retention and never log authentication tokens from third-party services.'] },
  '/terms': { title: 'Terms of Service', text: ['Use SaveFlow only for media you own, are authorized to download, that is in the public domain, appropriately licensed, or that the source platform expressly permits you to save.', 'You are responsible for following applicable copyright law and the terms of the source platform. Availability of technical access does not itself grant permission to copy content.'] },
  '/copyright': { title: 'Copyright Policy', text: ['SaveFlow is not intended to circumvent copyright protections, DRM, paywalls, subscriber-only access, authentication, private-account controls or geographic restrictions.', 'Rights holders and users should use the Contact page for copyright-related inquiries.'] },
  '/acceptable-use': { title: 'Acceptable Use', text: ['Do not use this service for private-content access, account scraping, credential collection, DRM circumvention, automated mass downloading, harassment, illegal redistribution, or attempts to access internal network resources.', 'The server validates supported public domains and rejects local/private-network targets.'] },
};

function LegalPage({ path }: { path: string }) {
  const copy = legalCopy[path] || legalCopy['/terms'];
  return <><Navbar /><main className="page-main"><section className="wrap text-page"><p className="eyebrow">SAVEFLOW LEGAL</p><h1>{copy.title}</h1>{copy.text.map((p,i) => <p key={i}>{p}</p>)}<div className="legal-callout">{siteConfig.legalNotice}</div></section></main><Footer /></>;
}

function Contact() {
  const [sent, setSent] = useState(false);
  return <><Navbar /><main className="page-main"><section className="wrap contact-layout"><div><p className="eyebrow">CONTACT</p><h1>Talk to <span>SaveFlow.</span></h1><p>Questions about a download, platform support, copyright or deployment? Send a message.</p></div><form className="contact-card" onSubmit={e => { e.preventDefault(); setSent(true); }}><label>Name<input required /></label><label>Email<input type="email" required /></label><label>Subject<input required /></label><label>Message<textarea rows={6} required /></label><button className="btn primary">Send Message</button>{sent && <div className="mini-success">✓ Demo form validated. Connect your preferred email provider in production.</div>}</form></section></main><Footer /></>;
}

function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => { api.adminSession().then(() => setAuthed(true)).catch(() => setAuthed(false)); }, []);
  if (authed == null) return <div className="admin-loading">Loading SaveFlow…</div>;
  return authed ? <AdminDashboard onLogout={() => { api.logout().finally(() => setAuthed(false)); }} /> : <AdminLogin onLogin={() => setAuthed(true)} />;
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('admin@example.com'); const [password, setPassword] = useState(''); const [error,setError] = useState('');
  async function submit(e: React.FormEvent) { e.preventDefault(); setError(''); try { await api.adminLogin(email,password); onLogin(); } catch(err) { setError(err instanceof Error ? err.message : 'Login failed'); } }
  return <main className="admin-auth"><AmbientArt variant="admin" /><form className="auth-card" onSubmit={submit}><Logo /><p className="eyebrow">PRIVATE CONTROL ROOM</p><h1>Welcome back.</h1><p>Admin access is intentionally hidden from the public navigation.</p><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label><button className="btn primary full">Sign In</button>{error && <div className="notice error">{error}</div>}<button type="button" className="text-btn" onClick={()=>navigate('/')}>← Back to website</button></form></main>;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [overview,setOverview]=useState<any>(null); const [platforms,setPlatforms]=useState<PlatformInfo[]>([]);
  async function refresh(){ try { const [o,p]=await Promise.all([api.adminOverview(),api.adminPlatforms()]); setOverview(o);setPlatforms(p.platforms); } catch { /* handled by session on reload */ } }
  useEffect(()=>{ void refresh(); const id=window.setInterval(refresh,5000); return()=>window.clearInterval(id);},[]);
  const stats = overview || {totalAnalyses:0,successfulDownloads:0,failedDownloads:0,successRate:100,queue:0,platformCounts:{},recent:[],engine:{ready:false}};
  const max = Math.max(1,...Object.values(stats.platformCounts || {}).map(Number));
  return <main className="admin-shell"><AmbientArt variant="admin" /><aside className="admin-side"><Logo /><div className="admin-nav"><button className="active">⌂ Overview</button><button>↓ Downloads</button><button>◇ Platforms</button><button>⚙ Settings</button><button>▤ Logs</button></div><div className="pro-card"><b>✦ SaveFlow Pro</b><p>Higher limits.<br/>More platforms.<br/>Priority processing.</p></div><button className="text-btn" onClick={onLogout}>Sign out</button></aside><section className="admin-main"><div className="admin-top"><div><h1>Overview</h1><p>Insights, performance and system status for your SaveFlow instance.</p></div><span className={`engine-pill ${stats.engine?.ready?'ok':'bad'}`}>{stats.engine?.ready?'● Media engine online':'● Media engine offline'}</span></div>
    <div className="kpi-grid"><Kpi label="Total analyses" value={stats.totalAnalyses} icon="▤"/><Kpi label="Successful downloads" value={stats.successfulDownloads} icon="↓"/><Kpi label="Success rate" value={`${stats.successRate}%`} icon="▥"/><Kpi label="Queue" value={stats.queue} icon="◇"/></div>
    <div className="admin-grid"><article className="admin-panel"><h3>Platform Distribution</h3><div className="bars">{platforms.map(p => { const n=stats.platformCounts?.[p.key]||0; return <div className="bar-row" key={p.key}><PlatformIcon platform={p.key} size="sm"/><span>{p.name}</span><div><i style={{width:`${(n/max)*100}%`}}/></div><b>{n}</b></div>})}</div></article><article className="admin-panel"><h3>Platform Controls</h3><div className="toggle-list">{platforms.map(p=><label key={p.key}><span><PlatformIcon platform={p.key} size="sm"/>{p.name}</span><input type="checkbox" checked={p.enabled} onChange={async e=>{await api.setPlatform(p.key,e.target.checked);void refresh();}}/><i/></label>)}</div></article></div>
    <div className="admin-grid bottom"><article className="admin-panel"><h3>Recent Activity</h3><div className="activity-table"><div className="table-head"><span>Platform</span><span>Title</span><span>Quality</span><span>Status</span></div>{stats.recent?.length ? stats.recent.map((r:any)=><div className="table-row" key={r.id}><span><PlatformIcon platform={r.platform} size="sm"/></span><span>{r.title||'Untitled media'}</span><span>{r.formatId}</span><span className={`job-status ${r.status}`}>● {r.status}</span></div>) : <p className="empty">Activity will appear after the first analysis/download.</p>}</div></article><article className="admin-panel server-card"><h3>Server Status</h3><p><b className={stats.engine?.ready?'green':'red'}>●</b> Media engine <span>{stats.engine?.ready?'Online':'Setup required'}</span></p><p><b className="green">●</b> API server <span>Online</span></p><p><b className="green">●</b> Temporary storage <span>Ready</span></p><p><b className="green">●</b> URL validation <span>Protected</span></p></article></div>
  </section></main>;
}

function Kpi({label,value,icon}:{label:string;value:string|number;icon:string}){return <article className="kpi"><span>{icon}</span><small>{label}</small><strong>{value}</strong><i>⌁⌁</i></article>}

function Footer(){return <footer><div className="wrap footer-grid"><div><Logo/><p>{siteConfig.description}</p></div><div><b>Product</b><button onClick={()=>navigate('/')}>Downloader</button><button onClick={()=>navigate('/supported-sites')}>Supported Sites</button><a href={`${import.meta.env.BASE_URL}#faq`}>FAQ</a></div><div><b>Legal</b><button onClick={()=>navigate('/privacy')}>Privacy</button><button onClick={()=>navigate('/terms')}>Terms</button><button onClick={()=>navigate('/copyright')}>Copyright</button><button onClick={()=>navigate('/acceptable-use')}>Acceptable Use</button></div><div><b>Reach us</b><button onClick={()=>navigate('/contact')}>Contact</button><span>Instagram</span><span>X / Twitter</span></div></div><div className="wrap footer-bottom">© {new Date().getFullYear()} SaveFlow. Built for permitted public media.</div></footer>}

class ErrorBoundary extends Component<{children:ReactNode},{hasError:boolean}>{state={hasError:false};static getDerivedStateFromError(){return{hasError:true}}componentDidCatch(error:Error,info:ErrorInfo){console.error(error,info)}render(){return this.state.hasError?<div className="fatal"><Logo/><h1>Something slipped out of the flow.</h1><p>Refresh the page and try again.</p><button className="btn primary" onClick={()=>location.reload()}>Reload</button></div>:this.props.children}}

function NotFound(){return <><Navbar/><main className="page-main"><section className="wrap text-page"><p className="eyebrow">404</p><h1>This link drifted away.</h1><p>The page you requested does not exist.</p><button className="btn primary" onClick={()=>navigate('/')}>Return home</button></section></main><Footer/></>}

export default function App(){const path=usePath();let page:ReactNode;if(path==='/')page=<Home/>;else if(path==='/supported-sites')page=<SupportedSites/>;else if(platformRoutes[path])page=<PlatformLanding config={platformRoutes[path]}/>;else if(path==='/contact')page=<Contact/>;else if(path==='/admin'||path.startsWith('/admin/'))page=<Admin/>;else if(legalCopy[path])page=<LegalPage path={path}/>;else page=<NotFound/>;return <ErrorBoundary>{page}</ErrorBoundary>}
