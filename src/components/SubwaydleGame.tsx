"use client";

import { KEYBOARD_ROWS, type LineId, type TileStatus, stationName } from "@/lib/subwayEngine";
import { useGame, isLineId, type GameStats } from "@/components/GameProvider";
import { LineBullet } from "@/components/LineBullet";
import { SolutionMap } from "@/components/SolutionMap";
import clsx from "clsx";
import { BarChart3, CircleHelp, Coffee, RefreshCw, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";

const tileClass: Record<TileStatus, string> = {
  empty: "border-[#3f4246] bg-transparent",
  exact: "border-[#538d4e] bg-[#538d4e] text-white",
  equivalent: "border-[#3c9af5] bg-[#3c9af5] text-white",
  present: "border-[#b59f3b] bg-[#b59f3b] text-white",
  absent: "border-[#3a3a3c] bg-[#3a3a3c] text-white",
};

const keyClass: Record<TileStatus, string> = {
  empty: "border-[#8d8f91] bg-[#8d8f91] hover:bg-[#9b9d9f]",
  exact: "border-[#538d4e] bg-[#538d4e]",
  equivalent: "border-[#3c9af5] bg-[#3c9af5]",
  present: "border-[#b59f3b] bg-[#b59f3b]",
  absent: "border-[#3a3a3c] bg-[#3a3a3c]",
};

const keyboardAliases: Record<string, LineId> = {
  I: "SI",
  S: "GS",
  K: "FS",
  H: "H",
};

const winPercent = (stats: GameStats) => (stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100));

function GuessTile({ line, status = "empty" }: { line?: LineId; status?: TileStatus }) {
  return (
    <div
      className={clsx(
        "flex h-[46px] w-[88px] items-center justify-center rounded-sm border-2 transition-colors sm:h-[46px] sm:w-[88px]",
        tileClass[status],
      )}
    >
      {line ? <LineBullet line={line} size="tile" muted={status === "absent"} /> : null}
    </div>
  );
}

function GuessGrid() {
  const { guesses, currentGuess } = useGame();
  const rows = Array.from({ length: 6 }, (_, rowIndex) => {
    const submitted = guesses[rowIndex];
    const isCurrent = rowIndex === guesses.length;

    return Array.from({ length: 3 }, (_, columnIndex) => ({
      line: submitted?.lines[columnIndex] ?? (isCurrent ? currentGuess[columnIndex] : undefined),
      status: submitted?.statuses[columnIndex] ?? "empty",
    }));
  });

  return (
    <div className="mx-auto grid w-[390px] max-w-full grid-rows-6 gap-2">
      {rows.map((row, rowIndex) => (
        <div className="grid grid-cols-3 justify-items-center gap-2" key={rowIndex}>
          {row.map((tile, columnIndex) => (
            <GuessTile key={`${rowIndex}-${columnIndex}`} line={tile.line} status={tile.status} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Keyboard() {
  const { addLine, deleteLine, submitGuess, keyboardStatus, gameStatus } = useGame();
  const disabled = gameStatus !== "playing";

  return (
    <div className="mx-auto mt-4 flex w-[464px] max-w-full flex-col gap-1.5">
      {KEYBOARD_ROWS.slice(0, 3).map((row) => (
        <div className="grid grid-cols-7 gap-1.5" key={row.join("-")}>
          {row.map((line) => {
            const status = keyboardStatus[line] ?? "empty";
            return (
              <button
                className={clsx(
                  "flex h-11 min-w-0 items-center justify-center rounded border px-1 transition disabled:cursor-not-allowed disabled:opacity-60",
                  keyClass[status],
                )}
                disabled={disabled}
                key={line}
                onClick={() => addLine(line)}
                title={`${line} train`}
                type="button"
              >
                <LineBullet line={line} size="sm" muted={status === "absent"} />
              </button>
            );
          })}
        </div>
      ))}
      <div className="grid grid-cols-6 gap-1.5">
        <button
          className="flex h-11 items-center justify-center rounded border border-[#8d8f91] bg-[#8d8f91] text-sm font-bold text-white transition hover:bg-[#9b9d9f] disabled:opacity-60"
          disabled={disabled}
          onClick={submitGuess}
          type="button"
        >
          Enter
        </button>
        {(["GS", "FS", "H", "SI"] as LineId[]).map((line) => {
          const status = keyboardStatus[line] ?? "empty";
          return (
            <button
              className={clsx(
                "flex h-11 items-center justify-center rounded border px-1 transition disabled:cursor-not-allowed disabled:opacity-60",
                keyClass[status],
              )}
              disabled={disabled}
              key={line}
              onClick={() => addLine(line)}
              title={`${line} train`}
              type="button"
            >
              <LineBullet line={line} size="sm" muted={status === "absent"} />
            </button>
          );
        })}
        <button
          className="flex h-11 items-center justify-center rounded border border-[#8d8f91] bg-[#8d8f91] text-sm font-bold text-white transition hover:bg-[#9b9d9f] disabled:opacity-60"
          disabled={disabled}
          onClick={deleteLine}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Toast() {
  const { toast, clearToast } = useGame();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(clearToast, 2200);
    return () => window.clearTimeout(timer);
  }, [clearToast, toast]);

  if (!toast) return null;

  return (
    <div className="fixed left-1/2 top-5 z-20 -translate-x-1/2 rounded bg-white px-4 py-2 text-sm font-black text-black shadow-2xl">
      {toast}
    </div>
  );
}

function CompletionModal() {
  const { gameStatus, puzzle, newPuzzle, stats } = useGame();
  const [closedPuzzleId, setClosedPuzzleId] = useState<string | null>(null);

  if (gameStatus === "playing") return null;
  if (closedPuzzleId === puzzle.id) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/75 px-2 py-4">
      <div className="w-full max-w-[760px] rounded bg-[#1b1d1f] p-5 text-white shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">
            {gameStatus === "won" ? "Yay! You completed this trip!" : "Aww, looks like you got lost on the subway..."}
          </h2>
          <button className="rounded p-1 text-white/75 hover:bg-white/10" onClick={() => setClosedPuzzleId(puzzle.id)} type="button" title="Close">
            <X size={22} />
          </button>
        </div>

        <SolutionMap puzzle={puzzle} />
        <div className="mt-5 flex justify-center">
          <a
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#64a7e8] px-4 py-2 text-sm font-bold text-white shadow transition hover:bg-[#75b7f7]"
            href="https://ko-fi.com/sunnyng"
            rel="noreferrer"
            target="_blank"
          >
            <Coffee size={18} />
            Support Sunny on Ko-fi
          </a>
        </div>
        <StatsSection stats={stats} compact />

        <div className="mt-5 flex justify-center">
          <button
            className="rounded bg-[#4fba00] px-5 py-2 text-sm font-bold text-white transition hover:brightness-110"
            onClick={newPuzzle}
            type="button"
          >
            Generate New Puzzle
          </button>
        </div>
      </div>
    </div>
  );
}

function StatsSection({ stats, compact = false }: { stats: GameStats; compact?: boolean }) {
  const maxDistribution = Math.max(...stats.guessDistribution, 1);

  return (
    <div className={clsx("text-white", compact ? "mt-6" : "mt-2")}>
      <h3 className="mb-3 text-lg font-bold">Statistics</h3>
      <div className="grid grid-cols-4 gap-3 text-center">
        <div>
          <p className="text-2xl font-bold">{stats.played}</p>
          <p className="text-xs font-bold uppercase leading-3">Played</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{winPercent(stats)}</p>
          <p className="text-xs font-bold uppercase leading-3">Win %</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{stats.currentStreak}</p>
          <p className="text-xs font-bold uppercase leading-3">Current Streak</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{stats.maxStreak}</p>
          <p className="text-xs font-bold uppercase leading-3">Max Streak</p>
        </div>
      </div>

      <h3 className="mb-2 mt-6 text-lg font-bold">Guess Distribution</h3>
      <div className="space-y-1">
        {stats.guessDistribution.map((count, index) => (
          <div className="grid grid-cols-[18px_1fr] items-center gap-2" key={index}>
            <span className="text-sm">{index + 1}</span>
            <div className="h-6 rounded bg-[#2f3133]">
              <div
                className="flex h-6 min-w-7 items-center justify-end rounded bg-[#4fba00] px-2 text-sm font-bold text-white transition-all"
                style={{ width: `${Math.max((count / maxDistribution) * 100, count > 0 ? 8 : 0)}%` }}
              >
                {count}
              </div>
            </div>
          </div>
        ))}
      </div>
      {stats.losses > 0 ? <p className="mt-3 text-xs font-bold text-white/65">Losses: {stats.losses}. A lost puzzle resets your streak.</p> : null}
    </div>
  );
}

function StatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { stats, resetStats } = useGame();
  const [confirmReset, setConfirmReset] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/70 px-3 py-3">
      <div className="max-h-[96vh] w-full max-w-[570px] overflow-y-auto rounded bg-[#1b1d1f] p-5 text-sm leading-5 text-white shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Stats</h2>
          <button className="rounded p-1 text-white/75 hover:bg-white/10" onClick={onClose} type="button" title="Close">
            <X size={22} />
          </button>
        </div>
        <StatsSection stats={stats} />
        <div className="mt-6 flex justify-center">
          {confirmReset ? (
            <div className="flex gap-2">
              <button
                className="rounded bg-[#b43a3a] px-4 py-2 text-sm font-bold text-white"
                onClick={() => {
                  resetStats();
                  setConfirmReset(false);
                }}
                type="button"
              >
                Confirm Reset
              </button>
              <button className="rounded bg-[#3a3a3c] px-4 py-2 text-sm font-bold text-white" onClick={() => setConfirmReset(false)} type="button">
                Cancel
              </button>
            </div>
          ) : (
            <button className="rounded bg-[#3a3a3c] px-4 py-2 text-sm font-bold text-white" onClick={() => setConfirmReset(true)} type="button">
              Reset Stats
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExampleRow({ tiles }: { tiles: { line: LineId; status?: TileStatus }[] }) {
  return (
    <div className="grid grid-cols-3 justify-items-center gap-7 py-2">
      {tiles.map((tile, index) => (
        <GuessTile key={`${tile.line}-${index}`} line={tile.line} status={tile.status ?? "empty"} />
      ))}
    </div>
  );
}

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/70 px-3 py-3">
      <div className="max-h-[96vh] w-full max-w-[570px] overflow-y-auto rounded bg-[#1b1d1f] p-5 text-sm leading-5 text-white shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">How to Play</h2>
          <button className="rounded p-1 text-white/75 hover:bg-white/10" onClick={onClose} type="button" title="Close">
            <X size={22} />
          </button>
        </div>

        <p className="mb-4">
          Guess the <strong>SUBWAYDLE</strong> in 6 tries.
        </p>
        <p className="mb-4">
          Each guess must be a <strong>valid subway trip involving 3 trains</strong> using available transfers between them.
        </p>
        <p className="mb-6">You need to guess a specific set of three trains that can make the trip.</p>

        <h3 className="mb-2 text-base font-bold">Examples</h3>
        <ExampleRow
          tiles={[
            { line: "A", status: "exact" },
            { line: "N" },
            { line: "7" },
          ]}
        />
        <p className="mb-4">
          The <LineBullet line="A" size="sm" /> train is in the correct spot of the trip.
        </p>

        <ExampleRow
          tiles={[
            { line: "GS" },
            { line: "1", status: "equivalent" },
            { line: "L" },
          ]}
        />
        <p className="mb-4">
          Another train that shares the same routing as the <LineBullet line="1" size="sm" /> train is in that spot of the trip.
        </p>

        <ExampleRow
          tiles={[
            { line: "J" },
            { line: "5", status: "present" },
            { line: "2" },
          ]}
        />
        <p className="mb-4">
          The <LineBullet line="5" size="sm" /> train is part of the trip, but in the wrong spot.
        </p>

        <ExampleRow
          tiles={[
            { line: "F" },
            { line: "3" },
            { line: "4", status: "absent" },
          ]}
        />
        <p className="mb-5">
          The <LineBullet line="4" size="sm" /> train is not part of the trip in any spot.
        </p>

        <p className="mb-3">
          <strong>Multiple routings may be possible</strong> to make the trip, but your goal is to find the one routing that matches the puzzle.
        </p>
        <p className="mb-3">
          <strong>No back tracking:</strong> No stations can be traveled through more than once.
        </p>
        <p className="mb-3">
          <strong>Transfers are only allowed if and when lines diverge.</strong> If two lines are making the same stops, you cannot switch back and forth between them.
        </p>
        <p className="mb-3">
          Transfers are allowed to/from St George via South Ferry, Whitehall St-South Ferry, or Bowling Green using the Staten Island Ferry. Free out-of-system transfers are included.
        </p>
        <p className="mb-3">
          Routing is based on midday service: no peak-direction express, no peak-only branches, and no Z.
        </p>
        <p className="font-bold">Keyboard tips: use I for SIR, S for 42 St shuttle, K for Franklin shuttle, and H for Rockaway shuttle.</p>
      </div>
    </div>
  );
}

function PuzzleHeader() {
  const { puzzle, newPuzzle } = useGame();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  return (
    <header className="mx-auto flex w-full max-w-[464px] flex-col gap-4">
      <HelpModal open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <StatsModal open={isStatsOpen} onClose={() => setIsStatsOpen(false)} />
      <div className="flex h-10 items-center justify-between">
        <h1 className="text-lg font-bold text-white">Subwaydle Unlimited</h1>
        <div className="flex items-center gap-2 text-[#d0d0d0]">
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[#d0d0d0] transition hover:bg-white/10"
            onClick={newPuzzle}
            title="Generate new puzzle"
            type="button"
          >
            <RefreshCw size={20} />
          </button>
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[#d0d0d0] transition hover:bg-white/10"
            onClick={() => setIsHelpOpen(true)}
            title="Help"
            type="button"
          >
            <CircleHelp size={22} />
          </button>
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[#d0d0d0] transition hover:bg-white/10"
            onClick={() => setIsStatsOpen(true)}
            title="Stats"
            type="button"
          >
            <BarChart3 size={23} />
          </button>
          <button className="inline-flex h-7 w-7 items-center justify-center rounded text-[#d0d0d0]" title="Settings" type="button">
            <Settings size={23} />
          </button>
        </div>
      </div>
      <p className="px-5 text-center text-sm font-bold leading-5 text-white">
        Travel from {stationName(puzzle.start)} to {stationName(puzzle.end)} using 2 transfers.
      </p>
    </header>
  );
}

function usePhysicalKeyboard() {
  const { addLine, deleteLine, submitGuess, gameStatus } = useGame();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (gameStatus !== "playing") return;
      if (event.key === "Enter") {
        event.preventDefault();
        submitGuess();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        deleteLine();
        return;
      }

      const value = event.key.toUpperCase();
      const aliasLine = keyboardAliases[value];
      if (aliasLine) {
        event.preventDefault();
        addLine(aliasLine);
        return;
      }

      if (isLineId(value)) {
        event.preventDefault();
        addLine(value);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addLine, deleteLine, gameStatus, submitGuess]);
}

export function SubwaydleGame() {
  usePhysicalKeyboard();

  return (
    <main className="min-h-screen bg-[#1b1d1f] px-3 pb-5 pt-2">
      <Toast />
      <div className="mx-auto flex max-w-[520px] flex-col gap-3">
        <PuzzleHeader />
        <section className="flex flex-col gap-3">
          <GuessGrid />
          <CompletionModal />
          <Keyboard />
        </section>
      </div>
    </main>
  );
}
