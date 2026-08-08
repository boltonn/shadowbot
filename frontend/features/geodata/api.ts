import { apiClient } from "@/lib/api-client";
import type {
  PaginatedPointDatasetsResponse,
  PaginatedTracksResponse,
  PointDataset,
  PointDatasetDetail,
  Track,
  TrackDetail,
} from "@/features/geodata/types";

export async function listTracks(): Promise<PaginatedTracksResponse> {
  const response = await apiClient.get<PaginatedTracksResponse>("/geodata/tracks");
  return response.data;
}

export async function getTrack(trackId: string): Promise<TrackDetail> {
  const response = await apiClient.get<TrackDetail>(`/geodata/tracks/${trackId}`);
  return response.data;
}

export async function uploadTrack(name: string, file: File): Promise<Track> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("file", file);
  // No explicit Content-Type: axios needs to set it itself so the multipart
  // boundary parameter is included, which FastAPI's parser requires.
  const response = await apiClient.post<Track>("/geodata/upload", formData);
  return response.data;
}

export async function listPointDatasets(): Promise<PaginatedPointDatasetsResponse> {
  const response = await apiClient.get<PaginatedPointDatasetsResponse>("/geodata/points");
  return response.data;
}

export async function getPointDataset(datasetId: string): Promise<PointDatasetDetail> {
  const response = await apiClient.get<PointDatasetDetail>(`/geodata/points/${datasetId}`);
  return response.data;
}

type UploadPointDatasetCategorySource = { typeField: string } | { defaultType: string };

export async function uploadPointDataset(
  name: string,
  file: File,
  categorySource: UploadPointDatasetCategorySource,
): Promise<PointDataset> {
  const formData = new FormData();
  formData.append("name", name);
  if ("typeField" in categorySource) {
    formData.append("type_field", categorySource.typeField);
  } else {
    formData.append("default_type", categorySource.defaultType);
  }
  formData.append("file", file);
  const response = await apiClient.post<PointDataset>("/geodata/points/upload", formData);
  return response.data;
}
