import { apiClient } from "@/lib/api-client";
import type {
  BulkTagRequest,
  DatasetDetail,
  DatasetGeometryKind,
  LabelFeatureRequest,
  LabelTrackPointRequest,
  PaginatedDatasetsResponse,
  PointDataset,
  PointFeature,
  PolygonDataset,
  PolygonFeature,
  Track,
  TrackPoint,
} from "@/features/geodata/types";

export async function listDatasets(params?: {
  page?: number;
  limit?: number;
  geometryKind?: DatasetGeometryKind;
}): Promise<PaginatedDatasetsResponse> {
  const response = await apiClient.get<PaginatedDatasetsResponse>("/geodata/datasets", { params });
  return response.data;
}

export async function getDataset(datasetId: string): Promise<DatasetDetail> {
  const response = await apiClient.get<DatasetDetail>(`/geodata/datasets/${datasetId}`);
  return response.data;
}

export async function downloadDataset(datasetId: string, name: string): Promise<void> {
  const response = await apiClient.get(`/geodata/datasets/${datasetId}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.geojson`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function uploadTrack(name: string, file: File): Promise<Track> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("file", file);
  // No explicit Content-Type: axios needs to set it itself so the multipart
  // boundary parameter is included, which FastAPI's parser requires.
  const response = await apiClient.post<Track>("/geodata/datasets/tracks/upload", formData);
  return response.data;
}

type UploadCategorySource = { typeField: string } | { defaultType: string };

function appendCategorySource(formData: FormData, categorySource: UploadCategorySource): void {
  if ("typeField" in categorySource) {
    formData.append("type_field", categorySource.typeField);
  } else {
    formData.append("default_type", categorySource.defaultType);
  }
}

export async function uploadPointDataset(
  name: string,
  file: File,
  categorySource: UploadCategorySource,
): Promise<PointDataset> {
  const formData = new FormData();
  formData.append("name", name);
  appendCategorySource(formData, categorySource);
  formData.append("file", file);
  const response = await apiClient.post<PointDataset>("/geodata/datasets/points/upload", formData);
  return response.data;
}

export async function uploadPolygonDataset(
  name: string,
  file: File,
  categorySource: UploadCategorySource,
): Promise<PolygonDataset> {
  const formData = new FormData();
  formData.append("name", name);
  appendCategorySource(formData, categorySource);
  formData.append("file", file);
  const response = await apiClient.post<PolygonDataset>("/geodata/datasets/polygons/upload", formData);
  return response.data;
}

export async function labelPointFeature(
  datasetId: string,
  featureId: string,
  body: LabelFeatureRequest,
): Promise<PointFeature> {
  const response = await apiClient.patch<PointFeature>(
    `/geodata/datasets/points/${datasetId}/features/${featureId}`,
    body,
  );
  return response.data;
}

export async function labelPolygonFeature(
  datasetId: string,
  featureId: string,
  body: LabelFeatureRequest,
): Promise<PolygonFeature> {
  const response = await apiClient.patch<PolygonFeature>(
    `/geodata/datasets/polygons/${datasetId}/features/${featureId}`,
    body,
  );
  return response.data;
}

export async function labelTrackPoint(
  trackId: string,
  pointId: string,
  body: LabelTrackPointRequest,
): Promise<TrackPoint> {
  const response = await apiClient.patch<TrackPoint>(`/geodata/datasets/tracks/${trackId}/features/${pointId}`, body);
  return response.data;
}

export async function bulkTagPointFeatures(datasetId: string, body: BulkTagRequest): Promise<PointFeature[]> {
  const response = await apiClient.post<PointFeature[]>(
    `/geodata/datasets/points/${datasetId}/features/tags`,
    body,
  );
  return response.data;
}

export async function bulkTagPolygonFeatures(datasetId: string, body: BulkTagRequest): Promise<PolygonFeature[]> {
  const response = await apiClient.post<PolygonFeature[]>(
    `/geodata/datasets/polygons/${datasetId}/features/tags`,
    body,
  );
  return response.data;
}

export async function bulkTagTrackPoints(trackId: string, body: BulkTagRequest): Promise<TrackPoint[]> {
  const response = await apiClient.post<TrackPoint[]>(`/geodata/datasets/tracks/${trackId}/features/tags`, body);
  return response.data;
}
