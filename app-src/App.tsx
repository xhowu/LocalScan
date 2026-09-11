import { useEffect, useMemo, useState } from 'react';
import { parseHash, navigate, type Route } from './router';
import {
  getActiveWarehouseId,
  getTheme,
  getWarehouse,
  listWarehouses,
} from './db';
import { ToastHost, ConfirmHost } from './lib/ui';
import { ItemsPage } from './pages/ItemsPage';
import { ScanPage } from './pages/ScanPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { EditItemPage } from './pages/EditItemPage';
import { SyncPage } from './pages/SyncPage';
import { SettingsPage } from './pages/SettingsPage';
import { WarehousesPage } from './pages/WarehousesPage';
import './App.css';

function applyTheme() {
  const mode = getTheme();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyTheme();
    setReady(true);
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => applyTheme();
    mq.addEventListener('change', onScheme);
    return () => {
      window.removeEventListener('hashchange', onHash);
      mq.removeEventListener('change', onScheme);
    };
  }, []);

  // Auto-enter single warehouse
  useEffect(() => {
    if (!ready) return;
    if (route.name === 'items' || route.name === 'warehouses') {
      const list = listWarehouses();
      if (list.length === 0) {
        // seed will create one; force refresh
        setTick((t) => t + 1);
      } else if (list.length === 1 && route.name === 'warehouses') {
        // stay if user explicitly opened warehouses via header
      }
    }
  }, [ready, route.name]);

  const activeWh = useMemo(() => {
    void tick;
    const id = getActiveWarehouseId();
    return id ? getWarehouse(id) : null;
  }, [tick, route]);

  const showTabs = route.name !== 'warehouses' && route.name !== 'edit';

  if (!ready) return <div className="shell boot">码上记</div>;

  // If no warehouse, show warehouses page
  const forceWarehouses = !getActiveWarehouseId();

  return (
    <div className="shell" data-route={forceWarehouses ? 'warehouses' : route.name}>
      <header className="topbar glass">
        <button type="button" className="brand" onClick={() => navigate({ name: 'items' })}>
          <span className="brand-mark">LOCALSCAN</span>
          <span className="brand-name">{activeWh?.name ?? '码上记'}</span>
        </button>
        <div className="topbar-actions">
          <button
            type="button"
            className="icon-btn"
            title="切换仓库"
            onClick={() => navigate({ name: 'warehouses' })}
          >
            仓
          </button>
          <span className="local-pill">本地</span>
        </div>
      </header>

      <main className="main">
        {forceWarehouses ? (
          <WarehousesPage onChanged={() => setTick((t) => t + 1)} />
        ) : (
          <>
            {route.name === 'warehouses' && <WarehousesPage onChanged={() => setTick((t) => t + 1)} />}
            {route.name === 'items' && <ItemsPage key={tick} />}
            {route.name === 'scan' && <ScanPage />}
            {route.name === 'detail' && <ItemDetailPage id={route.id} />}
            {route.name === 'edit' && <EditItemPage id={route.id} initialCode={route.code} />}
            {route.name === 'sync' && <SyncPage />}
            {route.name === 'settings' && <SettingsPage onThemeChange={applyTheme} />}
          </>
        )}
      </main>

      {showTabs && !forceWarehouses && (
        <nav className="tabbar glass" aria-label="主导航">
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

      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
