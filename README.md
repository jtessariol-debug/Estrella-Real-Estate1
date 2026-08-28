# Estrella Real Estate

Frontend público y base administrativa para gestionar propiedades de Estrella Real Estate en Santiago, República Dominicana.

## Desarrollo local

Requisitos: Node.js 20 o superior y un proyecto de Supabase.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Sin variables de Supabase, el modo de desarrollo utiliza propiedades demo. Los builds de producción nunca usan los mocks como fuente principal y mostrarán un error de configuración hasta que se definan las variables.

## Supabase Setup

1. Crea un proyecto desde el Dashboard de Supabase.
2. Abre **SQL Editor** y ejecuta las migraciones, en orden:
   - [`supabase/migrations/202608200001_initial_real_estate.sql`](supabase/migrations/202608200001_initial_real_estate.sql)
   - [`supabase/migrations/202608200002_add_property_video.sql`](supabase/migrations/202608200002_add_property_video.sql)
   - [`supabase/migrations/202608270001_allow_mov_property_videos.sql`](supabase/migrations/202608270001_allow_mov_property_videos.sql)
3. Confirma en **Storage** que existan los buckets privados `property-images` y `property-videos`. El segundo admite un MP4 o MOV de hasta 50 MB por propiedad, alineado con Supabase Free. El frontend genera URLs firmadas después de que RLS autoriza cada archivo.
4. En **Project Settings > API**, copia la URL del proyecto y la clave pública `anon`. No utilices `service_role` en el navegador.
5. Crea `.env.local` a partir de `.env.example`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

6. En **Authentication > Users**, crea el primer usuario administrador. Para una instalación privada se recomienda deshabilitar el registro público.
7. Copia el UUID del usuario y ejecuta en SQL Editor:

```sql
insert into public.profiles (id, full_name, role)
values ('USER_UUID_HERE', 'Nombre del administrador', 'admin');
```

8. Inicia el proyecto y entra en `/admin/login` con ese usuario.

Los usuarios adicionales deben crearse primero en Supabase Auth y después recibir un registro en `profiles` con rol `admin` o `editor`. No asignes perfiles privilegiados automáticamente desde el registro público.

## Modelo y seguridad

- `properties`: información, publicación, estado y autor de cada propiedad.
- `property_images`: metadatos y orden de archivos guardados bajo `properties/PROPERTY_UUID/...`.
- `amenities` y `property_amenities`: catálogo y relación muchos-a-muchos.
- `profiles`: autorización administrativa asociada a `auth.users`.
- RLS permite al público leer únicamente propiedades publicadas con estados visibles y sus relaciones.
- Solo perfiles autenticados `admin` o `editor` pueden administrar propiedades, imágenes y amenidades.
- Solo `admin` puede administrar perfiles ajenos.
- El bucket acepta escritura únicamente de `admin` y `editor` autenticados.
- `properties.video_storage_path` guarda el path persistente del MP4 o MOV; las URLs firmadas nunca se almacenan en la base de datos.

Los MP4 ofrecen la mayor compatibilidad web. Los MOV se aceptan y almacenan con `video/quicktime` —incluidos archivos transferidos desde iPhone—, pero su reproducción depende del codec y del navegador; no se garantiza que todos los MOV funcionen en Chrome o Android.

## Comandos

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
```

No existe configuración de lint en esta fase.
