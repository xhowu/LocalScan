import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseHash, navigate, type Route } from './router';
import { getActiveWarehouseId, getTheme, getWarehouse } from './db';
import { ToastHost, ConfirmHost } from './lib/ui';
import { ItemsPage } from './pages/ItemsPage';
import { ScanPage } from './pages/ScanPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { EditItemPage } from './pages/EditItemPage';
import { SyncPage } from './pages/SyncPage';
import { SettingsPage } from './pages/SettingsPage';
import { WarehouseDrawer } from './pages/WarehouseDrawer';
import { ChangelogPage } from './pages/ChangelogPage';
import { AboutPage } from './pages/AboutPage';
import { FieldTemplatesPage } from './pages/FieldTemplatesPage';
import { StatusFiltersPage } from './pages/StatusFiltersPage';
import { TaxonomyPage } from './pages/TaxonomyPage';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import './App.css';

function applyTheme() {
  const mode = getTheme();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (Capacitor.isNativePlatform()) {
    // Match system status/navigation bars to app chrome (WeChat-style)
    const bg = dark ? '#303030' : '#fafafa';
    void StatusBar.setBackgroundColor({ color: bg }).catch(() => undefined);
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const edgeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    applyTheme();
    setReady(true);
    const onHash = () => {
      setRoute(parseHash());
      // always start new page at top
      requestAnimationFrame(() => {
        document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'auto' });
      });
    };
    window.addEventListener('hashchange', onHash);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => applyTheme();
    mq.addEventListener('change', onScheme);

    const onPointerDown = (e: PointerEvent) => {
      if (e.clientX <= 28) edgeStart.current = { x: e.clientX, y: e.clientY };
      else edgeStart.current = null;
    };
    const onPointerUp = (e: PointerEvent) => {
      const s = edgeStart.current;
      if (!s) return;
      edgeStart.current = null;
      if (e.clientX - s.x > 64 && Math.abs(e.clientY - s.y) < 90) {
        setDrawerOpen(true);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    return () => {
      window.removeEventListener('hashchange', onHash);
      mq.removeEventListener('change', onScheme);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const activeWh = useMemo(() => {
    void tick;
    const id = getActiveWarehouseId();
    return id ? getWarehouse(id) : null;
  }, [tick, route]);

  const showTabs =
    route.name !== 'edit' &&
    route.name !== 'changelog' &&
    route.name !== 'about' &&
    route.name !== 'field-templates' &&
    route.name !== 'status-filters' &&
    route.name !== 'taxonomy';

  const onWhChanged = useCallback(() => setTick((t) => t + 1), []);

  if (!ready) return <div className="boot">码上记</div>;

  const forceDrawer = !getActiveWarehouseId();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <p className="brand-mark">LOCALSCAN</p>
          <p className="brand-title">码上记</p>
        </div>
        <button
          type="button"
          className="wh-switch"
          onClick={() => setDrawerOpen(true)}
          aria-label="切换仓库"
        >
          <span className="wh-label">仓库</span>
          <span className="wh-name">{activeWh?.name ?? '选择仓库'}</span>
          <span className="wh-caret" aria-hidden="true">
            ‹
          </span>
        </button>
      </header>

      <main className="main" data-route={route.name} key={route.name === 'scan' ? 'scan' : 'page'}>
        {route.name === 'items' && <ItemsPage key={tick} />}
        {route.name === 'scan' && <ScanPage />}
        {route.name === 'detail' && <ItemDetailPage id={route.id} />}
        {route.name === 'edit' && (
          <EditItemPage
            id={route.id}
            initialCode={route.code}
            from={route.from}
            key={route.id || 'new'}
          />
        )}
        {route.name === 'sync' && <SyncPage key={`sync-${tick}`} onChanged={onWhChanged} />}
        {route.name === 'settings' && (
          <SettingsPage
            onThemeChange={applyTheme}
            onOpenWarehouses={() => setDrawerOpen(true)}
            onWiped={() => setTick((t) => t + 1)}
          />
        )}
        {route.name === 'changelog' && <ChangelogPage />}
        {route.name === 'about' && <AboutPage />}
        {route.name === 'field-templates' && <FieldTemplatesPage />}
        {route.name === 'status-filters' && <StatusFiltersPage />}
        {route.name === 'taxonomy' && (
          <TaxonomyPage kind={route.kind === 'location' ? 'location' : 'category'} key={tick} />
        )}
      </main>

      {showTabs && (
        <nav className="tabbar" aria-label="主导航">
          <button
            type="button"
            className={route.name === 'items' || route.name === 'detail' ? 'tab active' : 'tab'}
            onClick={() => navigate({ name: 'items' })}
          >
            物品
          </button>
          <button
            type="button"
            className={route.name === 'scan' ? 'tab active' : 'tab'}
            onClick={() => navigate({ name: 'scan' })}
          >
            扫描
          </button>
          <button
            type="button"
            className={route.name === 'sync' ? 'tab active' : 'tab'}
            onClick={() => navigate({ name: 'sync' })}
          >
            同步
          </button>
          <button
            type="button"
            className={route.name === 'settings' ? 'tab active' : 'tab'}
            onClick={() => navigate({ name: 'settings' })}
          >
            设置
          </button>
        </nav>
      )}

      <WarehouseDrawer
        key={`drawer-${tick}`}
        open={drawerOpen || forceDrawer}
        canDismiss={!forceDrawer}
        onClose={() => setDrawerOpen(false)}
        onChanged={onWhChanged}
      />

      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
