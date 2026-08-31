export const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024;

export type PropertyVideoExtension = 'mp4' | 'mov';

export type StorageErrorDiagnostic = {
  statusCode?: string | number;
  name?: string;
  message: string;
  storageError?: string;
};

export const getVideoExtension = (fileName: string): PropertyVideoExtension | undefined =>
  fileName.toLowerCase().match(/\.(mp4|mov)$/)?.[1] as PropertyVideoExtension | undefined;

export const getVideoContentType = (extension: PropertyVideoExtension) =>
  extension === 'mov' ? 'video/quicktime' : 'video/mp4';

export function validatePropertyVideo(file: Pick<File, 'name' | 'size'>): PropertyVideoExtension {
  const extension = getVideoExtension(file.name);
  if (!extension) throw new Error('Solo puedes subir videos MP4 o MOV.');
  if (file.size > VIDEO_MAX_SIZE_BYTES) throw new Error('El video supera el límite máximo configurado de 50 MB.');
  return extension;
}

export function validateMuxSourceVideo(file: Pick<File, 'name' | 'size'>): PropertyVideoExtension {
  const extension = getVideoExtension(file.name);
  if (!extension) throw new Error('Solo puedes subir videos MP4 o MOV.');
  if (file.size <= 0) throw new Error('El archivo de video está vacío.');
  return extension;
}

export function parseVideoAspectRatio(value?: string): { width: number; height: number } {
  const match = value?.match(/^([1-9]\d*):([1-9]\d*)$/);
  if (!match) return { width: 9, height: 16 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function getStorageErrorDiagnostic(error: unknown): StorageErrorDiagnostic {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : typeof record.message === 'string' ? record.message : String(error);
  const name = error instanceof Error ? error.name : typeof record.name === 'string' ? record.name : undefined;
  const statusCode = typeof record.statusCode === 'string' || typeof record.statusCode === 'number'
    ? record.statusCode
    : typeof record.status === 'string' || typeof record.status === 'number' ? record.status : undefined;
  const storageError = typeof record.error === 'string' ? record.error : typeof record.code === 'string' ? record.code : undefined;
  return { statusCode, name, message, storageError };
}

export function getVideoUploadErrorMessage(diagnostic: StorageErrorDiagnostic, extension: PropertyVideoExtension): string {
  const details = `${diagnostic.statusCode ?? ''} ${diagnostic.name ?? ''} ${diagnostic.message} ${diagnostic.storageError ?? ''}`.toLowerCase();
  const statusCode = diagnostic.statusCode === undefined ? undefined : String(diagnostic.statusCode);
  const format = extension.toUpperCase();
  if (details.includes('mime') || details.includes('content type') || details.includes('not supported')) return `Este archivo ${format} no está permitido todavía por Storage.`;
  if (statusCode === '413' || details.includes('too large') || details.includes('payload') || details.includes('file size') || details.includes('maximum allowed')) return 'El video supera el tamaño máximo permitido por Storage.';
  if (statusCode === '401' || statusCode === '403' || details.includes('row-level security') || details.includes('unauthorized') || details.includes('permission')) return 'No tienes permisos para subir este video. Cierra sesión e inicia sesión nuevamente; si continúa, revisa el rol admin/editor.';
  if (details.includes('bucket not found') || details.includes('nosuchbucket')) return 'El bucket property-videos no existe o no está disponible.';
  if (details.includes('invalid object') || details.includes('invalid key')) return 'Storage rechazó el nombre o la ruta del video.';
  return 'No se pudo subir el video por un error de almacenamiento.';
}
