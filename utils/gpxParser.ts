import { gpx } from '@mapbox/togeojson';
import { DOMParser } from '@xmldom/xmldom';

export interface TrackPoint {
  longitude: number;
  latitude: number;
  timestamp: number; // Unix timestamp in ms
  elevation?: number;
}

export interface RaceData {
  geojson: GeoJSON.FeatureCollection;
  trackPoints: TrackPoint[];
  startTime: number;
  endTime: number;
}

export const parseGPX = (gpxContent: string): RaceData => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxContent, 'text/xml');
  const geojson = gpx(xmlDoc);

  const trackPoints: TrackPoint[] = [];

  // Extract points and times from the first track
  const track = geojson.features.find((f: any) => f.geometry.type === 'LineString');

  if (track && track.geometry.type === 'LineString') {
    const coords = track.geometry.coordinates;
    const times = track.properties?.coordTimes || [];

    coords.forEach((coord: number[], index: number) => {
      const timeStr = times[index];
      if (timeStr) {
        trackPoints.push({
          longitude: coord[0],
          latitude: coord[1],
          elevation: coord[2] || 0,
          timestamp: new Date(timeStr).getTime(),
        });
      }
    });
  }

  const startTime = trackPoints.length > 0 ? trackPoints[0].timestamp : 0;
  const endTime = trackPoints.length > 0 ? trackPoints[trackPoints.length - 1].timestamp : 0;

  return {
    geojson,
    trackPoints,
    startTime,
    endTime,
  };
};
