import { useEffect, useState } from 'react';

const rawBase = import.meta.env.BASE_URL || '/';
const base = rawBase === '/' ? '' : rawBase.replace(/\/$/, '');

function stripBase(pathname: string) {
  if (base && pathname.startsWith(base)) {
    const rest = pathname.slice(base.length);
    return rest || '/';
  }
  return pathname || '/';
}

function withBase(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!base) return normalized;
  return normalized === '/' ? `${base}/` : `${base}${normalized}`;
}

export function navigate(path: string) {
  history.pushState({}, '', withBase(path));
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function usePath() {
  const [path, setPath] = useState(stripBase(window.location.pathname));
  useEffect(() => {
    const update = () => setPath(stripBase(window.location.pathname));
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return path;
}
