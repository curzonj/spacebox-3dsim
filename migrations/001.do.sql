CREATE TABLE space_objects (
    id uuid PRIMARY KEY,
    tombstone boolean not null default false,
    tombstone_at timestamp,
    doc json not null
)
