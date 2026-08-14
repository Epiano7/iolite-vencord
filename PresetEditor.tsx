/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@webpack/common";

export type PresetCommand = "ban" | "kick" | "mute" | "warn";
export type PresetDestination = "current" | "private";

export interface IolitePreset {
    command: PresetCommand;
    destination: PresetDestination;
    duration: string;
    id: string;
    name: string;
    reason: string;
    review: boolean;
    shortcut: string;
}

interface PresetEditorProps {
    onChange(presets: IolitePreset[]): void;
    presets: IolitePreset[];
}

const controlStyle = {
    background: "var(--input-background, var(--background-primary))",
    border: "1px solid var(--input-border, var(--border-subtle))",
    borderRadius: 5,
    boxSizing: "border-box",
    color: "var(--text-normal)",
    minHeight: 36,
    padding: "7px 9px",
    width: "100%"
} as const;

export function PresetEditor({ onChange, presets }: PresetEditorProps) {
    const [local, setLocal] = useState<IolitePreset[]>(() => presets.map(preset => ({ ...preset })));

    const save = (next: IolitePreset[]) => {
        setLocal(next);
        onChange(next);
    };
    const update = (id: string, patch: Partial<IolitePreset>) => save(local.map(preset => preset.id === id ? { ...preset, ...patch } : preset));
    const move = (index: number, offset: number) => {
        const destination = index + offset;
        if (destination < 0 || destination >= local.length) return;
        const next = [...local];
        [next[index], next[destination]] = [next[destination], next[index]];
        save(next);
    };
    const add = () => save([...local, {
        command: "warn",
        destination: "current",
        duration: "",
        id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Preset ${local.length + 1}`,
        reason: "",
        review: false,
        shortcut: ""
    }]);

    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Punishment presets</div>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 3 }}>
                Open an Iolite punishment submenu in a member menu to run one of its presets immediately.
            </div>
        </div>
        {local.map((preset, index) => <div key={preset.id} style={{ background: "var(--background-secondary)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 6, marginBottom: 9 }}>
                <strong style={{ flex: 1 }}>{preset.name.trim() || "Unnamed preset"}</strong>
                <button disabled={index === 0} onClick={() => move(index, -1)} type="button">↑</button>
                <button disabled={index === local.length - 1} onClick={() => move(index, 1)} type="button">↓</button>
                <button onClick={() => save(local.filter(item => item.id !== preset.id))} type="button">Remove</button>
            </div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <label>Name<input style={controlStyle} value={preset.name} onChange={event => update(preset.id, { name: event.currentTarget.value })} /></label>
                <label>Action<select style={controlStyle} value={preset.command} onChange={event => update(preset.id, { command: event.currentTarget.value as PresetCommand })}>
                    <option value="warn">Warn</option><option value="mute">Mute</option><option value="kick">Kick</option><option value="ban">Ban</option>
                </select></label>
                <label>Duration<input style={controlStyle} placeholder="e.g. 10m, 7d" value={preset.duration} onChange={event => update(preset.id, { duration: event.currentTarget.value })} /></label>
                <label>Destination<select style={controlStyle} value={preset.destination} onChange={event => update(preset.id, { destination: event.currentTarget.value as PresetDestination })}>
                    <option value="current">Current channel</option><option value="private">Private channel</option>
                </select></label>
                <label>Keyboard shortcut<input style={controlStyle} placeholder="e.g. Ctrl+1" value={preset.shortcut} onChange={event => update(preset.id, { shortcut: event.currentTarget.value })} /></label>
                <label style={{ alignItems: "center", display: "flex", gap: 7, paddingTop: 20 }}><input checked={preset.review} onChange={event => update(preset.id, { review: event.currentTarget.checked })} type="checkbox" /> Sapphire review (-r)</label>
            </div>
            <label style={{ display: "block", marginTop: 8 }}>Reason<textarea style={{ ...controlStyle, minHeight: 62, resize: "vertical" }} value={preset.reason} onChange={event => update(preset.id, { reason: event.currentTarget.value })} /></label>
        </div>)}
        {local.length === 0 && <div style={{ color: "var(--text-muted)", padding: 12, textAlign: "center" }}>No presets yet.</div>}
        <button onClick={add} style={{ alignSelf: "flex-start", padding: "7px 12px" }} type="button">Add preset</button>
    </div>;
}
