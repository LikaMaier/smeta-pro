// Мини-замена react-router-dom для локального предпросмотра (в окружении нет пакета). В сборку приложения не входит.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
type Loc = { pathname: string; search: string; hash: string; state: any; key: string };
const read = (): Loc => ({ pathname: location.pathname, search: location.search, hash: location.hash, state: history.state?.usr ?? null, key: String(history.state?.idx ?? 0) });
const Ctx = createContext<{ loc: Loc; nav: (to: any, o?: any) => void }>(null as any);
const PCtx = createContext<Record<string, string>>({});
export function BrowserRouter({ children }: any) {
  const [loc, setLoc] = useState(read);
  useEffect(() => { if (history.state?.idx == null) history.replaceState({ idx: 0 }, ''); const f = () => setLoc(read()); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  const nav = useCallback((to: any, o: any = {}) => {
    if (typeof to === 'number') { history.go(to); return; }
    const idx = history.state?.idx ?? 0;
    if (o.replace) history.replaceState({ idx, usr: o.state }, '', to); else history.pushState({ idx: idx + 1, usr: o.state }, '', to);
    setLoc(read()); window.scrollTo(0, 0);
  }, []);
  return <Ctx.Provider value={{ loc, nav }}>{children}</Ctx.Provider>;
}
function match(pattern: string, path: string): Record<string, string> | null {
  if (pattern === '*') return {};
  const p = pattern.split('/').filter(Boolean), s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) { if (p[i].startsWith(':')) out[p[i].slice(1)] = decodeURIComponent(s[i]); else if (p[i] !== s[i]) return null; }
  return out;
}
export function Route(_: any) { return null; }
export function Routes({ children }: any) {
  const { loc } = useContext(Ctx);
  const routes = React.Children.toArray(children) as any[];
  let star: any = null;
  for (const r of routes) {
    if (r.props.path === '*') { star = r; continue; }
    const m = match(r.props.path, loc.pathname);
    if (m) return <PCtx.Provider value={m}>{r.props.element}</PCtx.Provider>;
  }
  return star ? star.props.element : null;
}
export const useNavigate = () => useContext(Ctx).nav;
export const useLocation = () => useContext(Ctx).loc;
export const useParams = () => useContext(PCtx) as any;
export function useSearchParams(): [URLSearchParams, (p: any, o?: any) => void] {
  const { loc, nav } = useContext(Ctx);
  const sp = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  return [sp, (p: any, o?: any) => { const q = new URLSearchParams(p).toString(); nav(loc.pathname + (q ? `?${q}` : ''), o); }];
}
export function Link({ to, children, replace, state, ...rest }: any) {
  const { nav } = useContext(Ctx);
  return <a href={to} {...rest} onClick={(e) => { rest.onClick?.(e); if (e.defaultPrevented) return; e.preventDefault(); nav(to, { replace, state }); }}>{children}</a>;
}
export function NavLink({ className, ...p }: any) { const { loc } = useContext(Ctx); const active = loc.pathname === p.to; return <Link {...p} className={typeof className === 'function' ? className({ isActive: active }) : className} />; }
export function Navigate({ to, replace }: any) { const { nav } = useContext(Ctx); useEffect(() => { nav(to, { replace }); }, []); return null; }
