'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Map, { NavigationControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { DeckGL, PathLayer, ScatterplotLayer, IconLayer, WebMercatorViewport, FlyToInterpolator } from 'deck.gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { parseGPX, RaceData } from '../utils/gpxParser';
import { DATA_SOURCES } from '../services/currents';
import { generateGrid } from '../utils/gridGenerator';
import { format } from 'date-fns';

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
  transitionInterpolator?: any;
}

const INITIAL_VIEW_STATE: ViewState = {
  longitude: 4.27,
  latitude: 52.11,
  zoom: 11,
  pitch: 0,
  bearing: 0
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function RaceMap() {
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(100); // 100x real time
  const [activeSourceId, setActiveSourceId] = useState(DATA_SOURCES[0].id);
  const [infoPopupSourceId, setInfoPopupSourceId] = useState<string | null>(null);

  const [viewState, setViewState] = useState<ViewState>(INITIAL_VIEW_STATE);

  useEffect(() => {
    // Fetch and parse GPX
    fetch('/assets/race.gpx')
      .then((res) => res.text())
      .then((text) => {
        const data = parseGPX(text);
        setRaceData(data);
        setCurrentTime(data.startTime);

        // Calculate bounds
        const lons = data.trackPoints.map(p => p.longitude);
        const lats = data.trackPoints.map(p => p.latitude);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);

        // Fit bounds
        const viewport = new WebMercatorViewport({ width: window.innerWidth, height: window.innerHeight });
        const { longitude, latitude, zoom } = viewport.fitBounds(
          [[minLon, minLat], [maxLon, maxLat]],
          { padding: 50 }
        );

        setViewState({
          ...INITIAL_VIEW_STATE,
          longitude,
          latitude,
          zoom,
          transitionDuration: 1000,
          transitionInterpolator: new FlyToInterpolator()
        });
      })
      .catch((err) => console.error('Error loading GPX:', err));
  }, []);

  useEffect(() => {
    let animationFrame: number;
    if (isPlaying && raceData) {
      const animate = () => {
        setCurrentTime((prev) => {
          const next = prev + 1000 * playbackSpeed * (1/60); // Advance time based on speed (assuming 60fps)
          if (next > raceData.endTime) {
            setIsPlaying(false);
            return raceData.endTime;
          }
          return next;
        });
        animationFrame = requestAnimationFrame(animate);
      };
      animationFrame = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, raceData, playbackSpeed]);

  const layers = useMemo(() => {
    if (!raceData) return [];

    // 1. GPX Track Layer
    const trackLayer = new PathLayer({
      id: 'track-layer',
      data: raceData.geojson.features.filter((f: any) => f.geometry.type === 'LineString'),
      getPath: (d: any) => d.geometry.coordinates,
      getColor: [255, 255, 255],
      getWidth: 3,
      widthMinPixels: 2,
    });

    // 2. Current Position Marker
    // Find the point closest to currentTime
    const currentPointIndex = raceData.trackPoints.findIndex(p => p.timestamp >= currentTime);
    const currentPoint = currentPointIndex >= 0 ? raceData.trackPoints[currentPointIndex] : raceData.trackPoints[raceData.trackPoints.length - 1];
    
    const markerLayer = currentPoint ? new ScatterplotLayer({
      id: 'marker-layer',
      data: [currentPoint],
      getPosition: (d: any) => [d.longitude, d.latitude],
      getRadius: 20, // meters
      radiusMinPixels: 5,
      getFillColor: [0, 240, 255], // Neon Cyan #00F0FF
      stroked: true,
      getLineColor: [255, 255, 255],
      getLineWidth: 2,
    }) : null;

    // 3. Currents Layer (Vector Field)
    // Calculate bounds from race data with some padding
    const lons = raceData.trackPoints.map(p => p.longitude);
    const lats = raceData.trackPoints.map(p => p.latitude);
    const minLon = Math.min(...lons) - 0.02;
    const maxLon = Math.max(...lons) + 0.02;
    const minLat = Math.min(...lats) - 0.02;
    const maxLat = Math.max(...lats) + 0.02;

    // Generate grid of currents with high resolution (0.002 deg ~= 0.12 nm)
    const activeSource = DATA_SOURCES.find(s => s.id === activeSourceId) || DATA_SOURCES[0];
    const currents = activeSource.getGrid([minLon, minLat, maxLon, maxLat], currentTime, 0.002);
    
    const currentsLayer = new IconLayer({
      id: 'currents-layer',
      data: currents,
      getPosition: (d: any) => d.position,
      getIcon: () => ({
        url: 'data:image/svg+xml;charset=utf-8,%3Csvg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M50 0 L100 100 L50 80 L0 100 Z" fill="white" /%3E%3C/svg%3E',
        width: 96,
        height: 96,
        mask: true
      }),
      getSize: (d: any) => 10 + (d.speed * 15), // Min size 10, scales with speed
      getAngle: (d: any) => -d.vector[3], // DeckGL rotates counter-clockwise, our direction is clockwise from North.
      getColor: (d: any) => d.color,
      updateTriggers: {
        getPosition: [activeSourceId, currentTime],
        getAngle: [activeSourceId, currentTime],
        getSize: [activeSourceId, currentTime],
        getColor: [activeSourceId, currentTime]
      }
    });

    // Arrow heads for currents?
    // Let's stick to lines for MVP, maybe color coded.

    // 4. Grid Layer
    // Use slightly larger bounds than the currents to cover the view
    const gridLines = generateGrid([3.8, 51.8, 4.7, 52.4], 0.1);
    
    const gridLayer = new PathLayer({
      id: 'grid-layer',
      data: gridLines,
      getPath: (d: any) => d.path,
      getColor: [255, 255, 255, 30], // Very faint white/gray
      getWidth: 1,
      widthMinPixels: 0.5,
    });

    return [gridLayer, trackLayer, currentsLayer, markerLayer].filter(Boolean);
  }, [raceData, currentTime, activeSourceId]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(Number(e.target.value));
  };

  if (!raceData) return <div className="text-white">Loading Race Data...</div>;

  return (
    <div className="relative w-full h-screen">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState }: any) => setViewState(viewState)}
        controller={true}
        layers={layers}
        style={{ width: '100%', height: '100%' }}
      >
        <Map
          mapLib={maplibregl}
          mapStyle={MAP_STYLE}
          attributionControl={false}
        >
          <NavigationControl position="bottom-right" />
        </Map>
      </DeckGL>

      {/* Logo */}
      <div className="fixed z-50 pointer-events-none select-none" style={{ top: '.5rem', left: '.5rem' }}>
        <h1 className="text-4xl font-bold tracking-tighter text-white mb-1" style={{ textShadow: '0 0 10px rgba(255, 255, 255, 0.5)' }}>
          DRFT<span className="text-[var(--neon-cyan)]">~</span>
        </h1>
        <div className="text-[10px] text-gray-400 mt-1 tracking-widest uppercase">
          Sea Currents Analysis
        </div>
      </div>

      {/* Data Source Selector - Top Right */}
      <div className="fixed z-50" style={{ top: '.5rem', right: '.5rem' }}>
        <div className="bg-black border border-white/20 p-3 shadow-lg flex flex-col gap-2">
          <h3 className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Data Source</h3>
          {DATA_SOURCES.map((source) => (
            <div key={source.id} className="flex items-center gap-2">
              <button
                onClick={() => setActiveSourceId(source.id)}
                className={`flex-1 text-xs font-mono text-left px-2 py-1 border transition-colors ${
                  activeSourceId === source.id
                    ? 'border-[var(--neon-cyan)] text-[var(--neon-cyan)] bg-[var(--neon-cyan)]/10'
                    : 'border-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                {source.name}
              </button>
              <button
                onClick={() => setInfoPopupSourceId(source.id)}
                className="w-6 h-6 flex items-center justify-center border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 rounded-full text-xs font-mono"
                title="Source Info"
              >
                i
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Info Popup */}
      {infoPopupSourceId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setInfoPopupSourceId(null)}>
          <div className="bg-black border border-[var(--neon-cyan)] p-6 max-w-md w-full mx-4 shadow-[0_0_50px_rgba(0,240,255,0.2)]" onClick={e => e.stopPropagation()}>
            {(() => {
              const source = DATA_SOURCES.find(s => s.id === infoPopupSourceId);
              if (!source) return null;
              return (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold text-white">{source.name}</h2>
                    <button onClick={() => setInfoPopupSourceId(null)} className="text-gray-500 hover:text-white">✕</button>
                  </div>
                  <div className="space-y-4 text-sm text-gray-300">
                    <div>
                      <h4 className="text-[10px] uppercase text-gray-500 tracking-wider mb-1">Description</h4>
                      <p>{source.description}</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] uppercase text-gray-500 tracking-wider mb-1">Data Quality</h4>
                      <p>{source.qualityDescription}</p>
                    </div>
                    <div className="pt-2">
                      <a 
                        href={source.infoUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[var(--neon-cyan)] hover:underline flex items-center gap-1"
                      >
                        Visit Source Website <span>↗</span>
                      </a>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Timeline Control - Bottom Center */}
      <div className="fixed left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4" style={{ bottom: '.5rem' }}>
        <div className="bg-black border border-white/20 p-4 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
          {/* Header Info */}
          <div className="flex justify-between items-end mb-4 border-b border-gray-800 pb-2">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Mission Time</div>
              <div className="text-xl font-mono text-[var(--neon-cyan)]">
                {format(currentTime, 'HH:mm:ss')}
                <span className="text-xs text-gray-500 ml-2">{format(currentTime, 'yyyy-MM-dd')}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 uppercase">Speed</span>
                <span className="text-xs font-mono w-8 text-right">{playbackSpeed}x</span>
                <input
                  type="range"
                  min="10"
                  max="500"
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="w-24 h-1 bg-gray-800 rounded-none appearance-none cursor-pointer accent-[var(--neon-cyan)]"
                />
              </div>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-6 py-1 bg-[var(--neon-cyan)] text-black text-xs font-bold uppercase hover:bg-white transition-colors"
              >
                {isPlaying ? 'PAUSE' : 'PLAY'}
              </button>
            </div>
          </div>
          
          {/* Timeline Slider */}
          <div className="relative w-full h-6 flex items-center">
            <input
              type="range"
              min={raceData.startTime}
              max={raceData.endTime}
              value={currentTime}
              onChange={handleSliderChange}
              className="w-full h-1 bg-gray-800 rounded-none appearance-none cursor-pointer accent-[var(--neon-cyan)] z-10 relative"
            />
            {/* Ticks/Grid decoration could go here */}
            <div className="absolute top-1/2 left-0 w-full h-px bg-gray-800 -z-0"></div>
          </div>
        </div>
      </div>

      {/* Legend - Bottom Right */}
      <div className="fixed z-50" style={{ bottom: '.5rem', right: '3.5rem' }}>
        <div className="bg-black border border-white/20 p-3 shadow-lg">
          <h3 className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Current Speed (m/s)</h3>
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-gradient-to-r from-blue-900 via-purple-900 to-[var(--neon-magenta)]"></div>
          </div>
          <div className="flex justify-between text-[10px] font-mono text-gray-400 mt-1">
            <span>0.0</span>
            <span>0.75</span>
            <span>1.5+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
