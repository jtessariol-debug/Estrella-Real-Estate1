import { useEffect, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react/lazy';
import { getMuxPlaybackToken } from '../services/muxVideo';

export default function MuxPropertyVideo({ propertyId, playbackId, title, admin = false }: { propertyId: string; playbackId: string; title: string; admin?: boolean }) {
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getMuxPlaybackToken(propertyId, admin)
      .then((value) => { if (active) setToken(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el video.'); });
    return () => { active = false; };
  }, [admin, propertyId, playbackId]);

  if (error) return <div className="video-fallback-card"><strong>Video temporalmente no disponible</strong><p>{error}</p></div>;
  if (!token) return <div className="mux-video-loading" role="status"><span className="mux-spinner" /> Preparando reproducción…</div>;
  return <MuxPlayer
    playbackId={playbackId}
    tokens={{ playback: token }}
    streamType="on-demand"
    preload="metadata"
    playsInline
    capRenditionToPlayerSize
    metadataVideoId={propertyId}
    metadataVideoTitle={title}
    videoTitle={title}
    accentColor="#b59a63"
    primaryColor="#ffffff"
    secondaryColor="#191916"
    aria-label={`Recorrido en video de ${title}`}
  />;
}
