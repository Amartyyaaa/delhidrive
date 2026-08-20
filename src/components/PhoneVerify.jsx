// Phone number verification via MSG91 (used on checkout).

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Send, RotateCcw, Smartphone } from 'lucide-react';
import { sendOtp, verifyOtp, retryOtp, msg91Ready } from '../lib/otp';
import { useNotify } from '../lib/notify';
import { cx } from '../lib/format';
import { Button, Badge, Input } from './ui';

const isValidMobile = (v) => /^[6-9]\d{9}$/.test(String(v).replace(/\D/g, '').slice(-10));

export default function PhoneVerify({ phone, verified, onVerified }) {
  const { toast } = useNotify();
  const [stage, setStage] = useState('idle'); // idle | sent
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef(null);

  // Changing the number invalidates a previous verification.
  useEffect(() => {
    setStage('idle');
    setCode('');
  }, [phone]);

  useEffect(() => {
    if (seconds <= 0) return;
    timer.current = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer.current);
  }, [seconds]);

  if (!msg91Ready) return null;

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] px-3.5 py-2.5">
        <ShieldCheck size={15} className="text-emerald-400" />
        <span className="text-[12.5px] font-medium text-emerald-200">Phone number verified</span>
      </div>
    );
  }

  const send = async () => {
    if (!isValidMobile(phone)) {
      toast('Enter a valid 10-digit mobile number first.', { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await sendOtp(phone);
      setStage('sent');
      setSeconds(30);
      toast(`OTP sent to +91 ${String(phone).replace(/\D/g, '').slice(-10)}`, { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    if (code.trim().length < 4) {
      toast('Enter the code from the SMS.', { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(code);
      onVerified(true);
      toast('Phone number verified.', { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await retryOtp(11);
      setSeconds(30);
      toast('New code sent.', { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cx(
        'rounded-xl border px-3.5 py-3',
        stage === 'sent' ? 'border-brand-400/40 bg-brand-500/[0.08]' : 'border-white/10 bg-ink-950/50'
      )}
    >
      {stage === 'idle' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[12.5px] text-slate-300">
            <Smartphone size={14} className="text-brand-300" />
            Verify your number so we can send trip updates
          </span>
          <Button size="sm" icon={Send} onClick={send} loading={busy} disabled={busy}>
            Send OTP
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="flex items-center gap-2 text-[12.5px] text-slate-300">
            <Badge tone="brand">OTP sent</Badge>
            Enter the code sent to +91 {String(phone).replace(/\D/g, '').slice(-10)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && check()}
              placeholder="6-digit code"
              inputMode="numeric"
              className="w-40 tracking-[0.35em]"
            />
            <Button size="md" icon={ShieldCheck} onClick={check} loading={busy} disabled={busy}>
              Verify
            </Button>
            <Button
              size="md"
              variant="ghost"
              icon={RotateCcw}
              onClick={resend}
              disabled={busy || seconds > 0}
            >
              {seconds > 0 ? `Resend in ${seconds}s` : 'Resend'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
