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

alter table orders add column if not exists reserved_by_admin boolean not null default false;

-- Anchors the one-hour seat-protection window in the checkout claim to the
-- LATEST payment attempt rather than to order creation. Resuming an abandoned
-- order mints a fresh Mollie payment on the same (old) order row; without
-- this the guard would compare against a stale created_at, protect nothing,
-- and let a rival claim the seats out from under someone mid-payment.
-- Null on pre-existing rows; every reader uses coalesce(payment_started_at, created_at).
alter table orders add column if not exists payment_started_at timestamptz;

-- ---------------------------------------------------------------------------
-- Wheelchair places.
-- See docs/superpowers/specs/2026-08-07-wheelchair-places-design.md
--
-- A place is a set of tickets rows sharing one wheelchair_group_id. Exactly
-- one member — the anchor — is seat_kind='wheelchair' and stays 'available':
-- it is the single sellable ticket. The rest are seat_kind='wheelchair_floor'
-- at status='blocked', which every existing `AND t.status = 'available'`
-- guard already refuses without modification.
-- ---------------------------------------------------------------------------
alter table tickets add column if not exists wheelchair_group_id uuid;
alter table tickets add column if not exists seat_kind text;

-- The original inline column check was auto-named tickets_status_check by
-- Postgres. VERIFY WITH `\d tickets` BEFORE RUNNING and adjust if it differs —
-- a wrong name makes the drop a silent no-op and the add then fails.
alter table tickets drop constraint if exists tickets_status_check;
alter table tickets add constraint tickets_status_check
  check (status in ('available','held','sold','blocked'));

alter table tickets drop constraint if exists tickets_seat_kind_check;
alter table tickets add constraint tickets_seat_kind_check
  check (seat_kind is null or seat_kind in ('wheelchair','wheelchair_floor'));

create index if not exists tickets_wheelchair_group_idx on tickets(wheelchair_group_id);

-- Step 1 of 2 for retiring seats.reserved_for. Safe against the currently
-- deployed code: it makes P1/P2/P28/P29 ordinary sellable seats, which is the
-- desired end state anyway. The `drop column` is deliberately NOT here — see
-- scripts/drop-reserved-for.sql.
update seats set reserved_for = null where reserved_for is not null;

-- ---------------------------------------------------------------------------
-- Access codes and free-ticket codes.
-- See docs/superpowers/specs/2026-08-08-access-codes-design.md
--
-- Single-use, event-scoped, revocable. State is DERIVED, not stored: a code is
-- unused while used_by_order_id is null, in use while that order is pending,
-- and used once it is paid — so nothing can drift out of sync with the order.
--
-- Stored in plaintext on purpose: the admin has to read codes back in the
-- portal to hand them out. ~49 bits of entropy is the protection.
-- ---------------------------------------------------------------------------
create table if not exists ticket_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  kind             text not null check (kind in ('wheelchair','free_ticket')),
  label            text not null,
  event_uuid       text not null,
  created_at       timestamptz not null default now(),
  created_by       text,
  revoked_at       timestamptz,
  used_by_order_id uuid references orders(id) on delete set null,
  used_at          timestamptz
);
create index if not exists ticket_codes_event_idx on ticket_codes(event_uuid);
create index if not exists ticket_codes_order_idx on ticket_codes(used_by_order_id);
