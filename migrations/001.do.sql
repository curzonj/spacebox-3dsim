CREATE EXTENSION "uuid-ossp";

CREATE TABLE space_objects (
    id uuid PRIMARY KEY,
    system_id uuid not null,
    tombstone boolean not null default false,
    tombstone_at timestamp,
    doc json not null
);

CREATE TABLE solar_systems (
    id uuid PRIMARY KEY,
    doc json not null
);

CREATE TABLE wormholes (
    id uuid PRIMARY KEY,
    outbound uuid not null,
    inbound uuid not null
);

CREATE VIEW system_wormholes AS select solar_systems.id, count(wormholes.id) from solar_systems left join wormholes on (solar_systems.id = wormholes.outbound OR solar_systems.id = wormholes.inbound) group by solar_systems.id;
