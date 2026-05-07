-- ─────────────────────────────────────────────────────────────────────────────
--  Script SQL Supabase — Minsouah
--  Colle ce script dans l'éditeur SQL de Supabase (onglet SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- Table : propriétés
create table if not exists properties (
  id          bigserial primary key,
  name        text not null,
  address     text,
  type        text check (type in ('Appartement','Villa','Commerce')),
  status      text check (status in ('Loué','Disponible','Maintenance')) default 'Disponible',
  rent        numeric,
  surface     numeric,
  rooms       int,
  owner       text,
  image_url   text,
  created_at  timestamptz default now()
);

-- Table : propriétaires
create table if not exists owners (
  id          bigserial primary key,
  name        text not null,
  email       text unique,
  phone       text,
  bank        text,
  iban        text,
  status      text default 'Actif',
  created_at  timestamptz default now()
);

-- Table : locataires
create table if not exists tenants (
  id          bigserial primary key,
  name        text not null,
  email       text unique,
  phone       text,
  id_type     text,
  id_number   text,
  property_id bigint references properties(id),
  since       date,
  status      text default 'Actif',
  created_at  timestamptz default now()
);

-- Table : contrats
create table if not exists contracts (
  id             bigserial primary key,
  property_id    bigint references properties(id),
  tenant_id      bigint references tenants(id),
  rent           numeric not null,
  start_date     date,
  end_date       date,
  status         text check (status in ('Actif','Expirant','Brouillon','Résilié')) default 'Brouillon',
  payment_freq   text default 'mensuel',
  deposit        numeric,
  created_at     timestamptz default now()
);

-- Table : transactions financières
create table if not exists transactions (
  id          bigserial primary key,
  date        date default current_date,
  entity      text,
  description text,
  type        text check (type in ('Loyer','Réparations','Taxes')),
  status      text default 'En attente',
  amount      numeric,
  positive    boolean,
  created_at  timestamptz default now()
);

-- Table : tickets maintenance
create table if not exists tickets (
  id          text primary key,
  title       text not null,
  description text,
  priority    text check (priority in ('Urgent','Moyen','Bas')) default 'Moyen',
  type        text check (type in ('Plomberie','HVAC','Électricité','Autre')),
  property    text,
  unit        text,
  status      text check (status in ('En attente','En cours','Résolu')) default 'En attente',
  technician  text,
  reported_at timestamptz default now(),
  created_at  timestamptz default now()
);

-- Table : messages
create table if not exists messages (
  id              bigserial primary key,
  conversation_id bigint,
  sender          text,
  text            text not null,
  sent            boolean default false,
  created_at      timestamptz default now()
);

-- Activer Row Level Security (RLS) — optionnel mais recommandé
alter table properties  enable row level security;
alter table tenants     enable row level security;
alter table contracts   enable row level security;
alter table transactions enable row level security;
alter table tickets     enable row level security;
alter table messages    enable row level security;

-- Politique publique pour les tests (à restreindre en production)
create policy "Allow all" on properties  for all using (true);
create policy "Allow all" on tenants     for all using (true);
create policy "Allow all" on contracts   for all using (true);
create policy "Allow all" on transactions for all using (true);
create policy "Allow all" on tickets     for all using (true);
create policy "Allow all" on messages    for all using (true);
