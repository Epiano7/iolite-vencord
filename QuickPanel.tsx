/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { User } from "@vencord/discord-types";
import { useEffect, useState } from "@webpack/common";

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

const darkPalette = {
    background: "#111214",
    border: "#2e3035",
    button: "#2b2d31",
    input: "#1e1f22",
    muted: "#b5bac1",
    text: "#f2f3f5"
} as const;

const lightPalette = {
    background: "#ffffff",
    border: "#d8d9dc",
    button: "#e3e5e8",
    input: "#f2f3f5",
    muted: "#5c5e66",
    text: "#313338"
} as const;

const panelBaseStyle = {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: 2147483647,
    width: "340px",
    boxSizing: "border-box",
    padding: "16px",
    borderRadius: "12px",
    fontFamily: "gg sans, Noto Sans, Helvetica Neue, Helvetica, Arial, sans-serif",
    fontSize: "14px",
    lineHeight: 1.3,
    isolation: "isolate"
} as const;

const rowStyle = {
    display: "flex",
    gap: "8px",
    marginTop: "12px"
} as const;

const buttonBaseStyle = {
    flex: 1,
    minHeight: "34px",
    border: 0,
    borderRadius: "4px",
    padding: "6px 10px",
    cursor: "pointer",
    color: "#ffffff",
    fontFamily: "inherit",
    fontSize: "14px",
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
    const isLight = document.documentElement.classList.contains("theme-light")
        || document.body.classList.contains("theme-light");
    const palette = isLight ? lightPalette : darkPalette;
    const panelStyle = {
        ...panelBaseStyle,
        border: `1px solid ${palette.border}`,
        backgroundColor: palette.background,
        boxShadow: isLight
            ? "0 8px 32px rgba(0, 0, 0, 0.24)"
            : "0 8px 32px rgba(0, 0, 0, 0.72)",
        color: palette.text,
        colorScheme: isLight ? "light" : "dark"
    } as const;
    const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        minHeight: "40px",
        border: `1px solid ${palette.border}`,
        borderRadius: "4px",
        outline: 0,
        padding: "10px 12px",
        backgroundColor: palette.input,
        color: palette.text,
        caretColor: palette.text,
        fontFamily: "inherit",
        fontSize: "14px"
    } as const;

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
                    <div style={{ marginTop: "2px", color: palette.muted, fontSize: "12px" }}>
                        Iolite · Sapphire
                    </div>
                </div>
                <button
                    aria-label="Close"
                    type="button"
                    onClick={onClose}
                    style={{ border: 0, background: "transparent", color: palette.muted, cursor: "pointer", fontSize: "22px" }}
                >
                    ×
                </button>
            </div>

            {supportsDuration && (
                <div style={{ marginTop: "14px" }}>
                    <div style={{ marginBottom: "6px", fontSize: "12px", fontWeight: 600 }}>Duration (optional)</div>
                    <input
                        value={duration}
                        onChange={event => setDuration(event.currentTarget.value)}
                        placeholder="e.g. 1h, 7d"
                        style={inputStyle}
                    />
                </div>
            )}

            <div style={{ marginTop: "12px" }}>
                <div style={{ marginBottom: "6px", fontSize: "12px", fontWeight: 600 }}>Reason (optional)</div>
                <input
                    value={reason}
                    onChange={event => setReason(event.currentTarget.value)}
                    placeholder="Moderation reason"
                    style={inputStyle}
                    autoFocus
                />
            </div>

            <div style={{ marginTop: "12px", fontSize: "12px", fontWeight: 600 }}>Destination</div>
            <div style={rowStyle}>
                <button
                    type="button"
                    style={{
                        ...buttonBaseStyle,
                        background: destination === "current" ? "#5865f2" : palette.button,
                        color: destination === "current" ? "#ffffff" : palette.text
                    }}
                    onClick={() => setDestination("current")}
                >
                    Current channel
                </button>
                <button
                    type="button"
                    disabled={!hasPrivateChannel}
                    style={{
                        ...buttonBaseStyle,
                        cursor: hasPrivateChannel ? "pointer" : "not-allowed",
                        opacity: hasPrivateChannel ? 1 : 0.5,
                        background: destination === "private" ? "#5865f2" : palette.button,
                        color: destination === "private" ? "#ffffff" : palette.text
                    }}
                    onClick={() => setDestination("private")}
                >
                    Private channel
                </button>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", cursor: "pointer", fontSize: "13px" }}>
                <input
                    type="checkbox"
                    checked={review}
                    onChange={event => setReview(event.currentTarget.checked)}
                    style={{ accentColor: "#5865f2" }}
                />
                Send for Sapphire review (-r)
            </label>

            <div style={rowStyle}>
                <button
                    type="button"
                    onClick={onClose}
                    style={{ ...buttonBaseStyle, background: palette.button, color: palette.text }}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    style={{
                        ...buttonBaseStyle,
                        background: command === "ban" ? "#da373c" : "#5865f2"
                    }}
                >
                    Send {command}
                </button>
            </div>
        </form>
    );
}
