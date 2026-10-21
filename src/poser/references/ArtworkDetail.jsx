import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowsOut, ArrowsIn, X } from '@phosphor-icons/react';
import { BackIcon, NextIcon } from '../../tldraw/drawesome/ToolbarIcons';

export function MatchScore({ score }) {
  const value = Math.max(0, Math.min(100, Math.round(score || 0)));
  return <span className="reference-score" title="AI-assessed pose similarity, not a probability" aria-label={`Pose similarity: ${value} out of 100`}>
    <span className="reference-score-track" aria-hidden="true"><span style={{ width: `${value}%` }}/></span>
    <span>{value}<span className="reference-score-total"> / 100</span></span>
  </span>;
}

export default function ArtworkDetail({ images, index, onIndex, onClose, container, returnFocus }) {
  const [open, setOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(null);
  const content = useRef(null);
  useEffect(() => {
    const update = () => { if (!document.fullscreenElement) setFullscreen(null); };
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  async function toggleFullscreen() {
    if (document.fullscreenElement === content.current) {
      await document.exitFullscreen();
    } else if (fullscreen) {
      setFullscreen(null);
    } else {
      try {
        await content.current.requestFullscreen();
        setFullscreen('native');
      } catch {
        // Embedded browsers may not support fullscreen; still fill the app viewport.
        setFullscreen('viewport');
      }
    }
  }
  const image = images[index];
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Portal container={fullscreen === 'viewport' ? undefined : container}>
      <Dialog.Overlay className="artwork-overlay"/>
      <Dialog.Content ref={content} className="artwork-detail" data-fullscreen={Boolean(fullscreen)} onCloseAutoFocus={event => {
        event.preventDefault();
        if (!open) { returnFocus?.focus({ preventScroll: true }); onClose(); }
      }}
        onEscapeKeyDown={event => { if (fullscreen) { event.preventDefault(); void toggleFullscreen(); } }}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); onIndex((index + 1) % images.length); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); onIndex((index + images.length - 1) % images.length); }
        }}>
        <header><Dialog.Title>{image.title || 'Untitled'}</Dialog.Title><div className="artwork-actions">
          <button aria-label={fullscreen ? 'Exit fullscreen' : 'View image fullscreen'} onClick={toggleFullscreen}>{fullscreen ? <ArrowsIn size={18}/> : <ArrowsOut size={18}/>}</button>
          <Dialog.Close asChild><button aria-label="Close artwork"><X size={18}/></button></Dialog.Close>
        </div></header>
        <div className="artwork-image"><img key={image.id} src={image.fullSrc || image.src} alt={image.title} decoding="async" referrerPolicy="no-referrer"/></div>
        <div className="artwork-info">
          <div className="artwork-score-row"><MatchScore score={image.score}/></div>
          <Dialog.Description>{[image.artist, image.date, image.medium].filter(Boolean).join(' · ') || image.title}</Dialog.Description>
          {image.credit && <p className="artwork-credit">{image.credit}</p>}
          <nav className="artwork-navigation" aria-label="Artwork navigation"><button aria-label="Previous artwork" onClick={() => onIndex((index + images.length - 1) % images.length)}><BackIcon/></button><button aria-label="Next artwork" onClick={() => onIndex((index + 1) % images.length)}><NextIcon/></button></nav>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
