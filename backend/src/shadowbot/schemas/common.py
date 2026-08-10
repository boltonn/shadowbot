from enum import StrEnum


class SortOrder(StrEnum):
    """Sort order for paginated list endpoints."""

    ASC = "asc"
    DESC = "desc"


class DatasetGeometryKind(StrEnum):
    """The geometry a dataset's features carry."""

    POINT = "point"
    TRACK = "track"
    POLYGON = "polygon"
