import type { CSSProperties } from "react";
import type { Player, Round } from "@shared/types";
import { Avatar, Chip } from "../../ui";
import { cx } from "../../ui/cx";
import { PlayingCard } from "./PlayingCard";
import { orderSeats, seatLabel, seatSlot, type SeatSlot } from "./seating";
import "./table.css";

export function Seats({
  players,
  round,
  selfId,
  animate = false,
}: {
  players: Player[];
  round: Round;
  selfId: string | null;
  animate?: boolean;
}) {
  const ordered = orderSeats(players);
  return (
    <ul className="pp-seats" aria-label="Players">
      {ordered.map((player, index) => (
        <Seat
          key={player.id}
          player={player}
          round={round}
          index={index}
          isSelf={player.id === selfId}
          animate={animate}
        />
      ))}
    </ul>
  );
}

function Seat({
  player,
  round,
  index,
  isSelf,
  animate,
}: {
  player: Player;
  round: Round;
  index: number;
  isSelf: boolean;
  animate: boolean;
}) {
  const slot = seatSlot(round, player.id);
  const stagger = { "--i": index } as CSSProperties;

  return (
    <li className={cx("pp-seat", !player.connected && "is-offline")}>
      <div className="pp-seat-slot">
        <SeatCard slot={slot} stagger={stagger} animate={animate} />
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

function SeatCard({ slot, stagger, animate }: { slot: SeatSlot; stagger: CSSProperties; animate: boolean }) {
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
      return (
        <PlayingCard
          value={slot.value}
          className={animate ? "is-flipping" : "is-revealed"}
          style={stagger}
        />
      );
  }
}
