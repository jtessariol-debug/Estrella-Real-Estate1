import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Eye, ImagePlus, LoaderCircle, Star, Trash2, X } from 'lucide-react';
import type { UpChunk } from '@mux/upchunk';
import type { AdminProperty, AdminPropertyImage, Amenity, OperationType, PropertyInput, PropertyStatus, PropertyType } from '../../types';
import { archiveProperty, createProperty, deleteProperty, deletePropertyImage, getAmenities, reorderPropertyImages, setCoverImage, setPropertyAmenities, updateProperty, uploadPropertyImage, uploadPropertyVideo } from '../../services/admin';
import { slugify } from '../../utils/slug';
import { formatPriceInput, normalizePriceInput } from '../../utils/format';
import { getVideoContentType, getVideoExtension, validatePropertyVideo, VIDEO_MAX_SIZE_BYTES } from '../../utils/video';
import { validateMuxSourceVideo } from '../../utils/video';
import { cancelMuxVideoUpload, cleanupMuxAsset, deleteHybridPropertyVideo, getLatestMuxVideoJob, startMuxVideoUpload, type MuxVideoJob } from '../../services/muxVideo';
import MuxPropertyVideo from '../MuxPropertyVideo';

type FormValues = {
  title: string; slug: string; description: string; price: string; currency: 'DOP' | 'USD';
  operationType: OperationType; propertyType: PropertyType; status: PropertyStatus;
  bedrooms: string; bathrooms: string; parkingSpaces: string; areaM2: string;
  city: string; sector: string; address: string; latitude: string; longitude: string;
  published: boolean; featured: boolean; amenityIds: string[];
};
type Errors = Partial<Record<keyof FormValues, string>>;
type PendingImage = { file: File; preview: string };
type PendingVideo = { file: File; preview?: string; isLarge: boolean };
const videoMimeType = (name?: string) => getVideoContentType(getVideoExtension(name ?? '') ?? 'mp4');

const EMPTY_VALUES: FormValues = { title: '', slug: '', description: '', price: '', currency: 'DOP', operationType: 'sale', propertyType: 'apartment', status: 'draft', bedrooms: '', bathrooms: '', parkingSpaces: '', areaM2: '', city: 'Santiago', sector: '', address: '', latitude: '', longitude: '', published: false, featured: false, amenityIds: [] };
const STATUS_LABELS: Record<PropertyStatus, string> = { draft: 'Borrador', available: 'Disponible', reserved: 'Reservada', sold: 'Vendida', rented: 'Alquilada', inactive: 'Inactiva' };
const TYPE_LABELS: Record<PropertyType, string> = { apartment: 'Apartamento', house: 'Casa', villa: 'Villa', penthouse: 'Penthouse', land: 'Solar', commercial: 'Local comercial' };
const toString = (value?: number) => value === undefined ? '' : String(value);
const formatFileSize = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString('es-DO', { maximumFractionDigits: 1 })} MB`;
const fromProperty = (property: AdminProperty): FormValues => ({ title: property.title, slug: property.slug, description: property.description, price: String(property.price), currency: property.currency, operationType: property.operationType, propertyType: property.propertyType, status: property.status, bedrooms: toString(property.bedrooms), bathrooms: toString(property.bathrooms), parkingSpaces: toString(property.parkingSpaces), areaM2: toString(property.areaM2), city: property.city, sector: property.sector ?? '', address: property.address ?? '', latitude: toString(property.latitude), longitude: toString(property.longitude), published: property.published, featured: property.featured, amenityIds: property.amenityIds });
const optionalNumber = (value: string) => value === '' ? undefined : Number(value);

function validate(values: FormValues): Errors {
  const errors: Errors = {};
  if (values.title.trim().length < 3 || values.title.trim().length > 180) errors.title = 'El título debe tener entre 3 y 180 caracteres.';
  if (!values.slug.trim()) errors.slug = 'El slug es obligatorio.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) errors.slug = 'Usa minúsculas, números y guiones simples.';
  if (!values.description.trim()) errors.description = 'La descripción es obligatoria.';
  if (!values.price || !Number.isFinite(Number(values.price)) || Number(values.price) <= 0) errors.price = 'El precio debe ser mayor que cero.';
  if (!values.city.trim()) errors.city = 'La ciudad es obligatoria.';
  (['bedrooms', 'bathrooms', 'parkingSpaces'] as const).forEach((key) => { if (values[key] !== '' && Number(values[key]) < 0) errors[key] = 'El valor no puede ser negativo.'; });
  if (values.areaM2 !== '' && Number(values.areaM2) <= 0) errors.areaM2 = 'El área debe ser mayor que cero.';
  if (values.bedrooms !== '' && !Number.isInteger(Number(values.bedrooms))) errors.bedrooms = 'Usa un número entero.';
  if (values.parkingSpaces !== '' && !Number.isInteger(Number(values.parkingSpaces))) errors.parkingSpaces = 'Usa un número entero.';
  if (values.latitude !== '' && (Number(values.latitude) < -90 || Number(values.latitude) > 90)) errors.latitude = 'La latitud debe estar entre -90 y 90.';
  if (values.longitude !== '' && (Number(values.longitude) < -180 || Number(values.longitude) > 180)) errors.longitude = 'La longitud debe estar entre -180 y 180.';
  return errors;
}

function TextField({ id, label, value, onChange, error, type = 'text', step, min, inputMode }: { id: keyof FormValues; label: string; value: string; onChange: (value: string) => void; error?: string; type?: string; step?: string; min?: string; inputMode?: 'numeric' | 'decimal' }) {
  return <div className="admin-field"><label htmlFor={id}>{label}</label><input id={id} type={type} inputMode={inputMode} step={step} min={min} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}

function PriceField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const [focused, setFocused] = useState(false);
  return <div className="admin-field"><label htmlFor="price">Precio *</label><input id="price" type="text" inputMode="decimal" value={focused ? value : formatPriceInput(value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => onChange(normalizePriceInput(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={error ? 'price-error' : 'price-help'} />{error ? <small id="price-error" className="field-error">{error}</small> : <small id="price-help">Se guarda como valor numérico, sin comas.</small>}</div>;
}

export default function PropertyForm({ initial }: { initial?: AdminProperty }) {
  const [values, setValues] = useState<FormValues>(() => initial ? fromProperty(initial) : EMPTY_VALUES);
  const [errors, setErrors] = useState<Errors>({}); const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [images, setImages] = useState<AdminPropertyImage[]>(initial?.images ?? []); const [pending, setPending] = useState<PendingImage[]>([]);
  const [videoStoragePath, setVideoStoragePath] = useState(initial?.videoStoragePath); const [videoUrl, setVideoUrl] = useState(initial?.videoUrl);
  const [pendingVideo, setPendingVideo] = useState<PendingVideo | null>(null);
  const [videoPlaybackWarning, setVideoPlaybackWarning] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 9, height: 16 });
  const [busy, setBusy] = useState(false); const [uploadStatus, setUploadStatus] = useState(''); const [notice, setNotice] = useState<string | null>(() => sessionStorage.getItem('adminNotice'));
  const [slugTouched, setSlugTouched] = useState(Boolean(initial)); const [confirmAction, setConfirmAction] = useState<'delete' | 'archive' | 'publish' | 'video' | null>(null);
  const [muxJob, setMuxJob] = useState<MuxVideoJob>();
  const [muxProgress, setMuxProgress] = useState(0);
  const muxUploadRef = useRef<UpChunk | undefined>(undefined);
  const muxJobIdRef = useRef<string | undefined>(undefined);
  const muxObservedActiveRef = useRef(false);

  useEffect(() => { sessionStorage.removeItem('adminNotice'); void getAmenities().then(setAmenities).catch((reason: unknown) => setNotice(reason instanceof Error ? reason.message : 'No pudimos cargar las amenidades.')); }, []);
  useEffect(() => {
    if (!initial?.id) return;
    let disposed = false; let timer: number | undefined;
    const refresh = async () => {
      try {
        const job = await getLatestMuxVideoJob(initial.id);
        if (disposed) return;
        setMuxJob(job);
        if (job && ['selected', 'uploading', 'processing'].includes(job.status)) {
          muxObservedActiveRef.current = true;
          timer = window.setTimeout(refresh, 3000);
        } else if (job?.status === 'completed' && muxObservedActiveRef.current) {
          sessionStorage.setItem('adminNotice', 'Video listo. La nueva versión ya está activa.');
          window.location.reload();
        }
      } catch { /* El formulario sigue disponible aunque falle una consulta de estado. */ }
    };
    void refresh();
    return () => { disposed = true; if (timer) window.clearTimeout(timer); };
  }, [initial?.id]);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => { setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); };
  const titleChanged = (title: string) => { set('title', title); if (!slugTouched) set('slug', slugify(title)); };

  const chooseImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); const accepted: PendingImage[] = []; const rejected: string[] = [];
    files.forEach((file) => { if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) rejected.push(`${file.name}: formato no permitido`); else if (file.size > 10 * 1024 * 1024) rejected.push(`${file.name}: supera 10 MB`); else accepted.push({ file, preview: URL.createObjectURL(file) }); });
    setPending((current) => [...current, ...accepted]); if (rejected.length) setNotice(rejected.join('. ')); event.target.value = '';
  };

  const chooseVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > VIDEO_MAX_SIZE_BYTES) validateMuxSourceVideo(file); else validatePropertyVideo(file); } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Solo puedes subir videos MP4 o MOV.'); return; }
    if (pendingVideo?.preview) URL.revokeObjectURL(pendingVideo.preview);
    setVideoPlaybackWarning(false); setVideoDimensions({ width: 9, height: 16 });
    const isLarge = file.size > VIDEO_MAX_SIZE_BYTES;
    setPendingVideo({ file, preview: isLarge ? undefined : URL.createObjectURL(file), isLarge });
    setNotice(isLarge ? `Este video pesa ${formatFileSize(file.size)} y supera los 50 MB. Será optimizado automáticamente para reproducción web.` : null);
  };

  const makeInput = (publishMode?: 'draft' | 'publish'): PropertyInput => {
    const published = publishMode === 'draft' ? false : publishMode === 'publish' ? true : values.published;
    const status = publishMode === 'draft' ? 'draft' : publishMode === 'publish' && (values.status === 'draft' || values.status === 'inactive') ? 'available' : values.status;
    return { title: values.title, slug: values.slug, description: values.description, price: Number(values.price), currency: values.currency, operationType: values.operationType, propertyType: values.propertyType, status, bedrooms: optionalNumber(values.bedrooms), bathrooms: optionalNumber(values.bathrooms), parkingSpaces: optionalNumber(values.parkingSpaces), areaM2: optionalNumber(values.areaM2), city: values.city, sector: values.sector || undefined, address: values.address || undefined, latitude: optionalNumber(values.latitude), longitude: optionalNumber(values.longitude), published, featured: values.featured };
  };

  const save = async (mode?: 'draft' | 'publish') => {
    const nextErrors = validate(values); setErrors(nextErrors); if (Object.keys(nextErrors).length) { document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (mode === 'publish' && !images.length && !pending.length && confirmAction !== 'publish') { setConfirmAction('publish'); return; }
    setConfirmAction(null); setBusy(true); setNotice(null); let propertyId = initial?.id;
    try {
      if (propertyId) await updateProperty(propertyId, makeInput(mode)); else propertyId = await createProperty(makeInput(mode));
      await setPropertyAmenities(propertyId, values.amenityIds);
      for (let index = 0; index < pending.length; index += 1) { setUploadStatus(`Subiendo ${index + 1} de ${pending.length}…`); await uploadPropertyImage(propertyId, pending[index].file, images.length + index, !images.some((image) => image.isCover) && index === 0); }
    } catch (reason: unknown) { const message = reason instanceof Error ? reason.message : 'No pudimos guardar los cambios.'; if (!initial && propertyId) { sessionStorage.setItem('adminNotice', `La propiedad fue creada parcialmente. ${message}`); window.location.replace(`/admin/properties/${propertyId}/edit`); return; } setNotice(message); setBusy(false); setUploadStatus(''); return; }
    if (!propertyId) return;
    let successNotice = initial ? (mode === 'publish' ? 'Propiedad publicada correctamente.' : 'Cambios guardados correctamente.') : (mode === 'publish' ? 'Propiedad creada y publicada.' : 'Borrador creado correctamente.');
    if (pendingVideo) {
      try {
        if (pendingVideo.isLarge) {
          setUploadStatus('Preparando video…');
          await startMuxVideoUpload(propertyId, pendingVideo.file, {
            onProgress: (progress) => { setMuxProgress(progress); setUploadStatus(`Subiendo video… ${Math.round(progress)}%`); },
            onProcessing: () => setUploadStatus('Procesando video…'),
            onController: (upload, jobId) => { muxUploadRef.current = upload; muxJobIdRef.current = jobId; },
          });
          successNotice = `${successNotice} El video terminó de subir y se está procesando. El video anterior seguirá activo hasta que el nuevo esté listo.`;
        } else {
          setUploadStatus('Subiendo video…');
          const previousMuxAssetId = initial?.videoProvider === 'mux' ? initial.muxAssetId : undefined;
          const result = await uploadPropertyVideo(propertyId, pendingVideo.file, videoStoragePath);
          if (previousMuxAssetId) {
            try { await cleanupMuxAsset(propertyId, previousMuxAssetId); } catch { result.cleanupWarning = 'El nuevo video quedó activo, pero el asset anterior de Mux requiere limpieza manual.'; }
          }
          if (result.cleanupWarning) successNotice = `${successNotice} ${result.cleanupWarning}`;
        }
      } catch (reason: unknown) {
        const detail = reason instanceof Error ? ` ${reason.message}` : '';
        successNotice = pendingVideo.isLarge
          ? `Los cambios de la propiedad se guardaron. No se pudo procesar el video. El video anterior y los demás cambios de la propiedad se conservaron.${detail}`
          : `Los cambios de la propiedad se guardaron. No se pudo subir el video. Los demás cambios de la propiedad no se perderán.${detail}`;
      }
    }
    sessionStorage.setItem('adminNotice', successNotice);
    window.location.replace(`/admin/properties/${propertyId}/edit`);
  };

  const moveImage = async (index: number, direction: -1 | 1) => { const target = index + direction; if (!initial || target < 0 || target >= images.length || busy) return; const reordered = [...images]; [reordered[index], reordered[target]] = [reordered[target], reordered[index]]; setBusy(true); try { await reorderPropertyImages(initial.id, reordered.map((image) => image.id)); setImages(reordered.map((image, position) => ({ ...image, position }))); setNotice('Orden de fotografías actualizado.'); } catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : 'No pudimos reordenar las imágenes.'); } finally { setBusy(false); } };
  const makeCover = async (imageId: string) => { if (!initial || busy) return; setBusy(true); try { await setCoverImage(initial.id, imageId); setImages((current) => current.map((image) => ({ ...image, isCover: image.id === imageId }))); setNotice('Portada actualizada.'); } catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : 'No pudimos cambiar la portada.'); } finally { setBusy(false); } };
  const removeImage = async (image: AdminPropertyImage) => { if (!initial || busy) return; setBusy(true); try { await deletePropertyImage(initial.id, image); const next = images.filter((item) => item.id !== image.id).map((item, position) => ({ ...item, position })); if (next.length && !next.some((item) => item.isCover)) next[0].isCover = true; setImages(next); setNotice('Imagen eliminada correctamente.'); } catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : 'No pudimos eliminar la imagen.'); } finally { setBusy(false); } };
  const destructiveAction = async () => { if (!initial || !confirmAction) return; const action = confirmAction; setConfirmAction(null); setBusy(true); try { if (action === 'video' && (videoStoragePath || initial.muxAssetId || muxProcessing)) { await deleteHybridPropertyVideo(initial.id); setVideoStoragePath(undefined); setVideoUrl(undefined); setMuxJob(undefined); setNotice('Video eliminado correctamente.'); setBusy(false); return; } if (action === 'archive') { await archiveProperty(initial.id); sessionStorage.setItem('adminNotice', 'Propiedad archivada.'); } else if (action === 'delete') { await deleteProperty(initial.id); sessionStorage.setItem('adminNotice', 'Propiedad eliminada correctamente.'); } window.location.replace('/admin/properties'); } catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : 'No pudimos completar la operación.'); setBusy(false); } };

  const cancelActiveMuxUpload = async () => {
    if (!muxJobIdRef.current) return;
    try { await cancelMuxVideoUpload(muxJobIdRef.current, muxUploadRef.current); setUploadStatus('Subida cancelada.'); }
    catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : 'No se pudo cancelar la subida.'); }
  };
  const cancelPersistedMuxJob = async () => {
    if (!muxJob || !muxProcessing) return;
    try { await cancelMuxVideoUpload(muxJob.id); setMuxJob({ ...muxJob, status: 'cancelled' }); setNotice('La subida de video fue cancelada.'); }
    catch (reason: unknown) { setNotice(reason instanceof Error ? reason.message : 'No se pudo cancelar el procesamiento.'); }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void save(); };
  const activeVideoName = pendingVideo?.file.name ?? videoStoragePath;
  const isMovVideo = videoMimeType(activeVideoName) === 'video/quicktime';
  const showVideoPlayer = !(videoPlaybackWarning && isMovVideo);
  const pendingVideoFormat = pendingVideo ? getVideoExtension(pendingVideo.file.name)?.toUpperCase() : undefined;
  const muxProcessing = muxJob && ['selected', 'uploading', 'processing'].includes(muxJob.status);
  const hasStoredVideo = Boolean(videoStoragePath || initial?.muxAssetId);
  return <form className="property-form" onSubmit={submit} noValidate>
    {notice && <div className="admin-toast" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Cerrar mensaje"><X size={17} /></button></div>}
    <section className="form-section"><div className="form-section-head"><span>01</span><div><h2>Información general</h2><p>Datos principales para presentar la propiedad.</p></div></div><div className="admin-form-grid">
      <TextField id="title" label="Título *" value={values.title} onChange={titleChanged} error={errors.title} /><TextField id="slug" label="Slug *" value={values.slug} onChange={(value) => { setSlugTouched(true); set('slug', slugify(value)); }} error={errors.slug} />
      <div className="admin-field full"><label htmlFor="description">Descripción *</label><textarea id="description" rows={6} value={values.description} onChange={(event) => set('description', event.target.value)} aria-invalid={Boolean(errors.description)} />{errors.description && <small className="field-error">{errors.description}</small>}</div>
      <PriceField value={values.price} onChange={(value) => set('price', value)} error={errors.price} />
      <div className="admin-field"><label htmlFor="currency">Moneda *</label><select id="currency" value={values.currency} onChange={(e) => set('currency', e.target.value as 'DOP' | 'USD')}><option value="DOP">RD$ — Peso dominicano</option><option value="USD">US$ — Dólar</option></select></div>
      <div className="admin-field"><label htmlFor="operation">Operación *</label><select id="operation" value={values.operationType} onChange={(e) => set('operationType', e.target.value as OperationType)}><option value="sale">Venta</option><option value="rent">Alquiler</option></select></div>
      <div className="admin-field"><label htmlFor="propertyType">Tipo *</label><select id="propertyType" value={values.propertyType} onChange={(e) => set('propertyType', e.target.value as PropertyType)}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="admin-field"><label htmlFor="status">Estado *</label><select id="status" value={values.status} onChange={(e) => set('status', e.target.value as PropertyStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    </div></section>
    <section className="form-section"><div className="form-section-head"><span>02</span><div><h2>Características</h2><p>Campos opcionales según el tipo de inmueble.</p></div></div><div className="admin-form-grid four"><TextField id="bedrooms" label="Habitaciones" type="number" inputMode="numeric" min="0" step="1" value={values.bedrooms} onChange={(value) => set('bedrooms', value)} error={errors.bedrooms} /><TextField id="bathrooms" label="Baños" type="number" inputMode="decimal" min="0" step="0.5" value={values.bathrooms} onChange={(value) => set('bathrooms', value)} error={errors.bathrooms} /><TextField id="parkingSpaces" label="Parqueos" type="number" inputMode="numeric" min="0" step="1" value={values.parkingSpaces} onChange={(value) => set('parkingSpaces', value)} error={errors.parkingSpaces} /><TextField id="areaM2" label="Área en m²" type="number" inputMode="decimal" min="0" step="0.01" value={values.areaM2} onChange={(value) => set('areaM2', value)} error={errors.areaM2} /></div></section>
    <section className="form-section"><div className="form-section-head"><span>03</span><div><h2>Ubicación</h2><p>Información visible y coordenadas opcionales.</p></div></div><div className="admin-form-grid"><TextField id="city" label="Ciudad *" value={values.city} onChange={(value) => set('city', value)} error={errors.city} /><TextField id="sector" label="Sector" value={values.sector} onChange={(value) => set('sector', value)} /><div className="admin-field full"><label htmlFor="address">Dirección</label><input id="address" value={values.address} onChange={(e) => set('address', e.target.value)} /></div><TextField id="latitude" label="Latitud" type="number" inputMode="decimal" step="0.000001" value={values.latitude} onChange={(value) => set('latitude', value)} error={errors.latitude} /><TextField id="longitude" label="Longitud" type="number" inputMode="decimal" step="0.000001" value={values.longitude} onChange={(value) => set('longitude', value)} error={errors.longitude} /></div></section>
    <section className="form-section"><div className="form-section-head"><span>04</span><div><h2>Visibilidad y amenidades</h2><p>Controla cómo aparece la propiedad.</p></div></div><div className="toggle-row"><label><input type="checkbox" checked={values.published} onChange={(e) => set('published', e.target.checked)} /><span><strong>Publicada</strong><small>Visible en la página web</small></span></label><label><input type="checkbox" checked={values.featured} onChange={(e) => set('featured', e.target.checked)} /><span><strong>Destacada</strong><small>Aparece con prioridad en el inicio</small></span></label></div><div className="amenity-checks">{amenities.map((amenity) => <label key={amenity.id}><input type="checkbox" checked={values.amenityIds.includes(amenity.id)} onChange={(e) => set('amenityIds', e.target.checked ? [...values.amenityIds, amenity.id] : values.amenityIds.filter((id) => id !== amenity.id))} />{amenity.name}</label>)}</div></section>
    <section className="form-section"><div className="form-section-head"><span>05</span><div><h2>Fotografías</h2><p>JPEG, PNG, WebP o AVIF. Máximo 10 MB por archivo.</p></div></div><label className="image-drop"><ImagePlus /><strong>Seleccionar fotografías</strong><span>Puedes seleccionar varios archivos</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={chooseImages} /></label>
      {!!images.length && <div className="image-manager">{images.map((image, index) => <article className="managed-image" key={image.id}><img src={image.url} alt={`Fotografía ${index + 1} de ${values.title}`} /><span className="photo-position">Foto {index + 1}</span>{image.isCover && <span className="cover-label"><Star size={13} /> Portada</span>}<div className="image-actions"><button type="button" onClick={() => void moveImage(index, -1)} disabled={index === 0 || busy} aria-label="Mover imagen arriba" title="Mover arriba"><ArrowUp /><span className="action-label">Arriba</span></button><button type="button" onClick={() => void moveImage(index, 1)} disabled={index === images.length - 1 || busy} aria-label="Mover imagen abajo" title="Mover abajo"><ArrowDown /><span className="action-label">Abajo</span></button><button type="button" onClick={() => void makeCover(image.id)} disabled={image.isCover || busy} aria-label="Usar como portada" title="Usar como portada"><Star /><span className="action-label">Portada</span></button><button type="button" className="danger" onClick={() => void removeImage(image)} disabled={busy} aria-label="Eliminar imagen" title="Eliminar"><Trash2 /><span className="action-label">Eliminar</span></button></div></article>)}</div>}
      {!!pending.length && <><h3 className="pending-title">Pendientes de subir</h3><div className="image-manager">{pending.map((item, index) => <article className="managed-image" key={item.preview}><img src={item.preview} alt={`Nueva fotografía ${index + 1}`} /><button type="button" className="remove-pending" onClick={() => { URL.revokeObjectURL(item.preview); setPending((current) => current.filter((candidate) => candidate !== item)); }} aria-label="Quitar fotografía"><X /></button></article>)}</div></>}{uploadStatus && <p className="upload-status">{uploadStatus}</p>}
    </section>
    <section className="form-section"><div className="form-section-head"><span>06</span><div><h2>Video de la propiedad</h2><p>Selecciona un MP4 o MOV; el destino se elige automáticamente.</p></div></div>
      <label className="video-picker"><span><strong>Video MP4 o MOV</strong><small>Puedes subir videos directamente desde iPhone.<br />Hasta 50 MB se guarda en Supabase.<br />Los videos mayores se optimizan con Mux para reproducción web.</small></span><span className="button outline dark">Seleccionar video</span><input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={chooseVideo} /></label>
      {pendingVideo?.isLarge && <div className="mux-upload-card"><span className="mux-upload-icon"><LoaderCircle size={22} /></span><div><strong>Video seleccionado</strong><p>Este video supera los 50 MB y será optimizado automáticamente para reproducción web.</p><small>{pendingVideo.file.name} · {pendingVideoFormat} · {formatFileSize(pendingVideo.file.size)}</small>{uploadStatus && <div className="mux-upload-state"><span>{uploadStatus}</span>{uploadStatus.includes('%') && <progress max="100" value={muxProgress}>{muxProgress}%</progress>}</div>}</div>{muxJobIdRef.current && uploadStatus.includes('Subiendo') && <button type="button" className="text-button danger-text" onClick={() => void cancelActiveMuxUpload()}>Cancelar subida</button>}</div>}
      {muxJob && <div className={`mux-job-status ${muxJob.status}`} role="status">{muxProcessing && <LoaderCircle className="mux-status-spinner" size={19} />}<div><strong>{muxJob.status === 'completed' ? 'Video listo' : muxJob.status === 'error' ? 'No se pudo procesar el video' : muxJob.status === 'processing' ? 'Procesando video…' : muxJob.status === 'cancelled' ? 'Subida cancelada' : `Subiendo… ${Math.round(muxJob.progress)}%`}</strong><small>{muxJob.originalFilename}</small>{muxJob.status === 'error' && <p>El video anterior y los demás cambios de la propiedad se conservaron.</p>}</div>{muxProcessing && <button type="button" className="text-button danger-text" onClick={() => void cancelPersistedMuxJob()}>Cancelar</button>}</div>}
      {initial?.videoProvider === 'mux' && initial.muxPlaybackId && initial.videoStatus === 'ready' && !pendingVideo && <div className="admin-video-preview"><div className="admin-mux-player" style={{ aspectRatio: initial.videoAspectRatio?.replace(':', ' / ') ?? '9 / 16' }}><MuxPropertyVideo propertyId={initial.id} playbackId={initial.muxPlaybackId} title={values.title || 'Video de la propiedad'} admin /></div><div><span className="video-file-meta"><strong>Video Mux actual</strong><small>Optimizado para reproducción web</small></span><button type="button" className="text-button danger-text" disabled={busy} onClick={() => setConfirmAction('video')}>Eliminar video</button></div></div>}
      {(pendingVideo?.preview || videoUrl) && <div className={`admin-video-preview ${showVideoPlayer ? '' : 'preview-unavailable'}`}>{showVideoPlayer ? <video controls playsInline preload="metadata" style={{ aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}`, width: videoDimensions.width > videoDimensions.height ? 'min(100%, 700px)' : 'min(100%, 405px)' }} onLoadedMetadata={(event) => { const video = event.currentTarget; if (video.videoWidth && video.videoHeight) setVideoDimensions({ width: video.videoWidth, height: video.videoHeight }); }} onError={() => setVideoPlaybackWarning(true)} aria-label={`Recorrido en video de ${values.title || 'la propiedad'}`}><source src={pendingVideo?.preview ?? videoUrl} type={pendingVideo ? videoMimeType(pendingVideo.file.name) : videoMimeType(videoStoragePath)} />Tu navegador no puede reproducir este video.</video> : <div className="video-fallback-card"><strong>{pendingVideo ? 'Video MOV seleccionado correctamente' : 'Video MOV guardado'}</strong><p>Este navegador puede no mostrar la vista previa.</p></div>}{videoPlaybackWarning && isMovVideo && showVideoPlayer && <p className="video-compatibility-note">Este navegador puede no reproducir archivos MOV. La reproducción puede variar según el dispositivo.</p>}<div><span className="video-file-meta"><strong>{pendingVideo ? pendingVideo.file.name : 'Video actual'}</strong>{pendingVideo && <small>{pendingVideoFormat} · {formatFileSize(pendingVideo.file.size)}</small>}</span>{pendingVideo ? <button type="button" className="text-button" onClick={() => { if (pendingVideo.preview) URL.revokeObjectURL(pendingVideo.preview); setPendingVideo(null); setVideoPlaybackWarning(false); }}>Cancelar reemplazo</button> : initial && videoStoragePath ? <button type="button" className="text-button danger-text" disabled={busy} onClick={() => setConfirmAction('video')}>Eliminar video</button> : null}</div></div>}
      {!pendingVideo && initial && hasStoredVideo && initial.videoProvider !== 'mux' && !videoUrl && <p className="video-compatibility-note">El video actual está guardado, pero la vista previa no está disponible temporalmente.</p>}
    </section>
    {initial && <div className="secondary-actions"><div className="danger-actions"><button type="button" className="button danger-button" disabled={busy} onClick={() => setConfirmAction('delete')}>Eliminar</button><button type="button" className="button outline dark" disabled={busy} onClick={() => setConfirmAction('archive')}>Archivar</button></div>{initial.published && <a className="button outline dark action-view" href={`/propiedad/${initial.slug}`} target="_blank" rel="noreferrer"><Eye size={16} /> Ver propiedad</a>}</div>}
    <div className="form-actions"><div className="primary-actions"><a className="button outline dark action-cancel" href="/admin/properties">Cancelar</a><button type="button" className="button outline dark action-save" disabled={busy} onClick={() => void save(initial ? undefined : 'draft')}>{busy ? 'Guardando…' : initial ? 'Guardar cambios' : 'Guardar borrador'}</button><button type="button" className="button action-publish" disabled={busy} onClick={() => void save('publish')}>{busy ? 'Publicando…' : initial ? 'Guardar y publicar' : 'Publicar propiedad'}</button></div></div>
    {confirmAction && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{confirmAction === 'delete' ? '¿Eliminar esta propiedad?' : confirmAction === 'archive' ? '¿Archivar esta propiedad?' : confirmAction === 'video' ? '¿Eliminar el video?' : 'Esta propiedad no tiene fotografías'}</h2><p>{confirmAction === 'delete' ? 'Esta acción eliminará también sus imágenes, video y relaciones. No se puede deshacer.' : confirmAction === 'archive' ? 'La propiedad quedará inactiva y dejará de mostrarse públicamente. El video se conservará.' : confirmAction === 'video' ? 'El video se eliminará definitivamente de su proveedor y desaparecerá del detalle público.' : 'Puedes publicarla sin fotografías y añadirlas posteriormente.'}</p><div><button type="button" className="button outline dark" onClick={() => setConfirmAction(null)}>Cancelar</button><button type="button" className={`button ${confirmAction === 'delete' || confirmAction === 'video' ? 'danger-button' : ''}`} onClick={() => confirmAction === 'publish' ? void save('publish') : void destructiveAction()}>{confirmAction === 'delete' ? 'Eliminar propiedad' : confirmAction === 'archive' ? 'Archivar propiedad' : confirmAction === 'video' ? 'Eliminar video' : 'Publicar de todas formas'}</button></div></div></div>}
  </form>;
}
