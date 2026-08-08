from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shadowbot.datastores.postgres.tables.route import RouteTable
from shadowbot.datastores.postgres.utils import geom_to_linestring, geom_to_point, linestring_to_geom, point_to_geom
from shadowbot.schemas.routing import AvoidancePreferences, Route


class PostgresRouteRepository:
    """Postgres implementation of RouteRepository (archive of computed routes)."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_route(self, route: Route) -> Route:
        """Persist a computed route."""
        route_table = RouteTable(
            id=route.id,
            origin=point_to_geom(route.origin),
            destination=point_to_geom(route.destination),
            geometry=linestring_to_geom(route.geometry),
            distance_m=route.distance_m,
            duration_s=route.duration_s,
            avoid=route.avoid.model_dump(mode="json"),
            date_created=route.date_created,
        )
        self.session.add(route_table)
        await self.session.commit()
        return route

    async def get_route_by_id(self, route_id: str) -> Route | None:
        """Retrieve a previously computed route by ID."""
        result = await self.session.execute(select(RouteTable).where(RouteTable.id == route_id))
        route_table = result.scalar_one_or_none()
        if route_table is None:
            return None
        return Route(
            id=route_table.id,
            origin=geom_to_point(route_table.origin),
            destination=geom_to_point(route_table.destination),
            geometry=geom_to_linestring(route_table.geometry),
            distance_m=route_table.distance_m,
            duration_s=route_table.duration_s,
            avoid=AvoidancePreferences.model_validate(route_table.avoid),
            date_created=route_table.date_created,
        )
