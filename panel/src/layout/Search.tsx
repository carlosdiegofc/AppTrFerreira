// The search in the middle of the top bar: a section, a truck, a trailer or a driver by name, plate or phone, or the text
// itself in Viajes and in Gastos. Empty, it offers the sections. The lists are read the first time it opens; one that
// could not be read is said, so a missing truck or driver does not look like a search with nothing.
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '../components/Icon';
import { ErrorNote } from '../components/ui';
import { useCatalog, useDrivers, useVehicles } from '../data/hooks';
import { driverPath, trailerPath, truckPath } from '../lib/paths';
import { SEARCH_GROUPS, type SearchItem, searchIn, searchItem, searchItems } from '../lib/search';
import { trailerLabel, truckEntries } from '../lib/vehicles';
import { SECTIONS } from '../sections';
import { usePopover } from './popover';

const SECTION_ITEMS = SECTIONS.map((s) => searchItem('Secciones', s.path, s.label, s.ready ? '' : 'Pronto', '/' + s.path, s.icon));

export function Search() {
  const navigate = useNavigate();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const { open, setOpen, ref } = usePopover();
  // On a phone the box opens over the bar from its button, and closes with the results.
  const [phoneOpen, setPhoneOpen] = useState(false);
  useEffect(() => {
    if (phoneOpen) input.current?.focus();
  }, [phoneOpen]);
  useEffect(() => {
    if (!open) setPhoneOpen(false);
  }, [open]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [wanted, setWanted] = useState(false);
  const catalog = useCatalog();
  const { query: vehiclesRead, vehicles, hitches } = useVehicles(wanted);
  const { query: driversRead, drivers } = useDrivers(wanted);
  const reads = [
    { read: catalog, what: 'los camiones y los acoplados' },
    { read: vehiclesRead, what: 'los camiones y los acoplados' },
    { read: driversRead, what: 'los choferes' },
  ];
  const failed = reads.filter(({ read }) => read.error && read.data === undefined);
  const missing = [...new Set(failed.map((f) => f.what))];
  const reading = reads.some(({ read }) => read.isLoading);

  const items = useMemo(() => {
    const { current, gone } = truckEntries(catalog.data ?? [], vehicles, hitches);
    const trucks = [...current, ...gone].map((t) =>
      searchItem('Camiones', t.key, t.label, gone.includes(t) ? 'De baja' : t.trailer ? `Con ${trailerLabel(t.trailer)}` : 'Camión', truckPath(t.key), 'truck', [
        t.plate,
        t.card?.brand ?? '',
        t.card?.model ?? '',
      ]),
    );
    const trailers = vehicles
      .filter((v) => v.kind === 'trailer')
      .map((v) => searchItem('Acoplados', v.id, trailerLabel(v), v.leftOn ? 'De baja' : v.body || 'Acoplado', trailerPath(v.id), 'box', [v.plate, v.brand, v.model]));
    const people = drivers.map((d) => searchItem('Choferes', d.id, d.name, d.active ? 'Chofer' : 'Ya no trabaja', driverPath(d.id), 'person', [d.phone]));
    return [...SECTION_ITEMS, ...trucks, ...trailers, ...people];
  }, [catalog.data, vehicles, hitches, drivers]);

  const found = useMemo(() => searchItems(q, items), [q, items]);
  // Empty, the sections; with text, what has it and then the text itself in Viajes and in Gastos.
  const typed = q.trim();
  const results = typed === '' ? SECTION_ITEMS : [...found, ...searchIn(q)];
  // «No hay…» only once every list answered: before, it says it is reading; a list that failed has its own note.
  const status =
    typed === '' || found.length > 0 || failed.length > 0 ? '' : reading ? 'Leyendo los camiones y los choferes…' : `No hay camiones, acoplados, choferes ni secciones con «${typed}».`;

  const close = () => {
    setOpen(false);
    setPhoneOpen(false);
    input.current?.blur();
  };
  const go = (item: SearchItem | undefined) => {
    if (!item) return;
    setQ('');
    close();
    navigate(item.path);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active] ?? results[0]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (q !== '') setQ('');
      else close();
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  return (
    <div className={`search${phoneOpen ? ' is-open' : ''}`} ref={ref} role="search">
      <button type="button" className="round search-toggle" aria-label="Abrir la búsqueda" title="Buscar" onClick={() => setPhoneOpen(true)}>
        <Icon name="search" size={20} />
      </button>
      <div className="search-box">
        <Icon name="search" size={18} />
        <input
          ref={input}
          type="search"
          role="combobox"
          // Not «Buscar»: that is the search field of each list.
          aria-label="Búsqueda en el panel"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results.length > 0 ? optionId(Math.min(active, results.length - 1)) : undefined}
          placeholder="Buscar un camión, un chofer o una sección…"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setWanted(true);
            setOpen(true);
          }}
          onKeyDown={onKey}
        />
        {phoneOpen && (
          <button type="button" className="btn btn-icon search-close" aria-label="Cerrar la búsqueda" onClick={close}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      {open && (
        <div className="popover search-results">
          {typed !== '' && failed.length > 0 && (
            // A click on «Reintentar» leaves the box focused, like a click on an option.
            <div onMouseDown={(e) => e.preventDefault()}>
              <ErrorNote onRetry={() => failed.forEach(({ read }) => void read.refetch())}>No se pudieron leer {missing.join(' ni ')}: puede faltar alguno en los resultados.</ErrorNote>
            </div>
          )}
          <div role="status">{status && <p className="search-none">{status}</p>}</div>
          <div id={listId} role="listbox" aria-label="Resultados">
            {SEARCH_GROUPS.map((group) => {
              const inGroup = results.map((r, i) => ({ r, i })).filter(({ r }) => r.group === group);
              if (inGroup.length === 0) return null;
              return (
                <div key={group} role="group" aria-label={group}>
                  <h3 aria-hidden="true">{group}</h3>
                  {inGroup.map(({ r, i }) => (
                    <div
                      key={r.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === active}
                      className="search-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                    >
                      <span className="search-icon">
                        <Icon name={r.icon} size={17} />
                      </span>
                      <span>
                        <strong>{r.title}</strong>
                        {r.detail && <small>{r.detail}</small>}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
