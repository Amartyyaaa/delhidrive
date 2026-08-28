// Where to deliver the car, shown only when the customer picks Home Delivery.

import { useState } from 'react';
import { MapPin, LocateFixed, TriangleAlert, ExternalLink, Check } from 'lucide-react';
import { fetchCurrentLocation, mapsUrl, SERVICE_RADIUS_KM } from '../lib/geo';
import { useNotify } from '../lib/notify';
import { cx } from '../lib/format';
import { Button, Textarea, Badge } from './ui';

export default function DeliveryAddress({ value, onChange }) {
  const { toast } = useNotify();
  const [busy, setBusy] = useState(false);
  const address = value?.address || '';
  const coords = value?.coords || null;
  const outside = Boolean(value?.outsideServiceArea);

  const locate = async () => {
    setBusy(true);
    try {
      const res = await fetchCurrentLocation();
      if (!res.ok) {
        toast(res.reason, { type: 'error' });
        return;
      }
      onChange({
        ...value,
        coords: res.coords,
        address: res.address || address,
        km: res.km,
        outsideServiceArea: res.outsideServiceArea,
      });
      if (res.outsideServiceArea) toast(res.reason, { type: 'warning' });
      else
        toast(res.address ? 'Location captured.' : 'Coordinates captured — add the flat/house number.', {
          type: 'success',
        });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cx(
        'space-y-3 rounded-xl border px-3.5 py-3.5',
        outside ? 'border-amber-400/30 bg-amber-500/[0.07]' : 'border-white/10 bg-ink-950/50'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-medium text-slate-200">
          <MapPin size={15} className="text-brand-300" />
          Where should we deliver the car?
        </p>
        <Button size="sm" variant="secondary" icon={LocateFixed} onClick={locate} loading={busy} disabled={busy}>
          Use my location
        </Button>
      </div>

      <Textarea
        rows={2}
        value={address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        placeholder="Flat / house number, street, landmark, area"
      />

      {coords && (
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <Badge tone={outside ? 'warning' : 'success'} icon={outside ? TriangleAlert : Check}>
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </Badge>
          {typeof value?.km === 'number' && (
            <span className="text-slate-500">{value.km} km from central Delhi</span>
          )}
          <a
            href={mapsUrl(coords)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-300 hover:underline"
          >
            Open in Maps <ExternalLink size={11} />
          </a>
        </div>
      )}

      {outside && (
        <p className="text-[12px] leading-relaxed text-amber-200">
          That address is outside our {SERVICE_RADIUS_KM} km delivery area. Choose Airport T3 or New Delhi
          Railway Station instead, or call us and we will see what we can do.
        </p>
      )}
    </div>
  );
}
