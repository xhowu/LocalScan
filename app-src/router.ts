export type Route =
  | { name: 'items' }
  | { name: 'scan' }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id?: string; code?: string | null; from?: string }
  | { name: 'sync' }
  | { name: 'settings' }
  | { name: 'changelog' }
  | { name: 'about' }
  | { name: 'field-templates' }
  | { name: 'status-filters' }
  | { name: 'taxonomy'; kind?: 'category' | 'location' };

export function parseHash(): Route {
  let raw = location.hash.replace(/^#\/?/, '');
  let qs = '';
  const qIndex = raw.indexOf('?');
  if (qIndex >= 0) {
    qs = raw.slice(qIndex + 1);
    raw = raw.slice(0, qIndex);
  }
  const [name, id] = raw.split('/');
  const params = new URLSearchParams(qs);

  switch (name) {
    case 'scan':
      return { name: 'scan' };
    case 'item':
      return id ? { name: 'detail', id } : { name: 'items' };
    case 'edit':
      return {
        name: 'edit',
        id: id || undefined,
        code: params.get('code'),
        from: params.get('from') || undefined,
      };
    case 'sync':
      return { name: 'sync' };
    case 'settings':
      return { name: 'settings' };
    case 'changelog':
      return { name: 'changelog' };
    case 'about':
      return { name: 'about' };
    case 'field-templates':
      return { name: 'field-templates' };
    case 'status-filters':
      return { name: 'status-filters' };
    case 'taxonomy':
      return {
        name: 'taxonomy',
        kind: id === 'location' ? 'location' : 'category',
      };
    default:
      return { name: 'items' };
  }
}

const TAB_ROUTES = new Set(['items', 'scan', 'sync', 'settings']);

export function navigate(route: Route, opts?: { replace?: boolean }) {
  let hash = '#/items';
  if (route.name === 'detail') hash = `#/item/${route.id}`;
  else if (route.name === 'edit') {
    const p = new URLSearchParams();
    if (route.code) p.set('code', route.code);
    if (route.from) p.set('from', route.from);
    const qs = p.toString();
    hash = route.id ? `#/edit/${route.id}${qs ? `?${qs}` : ''}` : `#/edit${qs ? `?${qs}` : ''}`;
  } else if (route.name === 'taxonomy') {
    hash = `#/taxonomy/${route.kind === 'location' ? 'location' : 'category'}`;
  } else hash = `#/${route.name}`;

  // Tab switches replace history so Android back doesn't walk through every tab
  const useReplace = opts?.replace || TAB_ROUTES.has(route.name);
  if (useReplace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }

  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export function goBack(fallback: Route = { name: 'items' }) {
  if (history.length > 1) {
    history.back();
    return;
  }
  navigate(fallback);
}
