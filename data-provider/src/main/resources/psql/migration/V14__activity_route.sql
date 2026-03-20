create table activity_route(
    activity_id bigint primary key,
    athlete_id bigint not null,
    source varchar not null,
    updated_at timestamp not null,
    data jsonb not null
);

create index activity_route_athlete_id_idx on activity_route(athlete_id);
