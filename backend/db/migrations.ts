// portfolio.sqlite's schema, in order, run by the kit's migrate at open (next-app-kit/migrations). A migration that has shipped is never
// edited: a change to the schema is a new migration at the end of the list.
import type { Migration } from "next-app-kit/migrations";

export const MIGRATIONS: Migration[] = [
  {
    // The portfolio: prints with their categories, sources and photos, the slugs no print may take again, and the app's own state.
    // position (the portfolio order) and showcase_position (the pinned prints' order) are REALs, so a move writes one row (the midpoint
    // between its new neighbours); both are null while a print isn't published, showcase_position also while it isn't pinned.
    name: "portfolio",
    sql: `
      create table categories (
        id text primary key,
        name text not null unique,
        slug text not null unique,
        created_at text not null
      );
      create table prints (
        id text primary key,
        slug text not null unique,
        title text not null,
        short_title text,
        description text not null,
        price integer,
        self_designed integer not null default 0 check (self_designed in (0, 1)),
        weight_grams integer,
        print_time_minutes integer,
        colors integer,
        status text not null default 'draft' check (status in ('draft', 'published')),
        first_published_at text,
        position real,
        showcase_position real,
        cover_photo_id text,
        created_at text not null,
        updated_at text not null
      );
      create table print_categories (
        print_id text not null references prints(id) on delete cascade,
        category_id text not null references categories(id),
        primary key (print_id, category_id)
      );
      create index print_categories_category on print_categories(category_id);
      create table print_sources (
        print_id text not null references prints(id) on delete cascade,
        idx integer not null,
        label text not null,
        url text not null,
        primary key (print_id, idx)
      );
      create table photos (
        id text primary key,
        print_id text not null references prints(id) on delete cascade,
        position real not null,
        width integer not null,
        height integer not null,
        bytes integer not null,
        sha256 text not null,
        created_at text not null
      );
      create index photos_print on photos(print_id, position);
      create table reserved_slugs (
        slug text primary key,
        reason text not null,
        created_at text not null
      );
      create table site_state (
        key text primary key,
        value text not null
      );
    `,
  },
  {
    // Each photo keeps its original (DATA_DIR/photos/<printId>/<photoId>.orig.<jpg|png|webp>, without metadata) and a cutout chosen
    // from it, which is what <photoId>.jpg and width, height, bytes and sha256 are. original_*: the original's stored pixel size (before
    // its orientation is applied) and file size; null for a photo stored before originals were kept. crop_*: the cutout's rectangle in
    // the original as shown (orientation applied); all null = the whole photo.
    name: "cutouts",
    sql: `
      alter table photos add column original_width integer;
      alter table photos add column original_height integer;
      alter table photos add column original_bytes integer;
      alter table photos add column crop_left integer;
      alter table photos add column crop_top integer;
      alter table photos add column crop_width integer;
      alter table photos add column crop_height integer;
    `,
  },
  {
    // The original's Exif orientation (1–8; 1 for a PNG or WebP, kept upright): with original_width/height, the stored pixel size, it
    // gives the size the original is shown at, which crops are measured in (5–8 swap width and height). Null for a photo stored before.
    name: "original_orientation",
    sql: `alter table photos add column original_orientation integer;`,
  },
  {
    // A print's categories in the order they were given: the first is its main one (the site's breadcrumb and "similar prints").
    // Before, they were listed by name: the rows there keep that order.
    name: "category_order",
    sql: `
      alter table print_categories add column idx integer not null default 0;
      update print_categories set idx = (
        select count(*) from print_categories o join categories oc on oc.id = o.category_id
        where o.print_id = print_categories.print_id
          and oc.name < (select name from categories where id = print_categories.category_id)
      );
    `,
  },
  {
    // The words a print came with from a model page or a 3MF, before any translation or rewrite: context for Claude later. Null for a
    // print that has none, and for every print made before this.
    name: "original_texts",
    sql: `
      alter table prints add column original_title text;
      alter table prints add column original_description text;
    `,
  },
];
