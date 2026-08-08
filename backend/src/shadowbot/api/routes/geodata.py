import json
from datetime import datetime

from fastapi import APIRouter, Form, HTTPException, UploadFile
from geojson_pydantic import Point

from shadowbot.api.deps.postgres import PointDatasetDatastoreDep, TrackDatastoreDep
from shadowbot.schemas.point_dataset import (
    PaginatedPointDatasetsResponse,
    PointDataset,
    PointDatasetCreate,
    PointDatasetDetail,
    PointDatasetsRequest,
    PointFeatureCreate,
)
from shadowbot.schemas.track import (
    PaginatedTracksResponse,
    Track,
    TrackCreate,
    TrackDetail,
    TrackPointCreate,
    TrackSource,
    TracksRequest,
)

router = APIRouter(prefix="/geodata", tags=["geodata"])


def _parse_geojson_points(raw: dict) -> list[TrackPointCreate]:
    """Extract timestamped Point features from an uploaded GeoJSON payload."""
    features = raw["features"] if raw.get("type") == "FeatureCollection" else [raw]

    points = []
    for feature in features:
        geometry = feature.get("geometry", feature)
        if geometry.get("type") != "Point":
            continue
        properties = feature.get("properties") or {}
        date_recorded = properties.get("time") or properties.get("date_recorded")
        if date_recorded is None:
            raise ValueError("Each point feature needs a 'time' (or 'date_recorded') property")
        points.append(
            TrackPointCreate(
                geometry=Point(**geometry),
                date_recorded=datetime.fromisoformat(date_recorded),
                elevation_m=properties.get("ele"),
                speed_mps=properties.get("speed"),
            )
        )
    return points


@router.post("/upload")
async def upload_track(track_repository: TrackDatastoreDep, file: UploadFile, name: str = Form(...)) -> Track:
    """Upload a GeoJSON FeatureCollection of timestamped Point features as a new track."""
    try:
        raw = json.loads(await file.read())
        points = _parse_geojson_points(raw)
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid GeoJSON upload: {exc}") from exc

    return await track_repository.add_track(TrackCreate(name=name, source=TrackSource.GEOJSON, points=points))


@router.get("/tracks")
async def list_tracks(
    track_repository: TrackDatastoreDep, page: int = 1, limit: int = 20
) -> PaginatedTracksResponse:
    """List uploaded tracks."""
    return await track_repository.get_tracks(TracksRequest(page=page, limit=limit))


@router.get("/tracks/{track_id}")
async def get_track(track_id: str, track_repository: TrackDatastoreDep) -> TrackDetail:
    """Retrieve a track including all of its points."""
    track = await track_repository.get_track_by_id(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    return track


def _parse_geojson_point_features(
    raw: dict, type_field: str | None, default_type: str | None
) -> list[PointFeatureCreate]:
    """Extract categorized Point features from an uploaded GeoJSON payload.

    The category for each point comes from a designated property (`type_field`,
    read per-feature so one file can mix categories) or, if that's not given,
    a single `default_type` applied to every point.
    """
    if not type_field and not default_type:
        raise ValueError("Provide either a type field name or a default type")

    features = raw["features"] if raw.get("type") == "FeatureCollection" else [raw]

    points = []
    for index, feature in enumerate(features):
        geometry = feature.get("geometry", feature)
        if geometry.get("type") != "Point":
            continue
        properties = feature.get("properties") or {}
        category = properties.get(type_field) if type_field else default_type
        if not category:
            raise ValueError(f"Point {index} is missing a '{type_field}' property")
        points.append(
            PointFeatureCreate(
                geometry=Point(**geometry),
                category=str(category),
                name=properties.get("name") or properties.get("label"),
            )
        )
    return points


@router.post("/points/upload")
async def upload_point_dataset(
    point_dataset_repository: PointDatasetDatastoreDep,
    file: UploadFile,
    name: str = Form(...),
    type_field: str | None = Form(default=None),
    default_type: str | None = Form(default=None),
) -> PointDataset:
    """Upload a GeoJSON FeatureCollection of categorized Point features as a new point dataset.

    Categorize either by naming a property present on each feature (`type_field`,
    e.g. "type") or, for a uniform dataset, by passing a single `default_type`.
    """
    try:
        raw = json.loads(await file.read())
        points = _parse_geojson_point_features(raw, type_field=type_field, default_type=default_type)
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid GeoJSON upload: {exc}") from exc

    return await point_dataset_repository.add_point_dataset(PointDatasetCreate(name=name, points=points))


@router.get("/points")
async def list_point_datasets(
    point_dataset_repository: PointDatasetDatastoreDep, page: int = 1, limit: int = 20
) -> PaginatedPointDatasetsResponse:
    """List uploaded point datasets."""
    return await point_dataset_repository.get_point_datasets(PointDatasetsRequest(page=page, limit=limit))


@router.get("/points/{dataset_id}")
async def get_point_dataset(dataset_id: str, point_dataset_repository: PointDatasetDatastoreDep) -> PointDatasetDetail:
    """Retrieve a point dataset including all of its features."""
    dataset = await point_dataset_repository.get_point_dataset_by_id(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Point dataset not found: {dataset_id}")
    return dataset
