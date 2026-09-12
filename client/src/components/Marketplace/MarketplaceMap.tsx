import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Gig } from '../../types';

// Self-contained monochrome pin — avoids Leaflet's bundler icon-path issues.
const pinIcon = L.divIcon({
  className: 'isoko-pin',
  html: `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.6 0 12 0z" fill="#18181b"/>
    <circle cx="12" cy="12" r="4.4" fill="#fff"/>
  </svg>`,
  iconSize: [24, 32],
  iconAnchor: [12, 32],
  popupAnchor: [0, -28],
});

const KIGALI: [number, number] = [-1.9536, 30.0606];

const MarketplaceMap = ({ gigs }: { gigs: Gig[] }) => (
  <div
    style={{
      borderRadius: 6,
      overflow: 'hidden',
      border: '1px solid var(--ant-color-border-secondary, #e4e4e7)',
    }}
  >
    <MapContainer
      center={KIGALI}
      zoom={12}
      scrollWheelZoom={false}
      style={{ height: 540, width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {gigs.map((gig) => (
        <Marker key={gig.id} position={[gig.locationLat, gig.locationLng]} icon={pinIcon}>
          <Popup>
            <strong>{gig.title}</strong>
            <br />
            {gig.skill?.name} · {Number(gig.budget).toLocaleString()} RWF
            <br />
            <Link to={`/gigs/${gig.id}`}>View details →</Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  </div>
);

export default MarketplaceMap;
