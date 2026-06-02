"use client";

import { GameProvider } from "@/components/GameProvider";
import { SubwaydleGame } from "@/components/SubwaydleGame";

export default function Home() {
  return (
    <GameProvider>
      <SubwaydleGame />
    </GameProvider>
  );
}
