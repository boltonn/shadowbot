import io
import json
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Form, HTTPException, Response, UploadFile
from geojson_pydantic import Point, Polygon

from shadowbot.api.deps.postgres import (
    DatasetDatastoreDep,
    PointDatasetDatastoreDep,
    PolygonDatasetDatastoreDep,
    TrackDatastoreDep,
)
from shadowbot.api.deps.routing import RoutingDatastoreDep
from shadowbot.schemas.common import DatasetGeometryKind
from shadowbot.schemas.dataset import (
    BulkTagRequest,
    DatasetDetail,
    DatasetsRequest,
    LabelFeatureRequest,
    LabelTrackPointRequest,
    PaginatedDatasetsResponse,
)
from shadowbot.schemas.point_dataset import (
    PointDataset,
    PointDatasetCreate,
    PointFeature,
    PointFeatureCreate,
    TabularPreview,
)
from shadowbot.schemas.polygon_dataset import (
    PolygonDataset,
    PolygonDatasetCreate,
    PolygonFeature,
    PolygonFeatureCreate,
)
from shadowbot.schemas.track import (
    MapMatchResult,
    Track,
    TrackCreate,
    TrackPoint,
    TrackPointCreate,
    TrackSource,
)

router = APIRouter(prefix="/geodata", tags=["geodata"])


@router.get("/datasets")
async def list_datasets(
    dataset_repository: DatasetDatastoreDep,
    page: int = 1,
    limit: int = 20,
    geometry_kind: DatasetGeometryKind | None = None,
) -> PaginatedDatasetsResponse:
    """List dataset summaries across all geometry kinds (points, tracks, polygons)."""
    return await dataset_repository.list_datasets(
        DatasetsRequest(page=page, limit=limit, geometry_kind=geometry_kind)
    )


@router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str, dataset_repository: DatasetDatastoreDep) -> DatasetDetail:
    """Retrieve a dataset including all of its features, whatever its geometry kind."""
    dataset = await dataset_repository.get_dataset_detail(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}")
    return dataset


@router.get("/datasets/{dataset_id}/download")
async def download_dataset(dataset_id: str, dataset_repository: DatasetDatastoreDep) -> Response:
    """Download a dataset's features as a GeoJSON FeatureCollection."""
    dataset = await dataset_repository.get_dataset_detail(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}")
    geojson = await dataset_repository.download_dataset(dataset_id)
    return Response(
        content=json.dumps(geojson),
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{dataset.name}.geojson"'},
    )


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


@router.post("/datasets/tracks/upload")
async def upload_track(track_repository: TrackDatastoreDep, file: UploadFile, name: str = Form(...)) -> Track:
    """Upload a GeoJSON FeatureCollection of timestamped Point features as a new track."""
    try:
        raw = json.loads(await file.read())
        points = _parse_geojson_points(raw)
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid GeoJSON upload: {exc}") from exc

    return await track_repository.add_track(TrackCreate(name=name, source=TrackSource.GEOJSON, points=points))


@router.post("/datasets/tracks/{track_id}/match")
async def match_track(
    track_id: str, track_repository: TrackDatastoreDep, routing: RoutingDatastoreDep
) -> MapMatchResult:
    """Snap a track's raw GPS points onto the actual roads it drove.

    Requires the Valhalla routing backend (VALHALLA__TILE_URI) — 501s otherwise.
    """
    track = await track_repository.get_track_by_id(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    if not routing.supports_map_matching:
        raise HTTPException(status_code=501, detail="Map matching requires the Valhalla routing backend")
    try:
        return await routing.match_track(track=track)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/datasets/tracks/{dataset_id}/features/{feature_id}")
async def label_track_point(
    dataset_id: str, feature_id: str, request: LabelTrackPointRequest, track_repository: TrackDatastoreDep
) -> TrackPoint:
    """Update a track point's tags."""
    return await track_repository.label_feature(dataset_id, feature_id, request)


@router.post("/datasets/tracks/{dataset_id}/features/tags")
async def bulk_tag_track_points(
    dataset_id: str, request: BulkTagRequest, track_repository: TrackDatastoreDep
) -> list[TrackPoint]:
    """Apply and/or remove tags across a set of a track's points."""
    return await track_repository.bulk_tag_features(dataset_id, request)


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
        extra = {k: v for k, v in properties.items() if k not in {type_field, "name", "label"}}
        points.append(
            PointFeatureCreate(
                geometry=Point(**geometry),
                category=str(category),
                name=properties.get("name") or properties.get("label"),
                properties=extra,
            )
        )
    return points


def _read_tabular_file(filename: str, raw: bytes) -> pd.DataFrame:
    """Parse an uploaded CSV or Excel file into a DataFrame."""
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix == "csv":
        return pd.read_csv(io.BytesIO(raw))
    if suffix == "xlsx":
        return pd.read_excel(io.BytesIO(raw), engine="openpyxl")
    raise ValueError(f"Unsupported file type '{suffix}' — expected .csv or .xlsx")


def _parse_tabular_points(
    df: pd.DataFrame, lat_field: str, lon_field: str, type_field: str | None, default_type: str | None
) -> tuple[list[PointFeatureCreate], int]:
    """Convert a DataFrame's rows into categorized Point features, skipping rows with invalid coordinates.

    Every column besides the designated lat/lon/category/name fields is carried over as-is
    into each point's `properties`, so uploaded data stays filterable by any original column.
    """
    if not type_field and not default_type:
        raise ValueError("Provide either a type field name or a default type")
    if lat_field not in df.columns or lon_field not in df.columns:
        raise ValueError(f"Columns '{lat_field}' and/or '{lon_field}' not found in the uploaded file")

    lat = pd.to_numeric(df[lat_field], errors="coerce")
    lon = pd.to_numeric(df[lon_field], errors="coerce")
    valid = lat.between(-90, 90) & lon.between(-180, 180)
    skipped = int((~valid).sum())

    records = json.loads(df.loc[valid].to_json(orient="records"))
    reserved = {lat_field, lon_field, type_field, "name", "label"}

    points = []
    for lat_value, lon_value, record in zip(lat[valid], lon[valid], records, strict=True):
        category = record.get(type_field) if type_field else default_type
        if not category:
            raise ValueError(f"Row is missing a '{type_field}' value")
        properties = {k: v for k, v in record.items() if k not in reserved}
        points.append(
            PointFeatureCreate(
                geometry=Point(type="Point", coordinates=(lon_value, lat_value)),
                category=str(category),
                name=record.get("name") or record.get("label"),
                properties=properties,
            )
        )
    return points, skipped


@router.post("/datasets/points/preview")
async def preview_tabular_points(file: UploadFile) -> TabularPreview:
    """Preview a CSV/Excel file's columns and a sample of rows before uploading it as a point dataset."""
    try:
        df = _read_tabular_file(file.filename or "", await file.read())
    except Exception as exc:  # noqa: BLE001 - surfaces malformed file content as a 422
        raise HTTPException(status_code=422, detail=f"Could not read file: {exc}") from exc

    sample_rows = json.loads(df.head(20).to_json(orient="records"))
    return TabularPreview(columns=list(df.columns), sample_rows=sample_rows, row_count=len(df))


@router.post("/datasets/points/upload")
async def upload_point_dataset(
    point_dataset_repository: PointDatasetDatastoreDep,
    file: UploadFile,
    name: str = Form(...),
    type_field: str | None = Form(default=None),
    default_type: str | None = Form(default=None),
    lat_field: str | None = Form(default=None),
    lon_field: str | None = Form(default=None),
) -> PointDataset:
    """Upload a GeoJSON, CSV, or Excel file of categorized Point features as a new point dataset.

    Categorize either by naming a property/column present on each feature (`type_field`,
    e.g. "type") or, for a uniform dataset, by passing a single `default_type`. CSV/Excel
    files have no inherent geometry, so `lat_field`/`lon_field` name the columns to read
    coordinates from; every other column is carried over as filterable `properties`.
    """
    filename = file.filename or ""
    raw = await file.read()
    is_tabular = filename.lower().endswith((".csv", ".xlsx"))

    try:
        if is_tabular:
            if not lat_field or not lon_field:
                raise ValueError("lat_field and lon_field are required for CSV/Excel uploads")
            df = _read_tabular_file(filename, raw)
            points, _skipped = _parse_tabular_points(
                df, lat_field=lat_field, lon_field=lon_field, type_field=type_field, default_type=default_type
            )
        else:
            points = _parse_geojson_point_features(
                json.loads(raw), type_field=type_field, default_type=default_type
            )
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid upload: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 - malformed CSV/Excel content surfaces as a 422, not a 500
        if not is_tabular:
            raise
        raise HTTPException(status_code=422, detail=f"Invalid upload: {exc}") from exc

    return await point_dataset_repository.add_point_dataset(PointDatasetCreate(name=name, points=points))


@router.patch("/datasets/points/{dataset_id}/features/{feature_id}")
async def label_point_feature(
    dataset_id: str,
    feature_id: str,
    request: LabelFeatureRequest,
    point_dataset_repository: PointDatasetDatastoreDep,
) -> PointFeature:
    """Update a point feature's category, name, and tags."""
    return await point_dataset_repository.label_feature(dataset_id, feature_id, request)


@router.post("/datasets/points/{dataset_id}/features/tags")
async def bulk_tag_point_features(
    dataset_id: str, request: BulkTagRequest, point_dataset_repository: PointDatasetDatastoreDep
) -> list[PointFeature]:
    """Apply and/or remove tags across a set of a point dataset's features."""
    return await point_dataset_repository.bulk_tag_features(dataset_id, request)


def _parse_geojson_polygon_features(
    raw: dict, type_field: str | None, default_type: str | None
) -> list[PolygonFeatureCreate]:
    """Extract categorized Polygon features from an uploaded GeoJSON payload.

    Same category-source convention as point uploads: a per-feature `type_field`
    property, or a single `default_type` applied to every polygon.
    """
    if not type_field and not default_type:
        raise ValueError("Provide either a type field name or a default type")

    features = raw["features"] if raw.get("type") == "FeatureCollection" else [raw]

    polygons = []
    for index, feature in enumerate(features):
        geometry = feature.get("geometry", feature)
        if geometry.get("type") != "Polygon":
            continue
        properties = feature.get("properties") or {}
        category = properties.get(type_field) if type_field else default_type
        if not category:
            raise ValueError(f"Polygon {index} is missing a '{type_field}' property")
        polygons.append(
            PolygonFeatureCreate(
                geometry=Polygon(**geometry),
                category=str(category),
                name=properties.get("name") or properties.get("label"),
            )
        )
    return polygons


@router.post("/datasets/polygons/upload")
async def upload_polygon_dataset(
    polygon_dataset_repository: PolygonDatasetDatastoreDep,
    file: UploadFile,
    name: str = Form(...),
    type_field: str | None = Form(default=None),
    default_type: str | None = Form(default=None),
) -> PolygonDataset:
    """Upload a GeoJSON FeatureCollection of categorized Polygon features as a new polygon dataset."""
    try:
        raw = json.loads(await file.read())
        polygons = _parse_geojson_polygon_features(raw, type_field=type_field, default_type=default_type)
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid GeoJSON upload: {exc}") from exc

    return await polygon_dataset_repository.add_polygon_dataset(PolygonDatasetCreate(name=name, polygons=polygons))


@router.patch("/datasets/polygons/{dataset_id}/features/{feature_id}")
async def label_polygon_feature(
    dataset_id: str,
    feature_id: str,
    request: LabelFeatureRequest,
    polygon_dataset_repository: PolygonDatasetDatastoreDep,
) -> PolygonFeature:
    """Update a polygon feature's category, name, and tags."""
    return await polygon_dataset_repository.label_feature(dataset_id, feature_id, request)


@router.post("/datasets/polygons/{dataset_id}/features/tags")
async def bulk_tag_polygon_features(
    dataset_id: str, request: BulkTagRequest, polygon_dataset_repository: PolygonDatasetDatastoreDep
) -> list[PolygonFeature]:
    """Apply and/or remove tags across a set of a polygon dataset's features."""
    return await polygon_dataset_repository.bulk_tag_features(dataset_id, request)
