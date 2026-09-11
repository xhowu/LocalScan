export type Route =
  | { name: 'warehouses' }
  | { name: 'items' }
  | { name: 'scan' }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id?: string; code?: string | null }
  | { name: 'sync' }
  | { name: 'settings' };

export function parseHash(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, id] = raw.split('/');
  switch (name) {
    case 'warehouses':
      return { name: 'warehouses' };
    case 'scan':
      return { name: 'scan' };
    case 'item':
      return id ? { name: 'detail', id } : { name: 'items' };
    case 'edit':
      return { name: 'edit', id: id || undefined };
    case 'sync':
      return { name: 'sync' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'items' };
  }
}

export function navigate(route: Route) {
  let hash = '#/items';
  if (route.name === 'detail') hash = `#/item/${route.id}`;
  else if (route.name === 'edit') hash = route.id ? `#/edit/${route.id}` : '#/edit';
  else hash = `#/${route.name}`;

  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}
