CREATE EXTENSION "uuid-ossp";

CREATE TABLE solar_systems (
    id uuid PRIMARY KEY,
    doc json not null
);

CREATE TABLE space_objects (
    id uuid PRIMARY KEY,
    account_id uuid,
    system_id uuid not null REFERENCES solar_systems (id),
    tombstone boolean not null default false,
    tombstone_at timestamp,
    doc json not null
);

CREATE TABLE wormholes (
    id uuid PRIMARY KEY,
    outbound_system uuid not null REFERENCES solar_systems (id),
    outbound_id uuid REFERENCES space_objects (id),
    inbound_system uuid not null REFERENCES solar_systems (id),
    inbound_id uuid REFERENCES space_objects (id),
    expires_at timestamp not null
);

CREATE UNIQUE INDEX unique_system_pairs ON wormholes (outbound_system, inbound_system);

CREATE VIEW system_wormholes AS select solar_systems.id, count(wormholes.id)::int from solar_systems left join wormholes on ((solar_systems.id = wormholes.outbound_system OR solar_systems.id = wormholes.inbound_system) and wormholes.expires_at > current_timestamp) group by solar_systems.id;
