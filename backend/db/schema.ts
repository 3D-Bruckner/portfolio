// The tables of upload.sqlite as kysely sees them, one entry per table that backend/db/migrations.ts creates. Rows come out of the store
// as Selectable<…> (snake_case, as stored); the domain turns them into its own types.
import type { Insertable, Selectable, Updateable } from "kysely";

export interface CategoriesTable {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface PrintsTable {
  id: string;
  slug: string;
  title: string;
  short_title: string | null;
  description: string;
  price: number | null;
  /** 0 or 1. */
  self_designed: number;
  weight_grams: number | null;
  print_time_minutes: number | null;
  colors: number | null;
  status: "draft" | "published";
  first_published_at: string | null;
  position: number | null;
  showcase_position: number | null;
  cover_photo_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrintCategoriesTable {
  print_id: string;
  category_id: string;
}

export interface PrintSourcesTable {
  print_id: string;
  idx: number;
  label: string;
  url: string;
}

export interface PhotosTable {
  id: string;
  print_id: string;
  position: number;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  created_at: string;
  /** The original's stored pixel size and file size; null for a photo stored before originals were kept. */
  original_width: number | null;
  original_height: number | null;
  original_bytes: number | null;
  /** The original's Exif orientation (1–8), which turns the stored size into the shown one; null for a photo stored before it was kept. */
  original_orientation: number | null;
  /** The cutout's rectangle in the original as shown (orientation applied); all null = the whole photo. */
  crop_left: number | null;
  crop_top: number | null;
  crop_width: number | null;
  crop_height: number | null;
}

export interface ReservedSlugsTable {
  slug: string;
  reason: string;
  created_at: string;
}

export interface SiteStateTable {
  key: string;
  value: string;
}

export interface DB {
  categories: CategoriesTable;
  prints: PrintsTable;
  print_categories: PrintCategoriesTable;
  print_sources: PrintSourcesTable;
  photos: PhotosTable;
  reserved_slugs: ReservedSlugsTable;
  site_state: SiteStateTable;
}

export type CategoryRow = Selectable<CategoriesTable>;
export type PrintRow = Selectable<PrintsTable>;
export type NewPrintRow = Insertable<PrintsTable>;
export type PrintRowPatch = Updateable<PrintsTable>;
export type PrintSourceRow = Selectable<PrintSourcesTable>;
export type PhotoRow = Selectable<PhotosTable>;
export type NewPhotoRow = Insertable<PhotosTable>;
export type PhotoRowPatch = Updateable<PhotosTable>;
export type ReservedSlugRow = Selectable<ReservedSlugsTable>;
