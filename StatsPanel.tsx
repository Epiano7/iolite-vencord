/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildStore, showToast, Toasts, useState } from "@webpack/common";

export type StatCommand = "ban" | "kick" | "mute" | "warn";
export type StatCounts = Record<StatCommand, number>;

export interface IoliteStats {
    guilds: Record<string, StatCounts>;
    total: StatCounts;
}

interface StatsPanelProps { stats: IoliteStats; }

export const EMPTY_COUNTS: StatCounts = { warn: 0, mute: 0, kick: 0, ban: 0 };
export const EMPTY_STATS: IoliteStats = { total: { ...EMPTY_COUNTS }, guilds: {} };

function totalActions(counts: StatCounts) {
    return counts.warn + counts.mute + counts.kick + counts.ban;
}

export function StatsPanel({ stats }: StatsPanelProps) {
    const guildIds = Object.keys(stats.guilds);
    const [guildId, setGuildId] = useState("all");
    const counts = guildId === "all" ? stats.total : stats.guilds[guildId] ?? EMPTY_COUNTS;
    const scopeName = guildId === "all" ? "All servers" : GuildStore.getGuild(guildId)?.name ?? "Unknown server";

    const generateImage = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 630;
        const context = canvas.getContext("2d");
        if (!context) return;
        const gradient = context.createLinearGradient(0, 0, 1200, 630);
        gradient.addColorStop(0, "#111827");
        gradient.addColorStop(1, "#4338ca");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1200, 630);
        context.fillStyle = "rgba(255,255,255,.08)";
        context.fillRect(60, 180, 1080, 330);
        context.fillStyle = "#ffffff";
        context.font = "700 54px Arial";
        context.fillText("Iolite moderation stats", 60, 92);
        context.font = "32px Arial";
        context.fillStyle = "#c7d2fe";
        context.fillText(scopeName, 60, 142);
        const entries: Array<[string, number]> = [["WARNINGS", counts.warn], ["MUTES", counts.mute], ["KICKS", counts.kick], ["BANS", counts.ban]];
        entries.forEach(([label, value], index) => {
            const x = 95 + index * 270;
            context.fillStyle = "#ffffff";
            context.font = "700 72px Arial";
            context.fillText(String(value), x, 330);
            context.fillStyle = "#c7d2fe";
            context.font = "700 22px Arial";
            context.fillText(label, x, 378);
        });
        context.fillStyle = "#ffffff";
        context.font = "700 28px Arial";
        context.fillText(`${totalActions(counts)} total actions sent with Iolite`, 60, 570);
        const link = document.createElement("a");
        link.download = `iolite-stats-${guildId === "all" ? "all-servers" : guildId}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        showToast("Iolite stats image generated.", Toasts.Type.SUCCESS);
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Moderation stats</div>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 3 }}>Counts actions sent through Iolite from this device.</div>
        </div>
        <select value={guildId} onChange={event => setGuildId(event.currentTarget.value)} style={{ background: "var(--input-background)", border: "1px solid var(--input-border)", borderRadius: 5, color: "var(--text-normal)", minHeight: 36, padding: "6px 8px" }}>
            <option value="all">All servers</option>
            {guildIds.map(id => <option key={id} value={id}>{GuildStore.getGuild(id)?.name ?? id}</option>)}
        </select>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(4, minmax(70px, 1fr))" }}>
            {(["warn", "mute", "kick", "ban"] as const).map(command => <div key={command} style={{ background: "var(--background-secondary)", borderRadius: 7, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{counts[command]}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase" }}>{command}</div>
            </div>)}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{totalActions(counts)} total actions</div>
        <button onClick={generateImage} style={{ alignSelf: "flex-start", padding: "7px 12px" }} type="button">Generate share image</button>
    </div>;
}
