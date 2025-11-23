export interface GridLine {
  path: [number, number][];
}

export const generateGrid = (
  bounds: [number, number, number, number], // [minLon, minLat, maxLon, maxLat]
  spacingNm: number = 0.1
): GridLine[] => {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const lines: GridLine[] = [];

  // 1 degree latitude ~= 60 nm
  const latSpacing = spacingNm / 60;
  
  // Longitude spacing depends on latitude. We use the center latitude for approximation.
  const centerLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonSpacing = spacingNm / (60 * Math.cos(centerLatRad));

  // Generate Latitude lines (Horizontal)
  for (let lat = minLat; lat <= maxLat; lat += latSpacing) {
    lines.push({
      path: [[minLon, lat], [maxLon, lat]]
    });
  }

  // Generate Longitude lines (Vertical)
  for (let lon = minLon; lon <= maxLon; lon += lonSpacing) {
    lines.push({
      path: [[lon, minLat], [lon, maxLat]]
    });
  }

  return lines;
};
