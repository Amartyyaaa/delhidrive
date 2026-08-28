// Live verification selfie.
//
// Camera only — never a file picker. The whole point of "live" is that the
// photo was taken now, at booking, so ops can compare it to the licence. On
// the phone app that is enforced by launching the camera directly; in a
// browser the equivalent is getUserMedia, which cannot return a stored file.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Check, CircleAlert, ShieldCheck } from 'lucide-react';
import { useNotify } from '../lib/notify';
import { cx, fmtDateTime } from '../lib/format';
import { Button, Badge } from './ui';

/** Downscale to something ops can actually open, and keep records small. */
const MAX_EDGE = 720;
const QUALITY = 0.72;

export default function LiveSelfie({ value, takenAt, onCapture }) {
  const { toast } = useNotify();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [denied, setDenied] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  // Never leave the camera running when the component goes away.
  useEffect(() => stop, [stop]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('This browser cannot open the camera. Try Chrome or Safari.', { type: 'error' });
      return;
    }
    setStarting(true);
    setDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setLive(true);
      // The <video> only exists once `live` is true, so attach on the next tick.
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch (err) {
      setDenied(true);
      toast(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow it in your browser’s site settings and try again.'
          : 'Could not open the camera on this device.',
        { type: 'error' }
      );
    } finally {
      setStarting(false);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    // Un-mirror: the preview is flipped so it feels like a mirror, but the
    // stored photo should read the right way round for whoever reviews it.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    onCapture(canvas.toDataURL('image/jpeg', QUALITY), Date.now());
    stop();
  };

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] p-3.5">
        <img
          src={value}
          alt="Verification selfie"
          className="h-24 w-24 shrink-0 rounded-xl border border-white/10 object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-200">
            <ShieldCheck size={15} /> Live selfie captured
          </p>
          {takenAt && (
            <p className="mt-0.5 text-[11.5px] text-slate-400">Taken {fmtDateTime(takenAt)}</p>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            className="mt-1.5"
            onClick={() => {
              onCapture('', null);
              setTimeout(start, 0);
            }}
          >
            Retake
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3.5">
      {live ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-56 w-full -scale-x-100 object-cover"
            />
            <span className="absolute left-2.5 top-2.5">
              <Badge tone="danger">● Live</Badge>
            </span>
          </div>
          <div className="flex gap-2">
            <Button icon={Camera} onClick={capture} className="flex-1">
              Capture selfie
            </Button>
            <Button variant="ghost" onClick={stop}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] font-medium text-slate-200">
              <Camera size={15} className="text-brand-300" />
              Live verification selfie
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">
              Taken on camera now, so it can be checked against your licence. Not uploaded from your
              gallery.
            </p>
            {denied && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-rose-300">
                <CircleAlert size={12} /> Camera blocked — allow it in site settings.
              </p>
            )}
          </div>
          <Button icon={Camera} onClick={start} loading={starting} disabled={starting}>
            Open camera
          </Button>
        </div>
      )}
    </div>
  );
}
