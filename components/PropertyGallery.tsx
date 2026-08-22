import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import type { PropertyImage } from '../types';

type PropertyGalleryProps = { images: PropertyImage[]; propertyTitle: string };

export default function PropertyGallery({ images, propertyTitle }: PropertyGalleryProps) {
  const [current, setCurrent] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const multiple = images.length > 1;

  const goTo = (index: number) => {
    if (!images.length) return;
    setCurrent((index + images.length) % images.length);
  };
  const previous = () => goTo(current - 1);
  const next = () => goTo(current + 1);

  useEffect(() => {
    if (current >= images.length) setCurrent(0);
  }, [current, images.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => { document.body.style.overflow = originalOverflow; };
  }, [lightboxOpen]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!lightboxOpen && (target?.matches('input, textarea, select, [contenteditable="true"]') ?? false)) return;
      if (event.key === 'Escape' && lightboxOpen) { setLightboxOpen(false); return; }
      if (!multiple) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); setCurrent((value) => (value - 1 + images.length) % images.length); }
      if (event.key === 'ArrowRight') { event.preventDefault(); setCurrent((value) => (value + 1) % images.length); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, lightboxOpen, multiple]);

  useEffect(() => {
    thumbnailRefs.current[current]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [current]);

  const startSwipe = (event: TouchEvent) => { touchStartX.current = event.touches[0]?.clientX ?? null; };
  const endSwipe = (event: TouchEvent) => {
    if (!multiple || touchStartX.current === null) return;
    const distance = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 45) return;
    distance > 0 ? previous() : next();
  };
  const preventButtonArrowScroll = (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault();
  };

  if (!images.length) return <div className="gallery-placeholder"><ImageIcon aria-hidden="true" /><p>Fotografías próximamente</p></div>;

  const activeImage = images[current];
  return <>
    <section className="property-gallery" aria-label={`Galería de ${propertyTitle}`}>
      <div className="gallery-stage" onTouchStart={startSwipe} onTouchEnd={endSwipe}>
        <button className="gallery-main" type="button" onClick={() => setLightboxOpen(true)} aria-label={`Ampliar fotografía ${current + 1} de ${propertyTitle}`}>
          <img key={activeImage.id} src={activeImage.url} alt={`${propertyTitle} — fotografía ${current + 1}`} fetchPriority="high" />
        </button>
        {multiple && <>
          <button className="gallery-arrow previous" type="button" onClick={previous} onKeyDown={preventButtonArrowScroll} aria-label="Ver fotografía anterior"><ChevronLeft /></button>
          <button className="gallery-arrow next" type="button" onClick={next} onKeyDown={preventButtonArrowScroll} aria-label="Ver fotografía siguiente"><ChevronRight /></button>
          <span className="gallery-count" aria-live="polite">{current + 1} / {images.length}</span>
        </>}
      </div>
      {multiple && <div className="gallery-thumbs" aria-label="Miniaturas de la propiedad">{images.map((image, index) => <button ref={(element) => { thumbnailRefs.current[index] = element; }} key={image.id} type="button" className={index === current ? 'active' : ''} onClick={() => goTo(index)} aria-label={`Ver fotografía ${index + 1}`} aria-current={index === current ? 'true' : undefined}><img src={image.url} alt="" loading="lazy" /></button>)}</div>}
    </section>
    {lightboxOpen && <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`Vista ampliada de ${propertyTitle}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxOpen(false); }} onTouchStart={startSwipe} onTouchEnd={endSwipe}>
      <button ref={closeButton} className="lightbox-close" type="button" onClick={() => setLightboxOpen(false)} aria-label="Cerrar galería"><X /></button>
      {multiple && <button className="lightbox-arrow previous" type="button" onClick={previous} aria-label="Ver fotografía anterior"><ChevronLeft /></button>}
      <img key={activeImage.id} src={activeImage.url} alt={`${propertyTitle} — fotografía ${current + 1} ampliada`} />
      {multiple && <button className="lightbox-arrow next" type="button" onClick={next} aria-label="Ver fotografía siguiente"><ChevronRight /></button>}
      {multiple && <span className="lightbox-count" aria-live="polite">{current + 1} / {images.length}</span>}
    </div>}
  </>;
}
