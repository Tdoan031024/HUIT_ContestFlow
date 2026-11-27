'use client';

import { useEffect, useRef, useState } from 'react';
import type { Circle, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Point = [number, number];
type Place = { point: Point; label: string };
type Feature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};
const presets = [50, 100, 150, 200, 300, 500, 1000, 2000];
const defaultCenter: Point = [10.79, 106.69];

export function AttendanceLocationPicker({ latitude, longitude, radius = 150, required = true, active = true }: {
  latitude?: number | null; longitude?: number | null; radius?: number; required?: boolean; active?: boolean;
}) {
  const [enabled, setEnabled] = useState(required);
  const [point, setPoint] = useState<Point | null>(latitude != null && longitude != null ? [latitude, longitude] : null);
  const [preset, setPreset] = useState(presets.includes(radius) ? String(radius) : 'custom');
  const [customRadius, setCustomRadius] = useState(String(radius));
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchStatus, setSearchStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapStatus, setMapStatus] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const area = useRef<Circle | null>(null);
  const marker = useRef<Circle | null>(null);
  const request = useRef<AbortController | null>(null);
  const meters = Number(preset === 'custom' ? customRadius : preset);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!active || !enabled || !canvas.current) return;
    const element = canvas.current;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    setMapStatus('Đang tải bản đồ…');
    void import('leaflet').then((L) => {
      if (disposed) return;
      const instance = L.map(element, { scrollWheelZoom: false }).setView(defaultCenter, 13);
      map.current = instance;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).on('tileerror', () => setMapStatus('Một phần bản đồ chưa tải được. Bạn vẫn có thể tìm địa chỉ.'))
        .on('tileload', () => setMapStatus('')).addTo(instance);
      area.current = L.circle(defaultCenter, { radius: 0, color: '#3641f5', fillOpacity: 0.14, interactive: false }).addTo(instance);
      marker.current = L.circle(defaultCenter, { radius: 0, color: '#fff', weight: 3, fillColor: '#3641f5', fillOpacity: 1, interactive: false }).addTo(instance);
      instance.on('click', ({ latlng }) => setPoint([latlng.lat, latlng.wrap().lng]));
      observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
      observer.observe(element);
      setMapStatus('');
      setMapReady(true);
    }).catch(() => { if (!disposed) setMapStatus('Không tải được bản đồ. Bạn vẫn có thể tìm và chọn địa chỉ.'); });
    return () => {
      disposed = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      setMapReady(false);
    };
  }, [active, enabled]);

  useEffect(() => {
    if (mapReady && point) {
      map.current?.setView(point, Math.max(map.current.getZoom(), 16));
    }
  }, [mapReady, point]);

  useEffect(() => {
    if (!mapReady || !point) return;
    area.current?.setLatLng(point).setRadius(meters >= 25 && meters <= 2000 ? meters : 0);
    marker.current?.setLatLng(point).setRadius(12);
  }, [mapReady, point, meters]);

  async function search() {
    if (busy || query.trim().length < 3) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setBusy(true);
    setPlaces([]);
    setSearchStatus('');
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: '5', lat: '10.79', lon: '106.69' });
      const response = await fetch('https://photon.komoot.io/api/?' + params, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json() as { features: Feature[] };
      const results = data.features.map(({ geometry, properties }) => {
        const [lon, lat] = geometry.coordinates;
        const street = [properties.housenumber, properties.street].filter(Boolean).join(' ');
        const label = [...new Set([properties.name, street, properties.district, properties.city, properties.state, properties.country].filter(Boolean))].join(', ');
        return { point: [lat, lon] as Point, label };
      }).filter(({ point: [lat, lon], label }) => label && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
      if (results.length === 1) choose(results[0]);
      else setPlaces(results);
      if (!results.length) setSearchStatus('Không tìm thấy địa chỉ. Thử thêm tên đường hoặc thành phố.');
    } catch {
      setSearchStatus('Không tìm được địa chỉ lúc này. Hãy thử lại hoặc chọn trực tiếp trên bản đồ.');
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  function choose(place: Place) {
    setPoint(place.point);
    setQuery(place.label);
    setPlaces([]);
    setSearchStatus('');
  }

  return <fieldset className="attendance-location-picker">
    <legend>Vị trí điểm danh</legend>
    <label className="attendance-location-switch"><input type="checkbox" name="locationRequired" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Yêu cầu xác minh vị trí</label>
    <input type="hidden" name="latitude" value={point?.[0].toFixed(7) ?? ''} />
    <input type="hidden" name="longitude" value={point?.[1].toFixed(7) ?? ''} />
    <input type="hidden" name="geofenceRadiusMeters" value={enabled ? meters : radius} />
    {enabled && <>
      <div className="attendance-map-search">
        <label className="field-label">Tìm địa chỉ<input className="field-input" value={query} readOnly={busy} maxLength={240} placeholder="Số nhà, tên đường hoặc tên địa điểm" onChange={(event) => { setQuery(event.target.value); setPlaces([]); setSearchStatus(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void search(); } }} /></label>
        <button className="button secondary-button" type="button" disabled={busy || query.trim().length < 3} onClick={() => void search()}>{busy ? 'Đang tìm…' : 'Tìm trên bản đồ'}</button>
      </div>
      {places.length > 0 && <ul className="attendance-map-results">{places.map((place, index) => <li key={index}><button type="button" onClick={() => choose(place)}>{place.label}</button></li>)}</ul>}
      {searchStatus && <p role="status">{searchStatus}</p>}
      <div ref={canvas} className="attendance-map-canvas" role="region" aria-label="Bản đồ chọn vị trí điểm danh" />
      {mapStatus && <p role="status">{mapStatus}</p>}
      <div className="attendance-map-summary">
        <p role="status">{point ? 'Đã đặt ghim. Bấm vào bản đồ để chỉnh vị trí.' : 'Tìm địa chỉ hoặc bấm trên bản đồ để đặt ghim.'}</p>
        {mapReady && <button className="button secondary-button" type="button" onClick={() => { const center = map.current?.getCenter().wrap(); if (center) setPoint([center.lat, center.lng]); }}>Chọn tâm bản đồ</button>}
      </div>
      <div className="attendance-form-pair">
        <label className="field-label">Bán kính điểm danh<select className="field-input" value={preset} onChange={(event) => setPreset(event.target.value)}>
          {presets.map((value) => <option key={value} value={value}>{value.toLocaleString('vi-VN')} m</option>)}
          <option value="custom">Tự nhập</option>
        </select></label>
        {preset === 'custom' && <label className="field-label">Bán kính tùy chỉnh (25–2.000 m)<input className="field-input" type="number" min={25} max={2000} step={1} required value={customRadius} onChange={(event) => setCustomRadius(event.target.value)} /></label>}
      </div>
    </>}
  </fieldset>;
}
