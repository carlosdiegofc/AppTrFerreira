// Small DOM helpers. Text is always inserted as text (never as HTML), so data typed by drivers cannot inject code.
import { splitVehicle } from './util.js';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** Inline SVG icon from a fixed set (static markup, no user data). */
const ICONS = {
  truck: '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7" cy="17" r="2" fill="currentColor"/><circle cx="17" cy="17" r="2" fill="currentColor"/>',
  plant: '<path d="M3 20V10l5-3v3l5-3v3l5-3v13z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 14h2M11 14h2M15 14h2" stroke="currentColor" stroke-width="1.8"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};
export function icon(name, size = 20) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span;
}

export function plateBadge(vehicle, small = false) {
  const v = splitVehicle(vehicle);
  if (!v.plate) return h('span', { class: 'vehicle-text' }, v.label || 'Sin camión');
  return h('span', { class: 'plate' + (small ? ' small' : ''), title: v.label, 'aria-label': `Matrícula ${v.plate}` },
    h('span', { class: 'band' }, 'URUGUAY', h('span', { class: 'flag', 'aria-hidden': 'true' })),
    h('span', { class: 'num' }, v.plate));
}

export function statusPill(status) {
  return h('span', { class: 'pill ' + status.code }, status.label);
}

export function banner(kind, text, action) {
  return h('div', { class: 'banner ' + kind, role: kind === 'error' ? 'alert' : 'status' },
    h('span', null, text),
    action ? h('button', { class: 'btn small ghost', type: 'button', onclick: action.run }, action.label) : null);
}

export const loading = (text = 'Cargando…') => h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), text);

let toastTimer = null;
export function toast(text, kind = 'ok') {
  const box = document.getElementById('toast');
  if (!box) return;
  box.className = 'toast show ' + kind;
  box.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.className = 'toast'; }, 4200);
}

/** Modal window. close() resolves; onRequestClose can veto closing (e.g. unsaved changes). */
export function openModal({ title, body, footer = [], wide = false, onRequestClose }) {
  const dialog = h('dialog', { class: 'modal' + (wide ? ' wide' : ''), 'aria-label': title });
  const closeBtn = h('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'Cerrar' }, '✕');
  dialog.append(
    h('header', { class: 'modal-head' }, h('h2', null, title), closeBtn),
    h('div', { class: 'modal-body' }, body),
    footer.length ? h('footer', { class: 'modal-foot' }, footer) : '',
  );
  document.body.append(dialog);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
  };
  const request = async () => {
    if (onRequestClose && !(await onRequestClose())) return;
    close();
  };
  closeBtn.addEventListener('click', request);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); request(); });
  dialog.showModal();
  return { dialog, close, request };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (value) => { if (!answered) { answered = true; modal.close(); resolve(value); } };
    const ok = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => done(true) }, confirmLabel);
    const cancel = h('button', { class: 'btn ghost', type: 'button', onclick: () => done(false) }, cancelLabel);
    const modal = openModal({ title, body: h('p', { class: 'confirm-text' }, message), footer: [cancel, ok], onRequestClose: async () => { done(false); return false; } });
    ok.focus();
  });
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
