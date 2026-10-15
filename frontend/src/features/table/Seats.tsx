import type { CSSProperties } from "react";
import type { Player, Round } from "@shared/types";
import { Avatar, Chip } from "../../ui";
import { cx } from "../../ui/cx";
import { PlayingCard } from "./PlayingCard";
import { orderSeats, seatLabel, seatSlot, type SeatSlot } from "./seating";
import "./table.css";

export function Seats({ players, round, selfId }: { players: Player[]; round: Round; selfId: string | null }) {
  const ordered = orderSeats(players);
  return (
    <ul className="pp-seats" aria-label="Players">
      {ordered.map((player, index) => (
        <Seat key={player.id} player={player} round={round} index={index} isSelf={player.id === selfId} />
      ))}
    </ul>
  );
}

function Seat({ player, round, index, isSelf }: { player: Player; round: Round; index: number; isSelf: boolean }) {
  const slot = seatSlot(round, player.id);
  const stagger = { "--i": index } as CSSProperties;

  return (
    <li className={cx("pp-seat", !player.connected && "is-offline")}>
      <div className="pp-seat-slot">
        <SeatCard slot={slot} stagger={stagger} />
      </div>
      <span className="pp-table-sr">{seatLabel(slot)}</span>
      <div className="pp-seat-id">
        <Avatar name={player.name} size={28} />
        <span className="pp-seat-name" title={player.name}>
          {player.name}
          {isSelf && " (you)"}
        </span>
        {player.isHost && <Chip tone="dark">host</Chip>}
      </div>
    </li>
  );
}

function SeatCard({ slot, stagger }: { slot: SeatSlot; stagger: CSSProperties }) {
  switch (slot.kind) {
    case "empty":
      return <span className="pp-seat-empty" aria-hidden="true" />;
    case "thinking":
      return (
        <span className="pp-seat-empty pp-seat-thinking" aria-hidden="true">
          thinking
        </span>
      );
    case "missing":
      return (
        <span className="pp-seat-empty pp-seat-missing" aria-hidden="true">
          no vote
        </span>
      );
    case "hidden":
      return <PlayingCard value={null} className="is-dealing" style={stagger} />;
    case "value":
      return <PlayingCard value={slot.value} className="is-flipping" style={stagger} />;
  }
}
