import routes from "@/data/subwaydleOriginal/routes.json";
import stations from "@/data/subwaydleOriginal/stations.json";
import shapes from "@/data/subwaydleOriginal/shapes.json";
import transfers from "@/data/subwaydleOriginal/transfers.json";
import answers from "@/data/subwaydleOriginal/weekday/answers.json";
import routings from "@/data/subwaydleOriginal/weekday/routings.json";
import solutions from "@/data/subwaydleOriginal/weekday/solutions.json";

export type LineId = keyof typeof routes;
export type StationId = keyof typeof stations & string;
export type TileStatus = "empty" | "exact" | "equivalent" | "present" | "absent";

export type LineMeta = {
  color: string;
  text: string;
  name: string;
  alternateName?: string | null;
};

export type Solution = {
  origin: StationId;
  first_transfer_arrival: StationId;
  first_transfer_departure: StationId;
  second_transfer_arrival: StationId;
  second_transfer_departure: StationId;
  destination: StationId;
};

export type RouteResult = {
  lines: LineId[];
  stations: StationId[];
  legs: StationId[][];
  transfers: { from: StationId; to: StationId; afterLine: LineId; beforeLine: LineId }[];
  solution: Solution;
};

export type Puzzle = {
  start: StationId;
  end: StationId;
  solution: LineId[];
  route: RouteResult;
  id: string;
};

type RoutingKey = keyof typeof routings;
type EdgeMap = Map<StationId, Map<StationId, Set<LineId>>>;
type SearchState = {
  station: StationId;
  visited: StationId[];
  legs: StationId[][];
  transfers: RouteResult["transfers"];
};

const MAX_ROUTE_STATES = 90000;
const MAX_GENERATION_ATTEMPTS = 250;
const EXACT_TRANSFER_COUNT = 2;

const typedRoutes = routes as Record<LineId, { id: string; name: string; color: string; text_color?: string | null; alternate_name?: string | null }>;
const typedStations = stations as Record<StationId, { name: string; longitude: number; latitude: number }>;
const typedRoutings = routings as Record<RoutingKey, StationId[]>;
const typedTransfers = transfers as Partial<Record<StationId, StationId[] | StationId>>;
const typedSolutions = solutions as Record<string, Solution>;
const typedAnswers = answers as LineId[][];
export const routeShapes = shapes as unknown as Record<string, [number, number][]>;

const buildTransferMap = () => {
  const map = new Map<StationId, Set<StationId>>();
  const add = (from: StationId, to: StationId) => {
    if (!map.has(from)) map.set(from, new Set([from]));
    if (!map.has(to)) map.set(to, new Set([to]));
    map.get(from)?.add(to);
    map.get(to)?.add(from);
  };

  Object.entries(typedTransfers).forEach(([from, linked]) => {
    const fromId = from as StationId;
    [linked].flat().filter(Boolean).forEach((to) => add(fromId, to as StationId));
  });

  Object.keys(typedStations).forEach((station) => {
    const id = station as StationId;
    if (!map.has(id)) map.set(id, new Set([id]));
  });

  return map;
};

const transferMap = buildTransferMap();

const routeKeysForLine = (line: LineId): RoutingKey[] => {
  if (line === "A") return ["A1", "A2"] as RoutingKey[];
  return typedRoutings[line as unknown as RoutingKey] ? ([line as unknown as RoutingKey] as RoutingKey[]) : [];
};

const canonicalLineForRouting = (routingKey: RoutingKey): LineId => {
  if (routingKey === "A1" || routingKey === "A2") return "A";
  return routingKey as unknown as LineId;
};

const buildEdges = () => {
  const edges: EdgeMap = new Map();
  const addEdge = (from: StationId, to: StationId, line: LineId) => {
    if (!edges.has(from)) edges.set(from, new Map());
    if (!edges.get(from)?.has(to)) edges.get(from)?.set(to, new Set());
    edges.get(from)?.get(to)?.add(line);
  };

  Object.entries(typedRoutings).forEach(([routingKey, stops]) => {
    const line = canonicalLineForRouting(routingKey as RoutingKey);
    for (let index = 0; index < stops.length - 1; index += 1) {
      addEdge(stops[index], stops[index + 1], line);
      addEdge(stops[index + 1], stops[index], line);
    }
  });

  return edges;
};

const edges = buildEdges();

export const LINE_IDS = Object.keys(typedRoutes) as LineId[];
export const KEYBOARD_ROWS: LineId[][] = [
  ["1", "2", "3", "4", "5", "6", "7"],
  ["A", "B", "C", "D", "E", "F", "G"],
  ["J", "L", "M", "N", "Q", "R", "W"],
  ["GS", "FS", "H", "SI"],
];

const statusRank: Record<TileStatus, number> = {
  empty: 0,
  absent: 1,
  present: 2,
  equivalent: 3,
  exact: 4,
};

const shuffle = <T,>(items: T[]) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const unique = <T,>(items: T[]) => [...new Set(items)];
const flattened = (lines: LineId[]) => lines.join("-");

const stationCluster = (station: StationId) => transferMap.get(station) ?? new Set([station]);
const clustersIntersect = (left: StationId, right: StationId) => {
  const rightCluster = stationCluster(right);
  return [...stationCluster(left)].some((station) => rightCluster.has(station));
};

const addStationOnce = (stationsList: StationId[], station: StationId) => {
  if (!stationsList.includes(station)) stationsList.push(station);
};

export const lineMeta = (line: LineId): LineMeta => {
  const route = typedRoutes[line];
  return {
    color: route.color,
    text: route.text_color ?? "#ffffff",
    name: route.name,
    alternateName: route.alternate_name,
  };
};

export const lineLabel = (line: LineId) => {
  if (line === "SI") return "SIR";
  if (line === "GS") return "S";
  if (line === "FS") return "S";
  if (line === "H") return "S";
  return typedRoutes[line].name;
};

export const lineSupLabel = (line: LineId) => {
  if (line === "GS") return "42";
  if (line === "FS") return "F";
  if (line === "H") return "R";
  return undefined;
};

export const stationName = (station: string) => typedStations[station as StationId]?.name ?? station;

export const stationCoord = (station: StationId) => {
  const stop = typedStations[station];
  return [stop.longitude, stop.latitude] as [number, number];
};

export const linesAtStation = (station: StationId) => {
  const lines = new Set<LineId>();
  edges.get(station)?.forEach((edgeLines) => edgeLines.forEach((line) => lines.add(line)));
  return [...lines];
};

const findIndexInCluster = (route: StationId[], station: StationId) =>
  [...stationCluster(station)].map((candidate) => route.indexOf(candidate)).find((index) => index > -1);

const subroutingForLine = (line: LineId, begin: StationId, end: StationId) => {
  for (const routingKey of routeKeysForLine(line)) {
    const route = typedRoutings[routingKey];
    const beginIndex = findIndexInCluster(route, begin);
    const endIndex = findIndexInCluster(route, end);
    if (beginIndex == null || endIndex == null) continue;

    const leg = beginIndex <= endIndex ? route.slice(beginIndex, endIndex + 1) : route.slice(endIndex, beginIndex + 1).reverse();
    if (leg.length > 0) return leg;
  }

  return null;
};

export const isValidGuessCombo = (lines: LineId[]) => {
  if (lines.length !== 3) return false;
  return Boolean(typedSolutions[flattened(lines)]);
};

const samePhysicalLeg = (guessLine: LineId, answerLine: LineId, begin: StationId, end: StationId) => {
  const guessLeg = subroutingForLine(guessLine, begin, end);
  const answerLeg = subroutingForLine(answerLine, begin, end);
  if (!guessLeg || !answerLeg) return false;

  const guessInner = guessLeg.slice(1);
  const answerInner = answerLeg.slice(1);
  if (guessInner.length === 0 || answerInner.length === 0) return false;

  const sameStopSet =
    guessInner.every((station) => answerInner.includes(station)) ||
    answerInner.every((station) => guessInner.includes(station));

  if (!sameStopSet) return false;
  return clustersIntersect(guessLeg[0], answerLeg[0]) || clustersIntersect(guessLeg[guessLeg.length - 1], answerLeg[answerLeg.length - 1]);
};

const reachableOnLine = (line: LineId, start: StationId, blocked: Set<StationId>) => {
  const queue = [{ station: start, path: [start] as StationId[] }];
  const results: { station: StationId; path: StationId[] }[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const state = queue.shift();
    if (!state) break;

    const key = `${state.station}|${state.path.join(">")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(state);

    edges.get(state.station)?.forEach((edgeLines, nextStation) => {
      if (!edgeLines.has(line)) return;
      if (state.path.includes(nextStation)) return;
      if (blocked.has(nextStation) && nextStation !== start) return;
      queue.push({ station: nextStation, path: [...state.path, nextStation] });
    });
  }

  return results;
};

const canTransfer = (fromLine: LineId, toLine: LineId, fromStation: StationId, toStation: StationId) => {
  if (fromLine === toLine) return false;
  if (clustersIntersect(fromStation, toStation)) return true;
  return false;
};

const transferTargets = (fromLine: LineId, toLine: LineId, station: StationId) => {
  return [...stationCluster(station)].filter((target) => {
    if (!linesAtStation(target).includes(toLine)) return false;
    return canTransfer(fromLine, toLine, station, target);
  });
};

const routeResultToSolution = (route: Pick<RouteResult, "legs">): Solution => ({
  origin: route.legs[0][0],
  first_transfer_arrival: route.legs[0][route.legs[0].length - 1],
  first_transfer_departure: route.legs[1][0],
  second_transfer_arrival: route.legs[1][route.legs[1].length - 1],
  second_transfer_departure: route.legs[2][0],
  destination: route.legs[2][route.legs[2].length - 1],
});

export const findRouteForLines = (start: StationId, end: StationId, lines: LineId[]): RouteResult | null => {
  if (lines.length !== 3 || new Set(lines).size !== 3) return null;

  const initialStations = [...stationCluster(start)].filter((station) => linesAtStation(station).includes(lines[0]));
  let states: SearchState[] = initialStations.map((station) => ({
    station,
    visited: station === start ? [start] : [start, station],
    legs: [],
    transfers: [],
  }));

  if (states.length === 0) return null;

  let exploredStates = 0;
  for (let slot = 0; slot < lines.length; slot += 1) {
    const activeLine = lines[slot];
    const nextLine = lines[slot + 1];
    const nextStates: SearchState[] = [];

    for (const state of states) {
      const blocked = new Set(state.visited.filter((station) => station !== state.station));
      for (const reachable of reachableOnLine(activeLine, state.station, blocked)) {
        exploredStates += 1;
        if (exploredStates > MAX_ROUTE_STATES) return null;
        if (reachable.path.length < 2) continue;

        const visitedAfterRide = [...state.visited];
        reachable.path.slice(1).forEach((station) => addStationOnce(visitedAfterRide, station));
        const legsAfterRide = [...state.legs, reachable.path];

        if (slot === lines.length - 1) {
          if (!clustersIntersect(reachable.station, end)) continue;
          const finalLegs = legsAfterRide.map((leg) => [...leg]);
          const finalVisited = [...visitedAfterRide];
          if (reachable.station !== end) {
            finalLegs[finalLegs.length - 1].push(end);
            addStationOnce(finalVisited, end);
          }

          if (finalLegs.length !== 3 || finalLegs.some((leg) => leg.length < 2)) continue;
          return {
            lines,
            stations: finalVisited,
            legs: finalLegs,
            transfers: state.transfers,
            solution: routeResultToSolution({ legs: finalLegs }),
          };
        }

        for (const targetStation of transferTargets(activeLine, nextLine, reachable.station)) {
          if (targetStation !== reachable.station && visitedAfterRide.includes(targetStation)) continue;

          nextStates.push({
            station: targetStation,
            visited:
              targetStation === reachable.station || visitedAfterRide.includes(targetStation)
                ? visitedAfterRide
                : [...visitedAfterRide, targetStation],
            legs: legsAfterRide,
            transfers: [
              ...state.transfers,
              {
                from: reachable.station,
                to: targetStation,
                afterLine: activeLine,
                beforeLine: nextLine,
              },
            ],
          });
        }
      }
    }

    states = nextStates;
  }

  return null;
};

const solutionRoute = (lines: LineId[], solution: Solution): RouteResult | null => {
  const legs = [
    subroutingForLine(lines[0], solution.origin, solution.first_transfer_arrival),
    subroutingForLine(lines[1], solution.first_transfer_departure, solution.second_transfer_arrival),
    subroutingForLine(lines[2], solution.second_transfer_departure, solution.destination),
  ];

  if (legs.some((leg) => !leg || leg.length < 2)) return null;

  const typedLegs = legs as StationId[][];
  return {
    lines,
    stations: unique(typedLegs.flat()),
    legs: typedLegs,
    transfers: [
      {
        from: solution.first_transfer_arrival,
        to: solution.first_transfer_departure,
        afterLine: lines[0],
        beforeLine: lines[1],
      },
      {
        from: solution.second_transfer_arrival,
        to: solution.second_transfer_departure,
        afterLine: lines[1],
        beforeLine: lines[2],
      },
    ],
    solution,
  };
};

const solvedPuzzleCandidates = () => {
  return typedAnswers
    .map((answer) => {
      const key = flattened(answer);
      const solution = typedSolutions[key];
      if (!solution) return null;
      const route = solutionRoute(answer, solution);
      if (!route) return null;
      return {
        start: solution.origin,
        end: solution.destination,
        solution: answer,
        route,
        id: `${key}-${solution.origin}-${solution.destination}`,
      } satisfies Puzzle;
    })
    .filter(Boolean) as Puzzle[];
};

const puzzleCandidates = solvedPuzzleCandidates();

export const generatePuzzle = (): Puzzle => {
  for (const candidate of shuffle(puzzleCandidates).slice(0, MAX_GENERATION_ATTEMPTS)) {
    const route = findRouteForLines(candidate.start, candidate.end, candidate.solution);
    if (route && route.transfers.length === EXACT_TRANSFER_COUNT) {
      return {
        ...candidate,
        route,
        id: `${candidate.id}-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      };
    }
  }

  const fallback = puzzleCandidates.find((candidate) => findRouteForLines(candidate.start, candidate.end, candidate.solution));
  if (!fallback) throw new Error("Unable to generate a valid Subwaydle route.");

  return {
    ...fallback,
    id: `${fallback.id}-${Date.now()}-fallback`,
  };
};

export const generateInitialPuzzle = (): Puzzle => {
  for (const candidate of shuffle(puzzleCandidates)) {
    const route = findRouteForLines(candidate.start, candidate.end, candidate.solution);
    if (route && route.transfers.length === EXACT_TRANSFER_COUNT) {
      return {
        ...candidate,
        route,
        id: `${candidate.id}-initial`,
      };
    }
  }

  throw new Error("Unable to load an initial Subwaydle route.");
};

const puzzleLegBounds = (puzzle: Puzzle, index: number) => {
  switch (index) {
    case 0:
      return [puzzle.route.solution.origin, puzzle.route.solution.first_transfer_arrival] as const;
    case 1:
      return [puzzle.route.solution.first_transfer_departure, puzzle.route.solution.second_transfer_arrival] as const;
    default:
      return [puzzle.route.solution.second_transfer_departure, puzzle.route.solution.destination] as const;
  }
};

export const scoreGuess = (guess: LineId[], _guessRoute: RouteResult | null, puzzle: Puzzle): TileStatus[] => {
  return guess.map((line, index) => {
    if (line === puzzle.solution[index]) return "exact";

    const [begin, end] = puzzleLegBounds(puzzle, index);
    if (samePhysicalLeg(line, puzzle.solution[index], begin, end)) {
      return "equivalent";
    }

    if (puzzle.solution.includes(line)) return "present";
    return "absent";
  });
};

export const mergeKeyboardStatus = (
  current: Partial<Record<LineId, TileStatus>>,
  lines: LineId[],
  statuses: TileStatus[],
) => {
  const next = { ...current };
  lines.forEach((line, index) => {
    const status = statuses[index];
    if (statusRank[status] > statusRank[next[line] ?? "empty"]) {
      next[line] = status;
    }
  });
  return next;
};

export const isWinningScore = (statuses: TileStatus[]) =>
  statuses.every((status) => status === "exact");

export const routeLineGeoJson = (line: LineId, begin: StationId, end: StationId) => {
  const beginCoord = stationCoord(begin);
  const endCoord = stationCoord(end);
  const shapeKeys = line === "A" ? ["A1", "A2"] : [line];
  for (const shapeKey of shapeKeys) {
    const shape = routeShapes[shapeKey];
    if (!shape) continue;
    const beginIndex = shape.findIndex((coord) => coord[0] === beginCoord[0] && coord[1] === beginCoord[1]);
    const endIndex = shape.findIndex((coord) => coord[0] === endCoord[0] && coord[1] === endCoord[1]);
    if (beginIndex < 0 || endIndex < 0) continue;
    return beginIndex <= endIndex ? shape.slice(beginIndex, endIndex + 1) : shape.slice(endIndex, beginIndex + 1).reverse();
  }

  return [beginCoord, endCoord];
};
