/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { User } from "@vencord/discord-types";
import { useState } from "@webpack/common";

export type QuickCommand = "ban" | "kick" | "mute" | "warn";
export type QuickDestination = "current" | "private";

export interface QuickPanelResult {
    destination: QuickDestination;
    duration: string;
    reason: string;
    review: boolean;
}

export interface QuickPanelPreset {
    destination: QuickDestination;
    duration: string;
    name: string;
    reason: string;
}

interface QuickPanelProps {
    command: QuickCommand;
    defaultDestination: QuickDestination;
    gradientColor1?: string;
    gradientColor2?: string;
    hasPrivateChannel: boolean;
    onClose(): void;
    onSubmit(result: QuickPanelResult): void;
    presets: QuickPanelPreset[];
    recentReasons: string[];
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

function hexLuminance(color: string): number {
    const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
        .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function QuickPanel({
    command,
    defaultDestination,
    gradientColor1,
    gradientColor2,
    hasPrivateChannel,
    onClose,
    onSubmit,
    presets,
    recentReasons,
    user
}: QuickPanelProps) {
    const [destination, setDestination] = useState<QuickDestination>(defaultDestination);
    const [duration, setDuration] = useState("");
    const [reason, setReason] = useState("");
    const [review, setReview] = useState(false);
    const customColors = [gradientColor1, gradientColor2].filter(Boolean) as string[];
    const isLight = customColors.length
        ? customColors.every(color => hexLuminance(color) > 0.45)
        : document.documentElement.classList.contains("theme-light")
            || document.body.classList.contains("theme-light");
    const palette = isLight ? lightPalette : darkPalette;
    const customBackground = gradientColor1
        ? gradientColor2
            ? `linear-gradient(135deg, ${gradientColor1}, ${gradientColor2})`
            : gradientColor1
        : palette.background;
    const panelStyle = {
        ...panelBaseStyle,
        border: `1px solid ${palette.border}`,
        background: customBackground,
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

    const supportsDuration = command !== "kick";
    const applyPreset = (preset: QuickPanelPreset) => {
        setDuration(preset.duration);
        setReason(preset.reason);
        if (preset.destination !== "private" || hasPrivateChannel) setDestination(preset.destination);
    };
    const containKeyboardEvent = (event: React.KeyboardEvent) => {
        event.stopPropagation();
        if (event.key === "Escape") onClose();
    };

    return (
        <form
            aria-label={`Iolite ${command} ${user.username}`}
            style={panelStyle}
            onKeyDown={containKeyboardEvent}
            onKeyDownCapture={event => event.stopPropagation()}
            onKeyUp={event => event.stopPropagation()}
            onKeyUpCapture={event => event.stopPropagation()}
            onKeyPress={event => event.stopPropagation()}
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

            {presets.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                    <div style={{ marginBottom: "6px", fontSize: "12px", fontWeight: 600 }}>Presets</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {presets.map((preset, index) => (
                            <button
                                key={`${preset.name}-${index}`}
                                type="button"
                                title={preset.reason || preset.duration || preset.name}
                                onClick={() => applyPreset(preset)}
                                style={{
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: "4px",
                                    padding: "6px 9px",
                                    background: palette.button,
                                    color: palette.text,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    fontSize: "12px",
                                    fontWeight: 600
                                }}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
                {recentReasons.length > 0 && (
                    <select
                        aria-label="Recent reasons"
                        defaultValue=""
                        onChange={event => {
                            if (event.currentTarget.value) setReason(event.currentTarget.value);
                            event.currentTarget.value = "";
                        }}
                        style={{ ...inputStyle, minHeight: "34px", marginBottom: "6px", padding: "6px 10px" }}
                    >
                        <option value="">Choose a recent reason…</option>
                        {recentReasons.map(savedReason => (
                            <option key={savedReason} value={savedReason}>{savedReason}</option>
                        ))}
                    </select>
                )}
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
