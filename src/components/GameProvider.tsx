"use client";

import {
  LINE_IDS,
  type LineId,
  type Puzzle,
  type TileStatus,
  findRouteForLines,
  generateInitialPuzzle,
  generatePuzzle,
  isValidGuessCombo,
  isWinningScore,
  mergeKeyboardStatus,
  scoreGuess,
} from "@/lib/subwayEngine";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const MAX_ATTEMPTS = 6;
const STATS_KEY = "unlocked-subwaydle-stats";

type SubmittedGuess = {
  lines: LineId[];
  statuses: TileStatus[];
};

type GameStatus = "playing" | "won" | "lost";

export type GameStats = {
  played: number;
  wins: number;
  losses: number;
  currentStreak: number;
  maxStreak: number;
  guessDistribution: number[];
};

export type HintFlash = { position: number; line: LineId; status: TileStatus };

type GameContextValue = {
  puzzle: Puzzle;
  currentGuess: LineId[];
  guesses: SubmittedGuess[];
  keyboardStatus: Partial<Record<LineId, TileStatus>>;
  gameStatus: GameStatus;
  stats: GameStats;
  toast: string | null;
  hintFlash: HintFlash | null;
  addLine: (line: LineId) => void;
  deleteLine: () => void;
  submitGuess: () => void;
  newPuzzle: () => void;
  giveUp: () => void;
  getHint: () => void;
  resetStats: () => void;
  clearToast: () => void;
};

const GameContext = createContext<GameContextValue | null>(null);

const getFreshPuzzle = () => generatePuzzle();
const defaultStats = (): GameStats => ({
  played: 0,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: Array.from({ length: MAX_ATTEMPTS }, () => 0),
});

const loadStats = () => {
  if (typeof window === "undefined") return defaultStats();

  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return defaultStats();
    const parsed = JSON.parse(raw) as Partial<GameStats>;
    return {
      ...defaultStats(),
      ...parsed,
      guessDistribution: Array.from({ length: MAX_ATTEMPTS }, (_, index) => parsed.guessDistribution?.[index] ?? 0),
    };
  } catch {
    return defaultStats();
  }
};

const saveStats = (stats: GameStats) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
};

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPuzzle(generateInitialPuzzle());
    setLoading(false);
  }, []);
  const [currentGuess, setCurrentGuess] = useState<LineId[]>([]);
  const [guesses, setGuesses] = useState<SubmittedGuess[]>([]);
  const [keyboardStatus, setKeyboardStatus] = useState<Partial<Record<LineId, TileStatus>>>({});
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [stats, setStats] = useState<GameStats>(loadStats);
  const [toast, setToast] = useState<string | null>(null);
  const [hintFlash, setHintFlash] = useState<HintFlash | null>(null);

  const recordResult = useCallback((won: boolean, attemptsUsed: number) => {
    setStats((current) => {
      const nextDistribution = [...current.guessDistribution];
      if (won) {
        nextDistribution[attemptsUsed - 1] = (nextDistribution[attemptsUsed - 1] ?? 0) + 1;
      }

      const nextCurrentStreak = won ? current.currentStreak + 1 : 0;
      const next: GameStats = {
        played: current.played + 1,
        wins: current.wins + (won ? 1 : 0),
        losses: current.losses + (won ? 0 : 1),
        currentStreak: nextCurrentStreak,
        maxStreak: Math.max(current.maxStreak, nextCurrentStreak),
        guessDistribution: nextDistribution,
      };
      saveStats(next);
      return next;
    });
  }, []);

  const addLine = useCallback(
    (line: LineId) => {
      if (gameStatus !== "playing") return;
      setToast(null);
      setCurrentGuess((guess) => {
        if (guess.length >= 3) return guess;
        return [...guess, line];
      });
    },
    [gameStatus],
  );

  const deleteLine = useCallback(() => {
    if (gameStatus !== "playing") return;
    setCurrentGuess((guess) => guess.slice(0, -1));
  }, [gameStatus]);

  const submitGuess = useCallback(() => {
    if (gameStatus !== "playing") return;

    if (currentGuess.length !== 3) {
      setToast("Pick exactly three trains.");
      return;
    }

    if (!puzzle) return;

    if (!isValidGuessCombo(currentGuess)) {
      setToast("Invalid trip");
      return;
    }

    const route = findRouteForLines(puzzle.start, puzzle.end, currentGuess);
    const statuses = scoreGuess(currentGuess, route, puzzle);
    const nextGuesses = [...guesses, { lines: currentGuess, statuses }];
    setGuesses(nextGuesses);
    setKeyboardStatus((status) => mergeKeyboardStatus(status, currentGuess, statuses));
    setCurrentGuess([]);
    setToast(null);

    if (isWinningScore(statuses)) {
      recordResult(true, nextGuesses.length);
      setGameStatus("won");
    } else if (nextGuesses.length >= MAX_ATTEMPTS) {
      recordResult(false, nextGuesses.length);
      setGameStatus("lost");
    }
  }, [currentGuess, gameStatus, guesses, puzzle, recordResult]);

  const newPuzzle = useCallback(() => {
    if (guesses.length > 0 && gameStatus === "playing") {
      recordResult(false, MAX_ATTEMPTS);
    }
    setPuzzle(getFreshPuzzle());
    setCurrentGuess([]);
    setGuesses([]);
    setKeyboardStatus({});
    setGameStatus("playing");
    setToast(null);
    setHintFlash(null);
    hintUsedRef.current = false;
  }, [gameStatus, guesses.length, recordResult]);

  const giveUp = useCallback(() => {
    if (gameStatus !== "playing" || !puzzle) return;
    recordResult(false, MAX_ATTEMPTS);
    setGameStatus("lost");
    setToast(null);
  }, [gameStatus, puzzle, recordResult]);

  const hintUsedRef = useRef(false);

  const getHint = useCallback(() => {
    if (gameStatus !== "playing" || !puzzle || hintUsedRef.current) return;
    const solution = puzzle.solution;
    const foundPositions = new Set<number>();
    for (const guess of guesses) {
      guess.statuses.forEach((status, i) => {
        if (status === "exact" || status === "equivalent") foundPositions.add(i);
      });
    }
    const unfound = [0, 1, 2].filter((i) => !foundPositions.has(i));
    if (unfound.length === 0) return;
    const position = unfound[Math.floor(Math.random() * unfound.length)];
    const hintLine = solution[position];
    const statuses = scoreGuess([hintLine, hintLine, hintLine], null, puzzle);
    setHintFlash({ position, line: hintLine, status: statuses[position] });
    hintUsedRef.current = true;
    setTimeout(() => setHintFlash(null), 1500);
  }, [gameStatus, guesses, puzzle]);

  const clearToast = useCallback(() => setToast(null), []);

  const resetStats = useCallback(() => {
    const next = defaultStats();
    saveStats(next);
    setStats(next);
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      puzzle: puzzle as Puzzle,
      currentGuess,
      guesses,
      keyboardStatus,
      gameStatus,
      stats,
      toast,
      hintFlash,
      addLine,
      deleteLine,
      submitGuess,
      newPuzzle,
      giveUp,
      getHint,
      resetStats,
      clearToast,
    }),
    [
      addLine,
      clearToast,
      currentGuess,
      deleteLine,
      gameStatus,
      guesses,
      keyboardStatus,
      getHint,
      giveUp,
      hintFlash,
      newPuzzle,
      puzzle,
      resetStats,
      stats,
      submitGuess,
      toast,
    ],
  );

  if (loading || !puzzle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1b1d1f]">
        <p className="text-white text-lg">Loading...</p>
      </div>
    );
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used within GameProvider.");
  return context;
};

export const isLineId = (value: string): value is LineId => LINE_IDS.includes(value as LineId);
