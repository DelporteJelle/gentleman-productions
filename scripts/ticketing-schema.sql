-- Ticketing tables for the main site (Neon). Run once against DATABASE_URL.
create extension if not exists pgcrypto;

alter table events add column if not exists production_theme jsonb;

create table if not exists seats (
  id           uuid primary key default gen_random_uuid(),
  "row"        text    not null,
  seat_number  integer not null,
  reserved_for text,
  unique ("row", seat_number)
);

create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  event_uuid        text not null,
  date_uuid         text not null,
  customer_name     text not null,
  customer_email    text not null,
  total_amount      integer not null default 0,
  status            text not null default 'pending'
                      check (status in ('pending','paid','cancelled')),
  mollie_payment_id text,
  created_at        timestamptz not null default now()
);
create index if not exists orders_date_uuid_idx on orders(date_uuid);

create table if not exists tickets (
  id          uuid primary key default gen_random_uuid(),
  event_uuid  text not null,
  date_uuid   text not null,
  seat_id     uuid not null references seats(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  status      text not null default 'available'
                check (status in ('available','held','sold')),
  held_until  timestamptz,
  scanned_at  timestamptz,
  unique (date_uuid, seat_id)
);
create index if not exists tickets_date_uuid_idx on tickets(date_uuid);
create index if not exists tickets_order_id_idx  on tickets(order_id);
create index if not exists tickets_status_idx    on tickets(status);
