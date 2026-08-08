from enum import StrEnum


class SortOrder(StrEnum):
    """Sort order for paginated list endpoints."""

    ASC = "asc"
    DESC = "desc"
