import { useEffect, useState } from 'react';
import { session } from '../api';
const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';
/** An image that needs the login (student photos are staff-only). Fetches with the token and shows it from memory; the token never goes into a URL. */
export default function AuthImg({ id, className, alt = '' }: { id: string; className?: string; alt?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = ''; let dead = false;
    const vc = session.user?.role === 'SUPER_ADMIN' ? session.viewCentre : null;
    fetch(`${BASE}/files/${id}${vc ? `?centreId=${vc}` : ''}`, { headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { if (dead) return; url = URL.createObjectURL(b); setSrc(url); })
      .catch(() => {});
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt={alt} className={className} /> : <div className={className} />;
}
