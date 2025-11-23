export interface CurrentVector {
  u: number; // Eastward component (m/s)
  v: number; // Northward component (m/s)
  speed: number; // Magnitude (m/s)
  direction: number; // Direction (degrees, 0 = North, 90 = East)
}

export interface DataSource {
  id: string;
  name: string;
  description: string;
  infoUrl: string;
  qualityDescription: string;
  getGrid: (
    bounds: [number, number, number, number],
    timestamp: number,
    resolution?: number
  ) => { position: [number, number]; vector: [number, number, number, number]; speed: number; color: [number, number, number] }[];
}

// Scheveningen approximate tidal parameters
const TIDE_PERIOD_MS = 12.42 * 3600 * 1000;
const MAX_CURRENT_SPEED = 1.5; // m/s (approx 3 knots)
const FLOOD_DIR_RAD = (45 * Math.PI) / 180;

const getColor = (speed: number): [number, number, number] => {
  // Color based on speed: Blue (slow) -> Purple -> Neon Magenta (fast)
  const intensity = Math.min(speed / MAX_CURRENT_SPEED, 1);
  let r, g, b;

  if (intensity < 0.5) {
    // Interpolate Blue -> Purple
    const t = intensity * 2;
    r = 30 + (88 - 30) * t;
    g = 58 + (28 - 58) * t;
    b = 138 + (135 - 138) * t;
  } else {
    // Interpolate Purple -> Magenta
    const t = (intensity - 0.5) * 2;
    r = 88 + (255 - 88) * t;
    g = 28 + (0 - 28) * t;
    b = 135 + (200 - 135) * t;
  }
  return [r, g, b];
};

const generateMockGrid = (
  bounds: [number, number, number, number],
  timestamp: number,
  resolution: number,
  phaseOffset: number = 0,
  speedMultiplier: number = 1,
  directionOffset: number = 0
) => {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const points = [];

  for (let lon = minLon; lon <= maxLon; lon += resolution) {
    for (let lat = minLat; lat <= maxLat; lat += resolution) {
      // Simple synthetic model
      const phase = ((timestamp % TIDE_PERIOD_MS) / TIDE_PERIOD_MS) + phaseOffset;
      const angle = phase * 2 * Math.PI;
      
      const currentSpeedSigned = Math.cos(angle) * MAX_CURRENT_SPEED * speedMultiplier;
      const speed = Math.abs(currentSpeedSigned);
      const flowDir = (currentSpeedSigned > 0 ? FLOOD_DIR_RAD : FLOOD_DIR_RAD + Math.PI) + directionOffset;
      
      const u = speed * Math.sin(flowDir);
      const v = speed * Math.cos(flowDir);
      
      let direction = (Math.atan2(u, v) * 180) / Math.PI;
      if (direction < 0) direction += 360;

      points.push({
        position: [lon, lat] as [number, number],
        vector: [u, v, 0, direction] as [number, number, number, number],
        speed,
        color: getColor(speed),
      });
    }
  }
  return points;
};

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'rws',
    name: 'RWS (Matroos)',
    description: 'Rijkswaterstaat Hydro Meteo Data',
    infoUrl: 'https://waterinfo.rws.nl/',
    qualityDescription: 'High-resolution measurement and model data from the Dutch Ministry of Infrastructure. Validated against local buoys. Best for coastal waters.',
    getGrid: (bounds, timestamp, resolution = 0.01) => 
      generateMockGrid(bounds, timestamp, resolution, 0, 1, 0)
  },
  {
    id: 'cmems',
    name: 'CMEMS (Copernicus)',
    description: 'Global Ocean Physics Analysis',
    infoUrl: 'https://marine.copernicus.eu/',
    qualityDescription: 'Global reanalysis and forecast data. Lower resolution than RWS but covers wider offshore areas. Good for general trend analysis.',
    getGrid: (bounds, timestamp, resolution = 0.01) => 
      generateMockGrid(bounds, timestamp, resolution, 0.25, 0.8, 0.1) // Slightly different phase, speed, and direction
  }
];

// Default export for backward compatibility if needed, but preferred to use DATA_SOURCES
export const getGridCurrents = DATA_SOURCES[0].getGrid;
