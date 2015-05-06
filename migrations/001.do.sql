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
    outbound_system uuid not null,
    outbound_id uuid,
    inbound_system uuid not null,
    inbound_id uuid,
    expires_at timestamp not null
);

CREATE UNIQUE INDEX unique_system_pairs ON wormholes (outbound_system, inbound_system);

CREATE VIEW system_wormholes AS select solar_systems.id, count(wormholes.id)::int from solar_systems left join wormholes on (solar_systems.id = wormholes.outbound_system OR solar_systems.id = wormholes.inbound_system) group by solar_systems.id;
