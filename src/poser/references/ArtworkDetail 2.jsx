import { useState } from 'react';
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
  const [expanded, setExpanded] = useState(false);
  const image = images[index];
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal container={container}>
      <Dialog.Overlay className="artwork-overlay"/>
      <Dialog.Content className="artwork-detail" data-expanded={expanded} onCloseAutoFocus={event => { event.preventDefault(); returnFocus?.focus({ preventScroll: true }); }}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); onIndex((index + 1) % images.length); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); onIndex((index + images.length - 1) % images.length); }
        }}>
        <header><Dialog.Title>{image.title || 'Untitled'}</Dialog.Title><div className="artwork-actions">
          <button aria-label={expanded ? 'Reduce artwork' : 'Expand artwork'} onClick={() => setExpanded(value => !value)}>{expanded ? <ArrowsIn size={18}/> : <ArrowsOut size={18}/>}</button>
          <Dialog.Close asChild><button aria-label="Close artwork"><X size={18}/></button></Dialog.Close>
        </div></header>
        <div className="artwork-image"><img key={image.id} src={image.fullSrc || image.src} alt={image.title} decoding="async" referrerPolicy="no-referrer"/></div>
        <div className="artwork-info">
          <div className="artwork-source-row"><a href={image.source} target="_blank" rel="noreferrer">The Metropolitan Museum of Art ↗</a><MatchScore score={image.score}/></div>
          <Dialog.Description>{[image.artist, image.date, image.medium].filter(Boolean).join(' · ') || image.title}</Dialog.Description>
          {image.credit && <p className="artwork-credit">{image.credit}</p>}
          <nav className="artwork-navigation" aria-label="Artwork navigation"><button aria-label="Previous artwork" onClick={() => onIndex((index + images.length - 1) % images.length)}><BackIcon/></button><button aria-label="Next artwork" onClick={() => onIndex((index + 1) % images.length)}><NextIcon/></button></nav>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
