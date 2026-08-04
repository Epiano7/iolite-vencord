/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { User } from "@vencord/discord-types";
import { TextInput, useEffect, useState } from "@webpack/common";

export type QuickCommand = "ban" | "kick" | "mute" | "warn";
export type QuickDestination = "current" | "private";

export interface QuickPanelResult {
    destination: QuickDestination;
    duration: string;
    reason: string;
    review: boolean;
}

interface QuickPanelProps {
    command: QuickCommand;
    defaultDestination: QuickDestination;
    hasPrivateChannel: boolean;
    onClose(): void;
    onSubmit(result: QuickPanelResult): void;
    user: User;
}

const panelStyle = {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: 1002,
    width: "340px",
    padding: "16px",
    border: "1px solid var(--border-subtle)",
    borderRadius: "12px",
    background: "var(--background-floating)",
    boxShadow: "var(--shadow-high)",
    color: "var(--text-normal)"
} as const;

const rowStyle = {
    display: "flex",
    gap: "8px",
    marginTop: "12px"
} as const;

const buttonStyle = {
    flex: 1,
    minHeight: "34px",
    border: 0,
    borderRadius: "4px",
    padding: "6px 10px",
    cursor: "pointer",
    color: "var(--white-500)",
    fontWeight: 600
} as const;

export function QuickPanel({
    command,
    defaultDestination,
    hasPrivateChannel,
    onClose,
    onSubmit,
    user
}: QuickPanelProps) {
    const [destination, setDestination] = useState<QuickDestination>(defaultDestination);
    const [duration, setDuration] = useState("");
    const [reason, setReason] = useState("");
    const [review, setReview] = useState(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const supportsDuration = command !== "kick";

    return (
        <form
            aria-label={`Iolite ${command} ${user.username}`}
            style={panelStyle}
            onSubmit={event => {
                event.preventDefault();
                onSubmit({ destination, duration, reason, review });
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                    <div style={{ fontSize: "16px", fontWeight: 700 }}>
                        {command[0].toUpperCase() + command.slice(1)} {user.username}
                    </div>
                    <div style={{ marginTop: "2px", color: "var(--text-muted)", fontSize: "12px" }}>
                        Iolite · Sapphire
                    </div>
                </div>
                <button
                    aria-label="Close"
                    type="button"
                    onClick={onClose}
                    style={{ border: 0, background: "transparent", color: "var(--interactive-normal)", cursor: "pointer", fontSize: "22px" }}
                >
                    ×
                </button>
            </div>

            {supportsDuration && (
                <div style={{ marginTop: "14px" }}>
                    <div style={{ marginBottom: "6px", fontSize: "12px", fontWeight: 600 }}>Duration (optional)</div>
                    <TextInput value={duration} onChange={setDuration} placeholder="e.g. 1h, 7d" />
                </div>
            )}

            <div style={{ marginTop: "12px" }}>
                <div style={{ marginBottom: "6px", fontSize: "12px", fontWeight: 600 }}>Reason (optional)</div>
                <TextInput value={reason} onChange={setReason} placeholder="Moderation reason" autoFocus />
            </div>

            <div style={{ marginTop: "12px", fontSize: "12px", fontWeight: 600 }}>Destination</div>
            <div style={rowStyle}>
                <button
                    type="button"
                    style={{
                        ...buttonStyle,
                        background: destination === "current" ? "var(--brand-500)" : "var(--background-modifier-accent)"
                    }}
                    onClick={() => setDestination("current")}
                >
                    Current channel
                </button>
                <button
                    type="button"
                    disabled={!hasPrivateChannel}
                    style={{
                        ...buttonStyle,
                        cursor: hasPrivateChannel ? "pointer" : "not-allowed",
                        opacity: hasPrivateChannel ? 1 : 0.5,
                        background: destination === "private" ? "var(--brand-500)" : "var(--background-modifier-accent)"
                    }}
                    onClick={() => setDestination("private")}
                >
                    Private channel
                </button>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", cursor: "pointer", fontSize: "13px" }}>
                <input type="checkbox" checked={review} onChange={event => setReview(event.currentTarget.checked)} />
                Send for Sapphire review (-r)
            </label>

            <div style={rowStyle}>
                <button
                    type="button"
                    onClick={onClose}
                    style={{ ...buttonStyle, background: "var(--background-modifier-accent)" }}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    style={{
                        ...buttonStyle,
                        background: command === "ban" ? "var(--status-danger)" : "var(--brand-500)"
                    }}
                >
                    Send {command}
                </button>
            </div>
        </form>
    );
}
