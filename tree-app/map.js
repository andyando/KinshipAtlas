// Offline world map for Kinship Atlas. Draws bundled Natural Earth outlines as SVG and places people by
// resolving place text against bundled GeoNames data (window.KINSHIP_GEO). Nothing is sent over the network.
(function () {
  'use strict';

  const WORLD = 1000;
  const MAX_LAT = 82;
  const MIN_LAT = -58;
  const CLUSTER_PX = 34;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const countryAliases = {
    usa: 'US', us: 'US', 'u s a': 'US', 'u s': 'US', 'united states': 'US', 'united states of america': 'US', america: 'US',
    uk: 'GB', 'u k': 'GB', 'great britain': 'GB', britain: 'GB', 'united kingdom': 'GB',
    'republic of ireland': 'IE', eire: 'IE', holland: 'NL', burma: 'MM', ceylon: 'LK', persia: 'IR', deutschland: 'DE',
    'czech republic': 'CZ', 'south korea': 'KR', 'north korea': 'KP', 'russian federation': 'RU', 'new zealand': 'NZ', prc: 'CN'
  };
  const australiaCodes = { act: '01', nsw: '02', nt: '03', qld: '04', sa: '05', tas: '06', vic: '07', wa: '08' };
  const canadaCodes = { ab: '01', bc: '02', mb: '03', nb: '04', nl: '05', ns: '07', on: '08', pe: '09', qc: '10', sk: '11', yt: '12', nt: '13', nu: '14' };

  function norm(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\([^)]*\)/g, ' ').replace(/[.']/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/\bst\b/g, 'saint').replace(/\bmt\b/g, 'mount').replace(/\bft\b/g, 'fort');
  }

  function createGeocoder() {
    const data = window.KINSHIP_GEO;
    if (!data) return null;
    const countryByName = new Map();
    const countryByCode = new Map();
    for (const country of data.countries) {
      countryByCode.set(country.a2, country);
      for (const alias of [...country.al, country.a3]) if (alias) countryByName.set(norm(alias), country.a2);
    }
    for (const [alias, code] of Object.entries(countryAliases)) countryByName.set(alias, code);
    const cityCounts = new Map();
    const cityByName = new Map();
    data.cities.forEach((city, index) => {
      const key = `${city[4]}.${city[5]}`;
      cityCounts.set(key, (cityCounts.get(key) || 0) + 1);
      for (const name of new Set([norm(city[0]), norm(city[1])])) {
        if (!name) continue;
        if (!cityByName.has(name)) cityByName.set(name, []);
        cityByName.get(name).push(index);
      }
    });
    const adminByName = new Map();
    for (const [key, entry] of Object.entries(data.admin1)) {
      const name = norm(entry[0]);
      if (!adminByName.has(name)) adminByName.set(name, []);
      adminByName.get(name).push(key);
    }
    for (const list of adminByName.values()) list.sort((a, b) => (cityCounts.get(b) || 0) - (cityCounts.get(a) || 0));
    const cache = new Map();

    const adminFor = (name, cc) => {
      const keys = adminByName.get(name) || [];
      if (cc) return keys.find((key) => key.startsWith(`${cc}.`)) || '';
      return keys[0] || '';
    };
    const abbreviationAdmin = (name, cc) => {
      if (name.length === 2 && (!cc || cc === 'US') && data.admin1[`US.${name.toUpperCase()}`]) return `US.${name.toUpperCase()}`;
      if ((!cc || cc === 'AU') && australiaCodes[name] && (cc || name.length > 2)) return `AU.${australiaCodes[name]}`;
      if (cc === 'CA' && canadaCodes[name]) return `CA.${canadaCodes[name]}`;
      return '';
    };
    const findCity = (name, cc, adminKey) => {
      let best = null;
      for (const index of cityByName.get(name) || []) {
        const city = data.cities[index];
        if (cc && city[4] !== cc) continue;
        if (adminKey && `${city[4]}.${city[5]}` !== adminKey) continue;
        if (!best || city[6] > best[6]) best = city;
      }
      return best;
    };

    function resolve(placeText) {
      const parts = String(placeText || '').split(',').map(norm).filter(Boolean);
      if (!parts.length) return null;
      let remaining = [...parts];
      let cc = '';
      let adminKey = '';
      const last = remaining[remaining.length - 1];
      const lastCountry = countryByName.get(last) || '';
      const lastAdmin = remaining.length > 1 || !lastCountry ? (abbreviationAdmin(last, lastCountry) || adminFor(last, '')) : '';
      if (lastCountry && lastAdmin && remaining.length > 1 && findCity(remaining[0], '', lastAdmin)) {
        adminKey = lastAdmin; cc = lastAdmin.slice(0, 2); remaining.pop();
      } else if (lastCountry) {
        cc = lastCountry; remaining.pop();
      }
      if (!adminKey && remaining.length) {
        const candidate = remaining[remaining.length - 1];
        const isLoneCity = remaining.length === 1 && findCity(candidate, cc, '');
        const key = isLoneCity ? '' : abbreviationAdmin(candidate, cc) || adminFor(candidate, cc);
        if (key) { adminKey = key; if (!cc) cc = key.slice(0, 2); remaining.pop(); }
      }
      for (const part of remaining) {
        const city = findCity(part, cc, adminKey) || (adminKey ? null : findCity(part, cc, ''));
        if (city) return { lat: city[2], lon: city[3], precision: 'city', label: `${city[0]}, ${countryByCode.get(city[4])?.n || city[4]}` };
      }
      if (adminKey && data.admin1[adminKey]) {
        const region = data.admin1[adminKey];
        return { lat: region[1], lon: region[2], precision: 'region', label: `${region[0]}, ${countryByCode.get(adminKey.slice(0, 2))?.n || ''}`.replace(/, $/, '') };
      }
      if (cc && countryByCode.has(cc)) {
        const country = countryByCode.get(cc);
        return { lat: country.c[0], lon: country.c[1], precision: 'country', label: country.n };
      }
      return null;
    }

    return (placeText) => {
      if (!cache.has(placeText)) cache.set(placeText, resolve(placeText));
      return cache.get(placeText);
    };
  }

  const projectX = (lon) => (lon + 180) / 360 * WORLD;
  const projectY = (lat) => {
    const clamped = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(Math.PI / 4 + clamped / 2)) / Math.PI) / 2 * WORLD;
  };

  function yearOf(date) {
    const match = String(date || '').match(/\b(\d{3,4})\b/);
    return match ? Number(match[1]) : null;
  }

  function el(tag, attributes = {}, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (parent) parent.append(node);
    return node;
  }

  function create(options) {
    const container = options.container;
    const geocode = createGeocoder();
    let svg; let landGroup; let markerGroup; let popup; let statusChip; let popupOwner = null;
    let width = 0; let height = 0; let k = 1; let tx = 0; let ty = 0; let minK = 1;
    let pins = [];
    let unplaced = [];
    let visible = false;
    let built = false;
    let frame = 0;

    const yTop = projectY(MAX_LAT);
    const yBottom = projectY(MIN_LAT);

    function build() {
      built = true;
      container.classList.add('map-view-container');
      svg = el('svg', { class: 'map-svg', role: 'application', 'aria-label': 'World map of people in the directory' });
      el('rect', { class: 'map-ocean', width: '100%', height: '100%' }, svg);
      landGroup = el('g', { class: 'map-land' }, svg);
      if (geocode) {
        for (const country of window.KINSHIP_GEO.countries) {
          const d = country.p.map((ring) => {
            let path = '';
            for (let i = 0; i < ring.length; i += 2) path += `${i ? 'L' : 'M'}${projectX(ring[i]).toFixed(2)} ${projectY(ring[i + 1]).toFixed(2)}`;
            return `${path}Z`;
          }).join('');
          const path = el('path', { d, class: 'map-country' }, landGroup);
          el('title', {}, path).textContent = country.n;
        }
      }
      markerGroup = el('g', { class: 'map-markers' }, svg);
      container.append(svg);

      const controls = document.createElement('div');
      controls.className = 'map-controls';
      for (const [label, title, handler] of [['+', 'Zoom in', () => zoomBy(1.6)], ['−', 'Zoom out', () => zoomBy(1 / 1.6)], ['⤢', 'Fit all people', () => fitPins()]]) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'icon-button map-control'; button.textContent = label;
        button.title = title; button.setAttribute('aria-label', title);
        button.addEventListener('click', handler);
        controls.append(button);
      }
      statusChip = document.createElement('button');
      statusChip.type = 'button'; statusChip.className = 'map-status';
      statusChip.addEventListener('click', () => { if (unplaced.length) showUnplaced(); });
      const credit = document.createElement('div');
      credit.className = 'map-credit';
      credit.textContent = 'Offline map · Outlines: Natural Earth · Places: GeoNames (CC BY 4.0)';
      popup = document.createElement('div');
      popup.className = 'map-popup'; popup.hidden = true;
      container.append(controls, statusChip, credit, popup);

      if (!geocode) {
        const warning = document.createElement('div');
        warning.className = 'map-warning';
        warning.textContent = 'Map data (data/world-data.js) was not found, so places cannot be plotted.';
        container.append(warning);
      }

      let drag = null;
      svg.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        drag = { x: event.clientX, y: event.clientY, tx, ty, moved: false };
      });
      window.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        container.classList.add('map-dragging');
        hidePopup();
        tx = drag.tx + dx; ty = drag.ty + dy;
        applyView();
      });
      window.addEventListener('pointerup', () => {
        if (!drag) return;
        const moved = drag.moved;
        drag = null;
        container.classList.remove('map-dragging');
        if (moved) suppressClickUntil = performance.now() + 50;
      });
      let suppressClickUntil = 0;
      svg.addEventListener('click', (event) => {
        if (performance.now() < suppressClickUntil) return;
        const marker = event.target.closest('[data-marker]');
        if (marker) { handleMarker(marker); return; }
        hidePopup();
      });
      svg.addEventListener('wheel', (event) => {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        zoomAt(Math.pow(1.0018, -event.deltaY), event.clientX - rect.left, event.clientY - rect.top);
      }, { passive: false });
      svg.addEventListener('dblclick', (event) => {
        if (event.target.closest('[data-marker]')) return;
        const rect = svg.getBoundingClientRect();
        zoomAt(2, event.clientX - rect.left, event.clientY - rect.top);
      });
      if (window.ResizeObserver) new ResizeObserver(() => { if (visible) measure(); }).observe(container);
    }

    function measure() {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const first = !width;
      width = rect.width; height = rect.height;
      minK = Math.max(width / WORLD, height / (yBottom - yTop)) * 0.98;
      if (first) fitPins(); else { clampView(); applyView(); }
    }

    function clampView() {
      k = Math.max(minK, Math.min(k, 400));
      const mapWidth = WORLD * k;
      tx = mapWidth <= width ? (width - mapWidth) / 2 : Math.min(0, Math.max(width - mapWidth, tx));
      const top = yTop * k; const bottom = yBottom * k;
      ty = bottom - top <= height ? (height - (bottom - top)) / 2 - top : Math.min(-top, Math.max(height - bottom, ty));
    }

    function applyView() {
      clampView();
      landGroup.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawMarkers(); });
    }

    function zoomAt(factor, px, py) {
      const nextK = Math.max(minK, Math.min(400, k * factor));
      const ratio = nextK / k;
      tx = px - (px - tx) * ratio; ty = py - (py - ty) * ratio; k = nextK;
      hidePopup();
      applyView();
    }
    const zoomBy = (factor) => zoomAt(factor, width / 2, height / 2);

    function fitBounds(x0, y0, x1, y1) {
      const pad = 60;
      const dx = Math.max(x1 - x0, 1); const dy = Math.max(y1 - y0, 1);
      k = Math.max(minK, Math.min((width - pad * 2) / dx, (height - pad * 2) / dy, 14));
      tx = width / 2 - ((x0 + x1) / 2) * k; ty = height / 2 - ((y0 + y1) / 2) * k;
      hidePopup();
      applyView();
    }

    function fitPins() {
      if (!width) return;
      if (!pins.length) { k = minK; tx = 0; ty = 0; applyView(); return; }
      fitBounds(Math.min(...pins.map((p) => p.x)), Math.min(...pins.map((p) => p.y)), Math.max(...pins.map((p) => p.x)), Math.max(...pins.map((p) => p.y)));
    }

    function latestPlace(person) {
      const rank = (event) => {
        const year = yearOf(event.date);
        const phase = event.type === 'BURI' ? 3 : event.type === 'DEAT' ? 2 : event.type === 'BIRT' ? 0 : 1;
        const score = year !== null ? year : phase >= 2 ? 1e6 : phase === 0 ? -1e6 : -5e5;
        return [score, phase, event.ordinal ?? 0];
      };
      const events = (options.placeEventsFor(person) || [])
        .filter((event) => (event.place && event.place.trim()) || (Number.isFinite(event.lat) && Number.isFinite(event.lon)))
        .map((event) => ({ event, key: rank(event) }))
        .sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1] || b.key[2] - a.key[2]);
      for (const { event } of events) {
        if (Number.isFinite(event.lat) && Number.isFinite(event.lon)) {
          return { event, lat: event.lat, lon: event.lon, precision: 'exact', label: event.place || 'Recorded coordinates' };
        }
        const found = geocode?.(event.place);
        if (found) return { event, ...found, label: found.label, text: event.place };
      }
      return null;
    }

    function rebuildPins() {
      pins = []; unplaced = [];
      for (const person of options.getPeople()) {
        const found = latestPlace(person);
        if (!found) { unplaced.push(person); continue; }
        pins.push({ person, x: projectX(found.lon), y: projectY(found.lat), found });
      }
      statusChip.textContent = `${pins.length} placed${unplaced.length ? ` · ${unplaced.length} not placed ▸` : ''}`;
      statusChip.classList.toggle('map-status-action', unplaced.length > 0);
    }

    function drawMarkers() {
      if (!markerGroup) return;
      markerGroup.replaceChildren();
      const selectedId = options.getSelectedId();
      const cells = new Map();
      for (const pin of pins) {
        const sx = pin.x * k + tx; const sy = pin.y * k + ty;
        if (sx < -20 || sy < -20 || sx > width + 20 || sy > height + 20) continue;
        const key = `${Math.floor(sx / CLUSTER_PX)}|${Math.floor(sy / CLUSTER_PX)}`;
        if (!cells.has(key)) cells.set(key, { pins: [], sx: 0, sy: 0 });
        const cell = cells.get(key);
        cell.pins.push(pin); cell.sx += sx; cell.sy += sy;
      }
      let selectedNode = null;
      for (const cell of cells.values()) {
        const count = cell.pins.length;
        const cx = cell.sx / count; const cy = cell.sy / count;
        const hasSelected = cell.pins.some((pin) => pin.person.id === selectedId);
        const group = el('g', { class: `map-marker${count > 1 ? ' map-cluster' : ''}${hasSelected ? ' map-marker-selected' : ''}`, transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`, tabindex: '0', role: 'button', 'data-marker': '1' });
        group.pinsRef = cell.pins;
        if (count === 1) {
          el('circle', { r: hasSelected ? 9 : 7 }, group);
          el('title', {}, group).textContent = cell.pins[0].person.name;
          group.setAttribute('aria-label', cell.pins[0].person.name);
        } else {
          el('circle', { r: Math.min(22, 11 + Math.log2(count) * 2.2) }, group);
          el('text', { 'text-anchor': 'middle', dy: '4' }, group).textContent = count > 999 ? '999+' : String(count);
          el('title', {}, group).textContent = `${count} people`;
          group.setAttribute('aria-label', `${count} people`);
        }
        group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleMarker(group); } });
        if (hasSelected) selectedNode = group; else markerGroup.append(group);
      }
      if (selectedNode) markerGroup.append(selectedNode);
    }

    function handleMarker(node) {
      const markerPins = node.pinsRef;
      if (!markerPins) return;
      if (markerPins.length === 1) {
        showPersonPopup(markerPins[0], node);
        options.onSelect(markerPins[0].person.id);
        return;
      }
      const xs = markerPins.map((p) => p.x); const ys = markerPins.map((p) => p.y);
      const identical = Math.max(...xs) - Math.min(...xs) < 1e-6 && Math.max(...ys) - Math.min(...ys) < 1e-6;
      if (identical || k >= 300) { showListPopup(markerPins.map((p) => ({ person: p.person, note: p.found.label })), node, `${markerPins.length} people at ${markerPins[0].found.label}`); return; }
      fitBounds(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    }

    function placePopup(node) {
      popup.hidden = false;
      const markerRect = node ? node.getBoundingClientRect() : container.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      const left = node ? markerRect.left - box.left + markerRect.width / 2 : 16;
      const top = node ? markerRect.top - box.top : 16;
      popup.style.left = `${Math.max(8, Math.min(left + 12, box.width - popup.offsetWidth - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(top - 6, box.height - popup.offsetHeight - 8))}px`;
    }

    function hidePopup() { popup.hidden = true; popupOwner = null; }

    function showPersonPopup(pin, node) {
      popup.replaceChildren();
      const title = document.createElement('strong'); title.textContent = pin.person.name;
      const life = document.createElement('span'); life.textContent = options.describe(pin.person);
      const where = document.createElement('span');
      const eventLabel = options.eventLabel(pin.found.event);
      const approx = { exact: '', city: '', region: ' (region level)', country: ' (country level)' }[pin.found.precision];
      where.textContent = `${eventLabel}: ${pin.found.event.place || pin.found.label}${approx}`;
      popup.append(title, life, where, closeButton());
      popupOwner = pin.person.id;
      placePopup(node);
    }

    function closeButton() {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'map-popup-close'; button.textContent = '×'; button.setAttribute('aria-label', 'Close');
      button.addEventListener('click', hidePopup);
      return button;
    }

    function showListPopup(items, node, heading) {
      popup.replaceChildren();
      const title = document.createElement('strong'); title.textContent = heading;
      const list = document.createElement('div'); list.className = 'map-popup-list';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'map-popup-person';
        button.textContent = item.person.name;
        if (item.note) { const note = document.createElement('small'); note.textContent = item.note; button.append(note); }
        button.addEventListener('click', () => options.onSelect(item.person.id));
        list.append(button);
      }
      popup.append(title, list, closeButton());
      placePopup(node);
    }

    function showUnplaced() {
      showListPopup(unplaced.map((person) => ({ person, note: options.describe(person) })), null, `${unplaced.length} with no place that could be mapped`);
    }

    return {
      show() {
        if (!built) build();
        visible = true;
        container.hidden = false;
        rebuildPins();
        const hadSize = width > 0;
        measure();
        if (hadSize) fitPins();
        drawMarkers();
        return { placed: pins.length, unplaced: unplaced.length };
      },
      hide() { visible = false; if (built) { hidePopup(); } container.hidden = true; },
      refresh() {
        if (!visible) return null;
        if (popupOwner && popupOwner !== options.getSelectedId()) hidePopup();
        rebuildPins();
        drawMarkers();
        return { placed: pins.length, unplaced: unplaced.length };
      },
      repaint() { if (visible) drawMarkers(); },
      resolve: (text) => geocode?.(text) || null
    };
  }

  window.KinshipMap = { create, norm };
})();
