"""Builds prefilled GitHub 'new issue' links — no API calls, GitHub's new-issue form takes query params."""

from urllib.parse import urlencode

from geojson_pydantic import Point

_COVERAGE_LABEL = "coverage-request"


def build_coverage_issue_url(*, repo: str, place: str | None = None, point: Point | None = None) -> str:
    """A link to open a pre-filled 'request routing coverage here' issue on repo (owner/repo)."""
    title = f"Add routing coverage: {place}" if place else "Add routing coverage"
    body_lines = ["Requesting fast, pre-compiled Valhalla routing coverage for:", f"- Place: {place or 'unspecified'}"]
    if point is not None:
        lon, lat = point.coordinates[0], point.coordinates[1]
        body_lines.append(f"- Coordinates: {lat:.5f}, {lon:.5f}")
    params = {"title": title, "body": "\n".join(body_lines), "labels": _COVERAGE_LABEL}
    return f"https://github.com/{repo}/issues/new?{urlencode(params)}"
