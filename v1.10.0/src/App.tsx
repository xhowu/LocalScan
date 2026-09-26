import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseHash, navigate, navFlags, TAB_ROUTES, type Route } from './router';
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
import { RecycleBinPage } from './pages/RecycleBinPage';
import { ManualPage } from './pages/ManualPage';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { setNativeChromeColor } from './lib/native-scan';
import { applyFontScale } from './lib/font-scale';
import './App.css';

function resolveTheme(): { dark: boolean; bg: string } {
  const mode = getTheme();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  return { dark, bg: dark ? '#303030' : '#fafafa' };
}

function applyTheme() {
  const { dark, bg } = resolveTheme();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  applyFontScale();
  // 让系统栏所在区域（原生 Window / DecorView 背景）跟主题一致，
  // 否则老 WebView 的 padding 区域会出现浅色黑边 / 深色白边
  setNativeChromeColor(bg);
  if (Capacitor.isNativePlatform()) {
    // Match system status/navigation bars to app chrome (WeChat-style)
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
  const drawerOpenRef = useRef(drawerOpen);
  /* callback ref + state：main 挂载（boot 画面结束后的首次出现、key 重挂）时
     hook 依赖真正变化并重挂监听器 —— 用 RefObject 时 effect 首跑时元素还不存在
     （boot 阶段）且依赖不再变化，监听器永远挂不上 */



  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  /**
   * 每次换页重新落地一次外观底色。
   * 扫码页会把原生 WebView/Window 背景改成透明（相机要从背后透出来），
   * 离开时若不重新刷一次，系统栏所在的那条区域就会露出黑底（深色尤其是黑隔断）。
   */
  useEffect(() => {
    setNativeChromeColor(resolveTheme().bg);
  }, [route.name]);

  useEffect(() => {
    applyTheme();
    setReady(true);
    const onHash = () => {
      // 同步记录即将离开页面的滚动位置：此刻 scrollTop 仍属旧页面，
      // 且早于 React commit —— 内容切换产生的 clamp 不会污染记忆，
      // “从未滚动过”的页面也会记下 0
      const el = mainRef.current;
      if (el) scrollMem.current.set(routeRef.current, el.scrollTop);
      setRoute(parseHash());
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

  /* Android 硬件 / 手势返回键 */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let handle: PluginListenerHandle | null = null;

    void CapApp.addListener('backButton', ({ canGoBack }) => {
      // 1) 仓库抽屉可关闭时，先关抽屉
      if (drawerOpenRef.current && getActiveWarehouseId()) {
        setDrawerOpen(false);
        return;
      }
      const r = parseHash();
      // 2) 已在物品页 → 退出应用
      if (r.name === 'items') {
        void CapApp.exitApp();
        return;
      }
      // 3) 主导航其余页 → 回到物品页（back 语义：保留物品页滚动记忆）
      if (TAB_ROUTES.has(r.name)) {
        navigate({ name: 'items' }, { back: true });
        return;
      }
      // 4) 栈内页面（详情 / 编辑 / 关于…）→ 回退
      if (canGoBack) history.back();
      else navigate({ name: 'items' });
    }).then((h) => {
      if (disposed) void h.remove();
      else handle = h;
    });

    return () => {
      disposed = true;
      if (handle) void (handle as PluginListenerHandle).remove();
    };
  }, []);

  /*
   * 滚动位置记忆（同步版）：
   * - 离开页面：hashchange 同步阶段写入 scrollMem（onHash，早于 React commit）；
   * - 恢复/置顶：useLayoutEffect 在 paint 前完成 —— 前进清目标记忆并回顶，
   *   返回恢复 saved。若用 passive effect + 双 rAF，新内容 commit 后遗留的
   *   旧 scrollTop 会被浏览器 clamp 到新内容高度（矮页面直接触底可见），
   *   且竞态中记忆会被 scroll 事件污染——这是“返回后前一页触底”的根因。
   */
  const mainRef = useRef<HTMLElement | null>(null);
  const scrollMem = useRef<Map<string, number>>(new Map());
  const routeRef = useRef(route.name);

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const prev = routeRef.current;
    routeRef.current = route.name;
    // 展开/收起策略：进入某页的“下级”页面（详情、手册）时保留其展开状态，
    // 去同级 / 上级页面则收回 —— 收回发生在离开时，返回该页即为收起态
    if (prev !== route.name) {
      if (prev === 'items' && route.name !== 'detail' && route.name !== 'edit') {
        try {
          sessionStorage.removeItem('localscan.expandedKids');
        } catch {
          /* ignore */
        }
      }
      if (prev === 'about' && route.name !== 'manual') {
        try {
          sessionStorage.removeItem('localscan.aboutOpenFeat');
        } catch {
          /* ignore */
        }
      }
    }
    if (navFlags.forwardTo === route.name) {
      // 前进：清目标页记忆并回顶（新页面从顶部开始）
      scrollMem.current.delete(route.name);
      navFlags.forwardTo = null;
      el.scrollTop = 0;
      return;
    }
    // 返回 / 首次：恢复记忆（未滚动过的页面为 0）
    el.scrollTop = scrollMem.current.get(route.name) ?? 0;
  }, [route.name]);

  useEffect(() => {
    // capture：scroll 不冒泡，捕获阶段从 window 接住 .main 的滚动；
    // main 因 scan key 重挂也无需重绑。写入值恒为 main 的 scrollTop，
    // 内层滚动容器（抽屉等）触发时写入的是未变化的同值，无副作用。
    const onScroll = () => {
      const el = mainRef.current;
      if (el) scrollMem.current.set(routeRef.current, el.scrollTop);
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, []);

  const showTabs =
    route.name !== 'edit' &&
    route.name !== 'changelog' &&
    route.name !== 'about' &&
    route.name !== 'field-templates' &&
    route.name !== 'status-filters' &&
    route.name !== 'taxonomy' &&
    route.name !== 'recycle' &&
    route.name !== 'manual';

  const onWhChanged = useCallback(() => setTick((t) => t + 1), []);

  if (!ready) return <div className="boot">码上记</div>;

  const forceDrawer = !getActiveWarehouseId();

  return (
    <div className="shell">
      <header
        className="topbar"
        onDoubleClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      >
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

      <main
        ref={(el) => {
          mainRef.current = el;
        }}
        className={showTabs ? 'main' : 'main no-tabs'}
        data-route={route.name}
        key={route.name === 'scan' ? 'scan' : 'page'}
      >
        {route.name === 'items' && <ItemsPage key={tick} />}
        {route.name === 'scan' && <ScanPage />}
        {route.name === 'detail' && <ItemDetailPage id={route.id} />}
        {route.name === 'edit' && (
          <EditItemPage
            id={route.id}
            initialCode={route.code}
            from={route.from}
            parentId={route.parent}
            key={route.id || `new-${route.code ?? ''}-${route.parent ?? ''}`}
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
        {route.name === 'recycle' && <RecycleBinPage />}
        {route.name === 'manual' && <ManualPage />}
      </main>

      {/* 悬浮按钮挂在 main 之外：fixed 元素不放进滚动容器，
          避免受容器内层叠/位移影响（回弹时代它曾跟着内容层位移） */}
      {route.name === 'items' && (
        <button
          type="button"
          className="fab"
          onClick={() => navigate({ name: 'edit' })}
          aria-label="添加物品"
        >
          +
        </button>
      )}

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
