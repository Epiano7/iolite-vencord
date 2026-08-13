/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@webpack/common";

export type MenuActionId = "ban" | "cases" | "kick" | "mute" | "recentMessages" | "userinfo" | "warn" | "warns";
export type MenuContext = "message" | "profile";

export interface MenuLayout {
    hidden: MenuActionId[];
    order: MenuActionId[];
}

export interface MenuLayouts {
    message: MenuLayout;
    profile: MenuLayout;
}

export const MENU_ACTIONS: ReadonlyArray<{ id: MenuActionId; label: string; }> = [
    { id: "warn", label: "Warn" },
    { id: "mute", label: "Mute" },
    { id: "kick", label: "Kick" },
    { id: "ban", label: "Ban" },
    { id: "warns", label: "View Warns" },
    { id: "recentMessages", label: "Recent Messages" },
    { id: "userinfo", label: "View User Info" },
    { id: "cases", label: "View Cases" }
] as const;

const ALL_ACTION_IDS = MENU_ACTIONS.map(action => action.id);

export const DEFAULT_MENU_LAYOUT: MenuLayout = {
    order: [...ALL_ACTION_IDS],
    hidden: []
};

export const DEFAULT_MENU_LAYOUTS: MenuLayouts = {
    profile: { order: [...ALL_ACTION_IDS], hidden: [] },
    message: { order: [...ALL_ACTION_IDS], hidden: [] }
};

export function normalizeMenuLayout(layout?: Partial<MenuLayout>): MenuLayout {
    const seen = new Set<MenuActionId>();
    const valid = (values?: MenuActionId[]) => (values ?? []).filter(id => {
        if (!ALL_ACTION_IDS.includes(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
    const order = valid(layout?.order);
    const hidden = valid(layout?.hidden);
    for (const id of ALL_ACTION_IDS) {
        if (!seen.has(id)) order.push(id);
    }
    return { order, hidden };
}

function actionLabel(id: MenuActionId): string {
    return MENU_ACTIONS.find(action => action.id === id)?.label ?? id;
}

interface ActionMenuEditorProps {
    layouts: MenuLayouts;
    onChange(context: MenuContext, layout: MenuLayout): void;
}

export function ActionMenuEditor({ layouts, onChange }: ActionMenuEditorProps) {
    const [context, setContext] = useState<MenuContext>("profile");
    const [draggedId, setDraggedId] = useState<MenuActionId | null>(null);
    const [localLayouts, setLocalLayouts] = useState<MenuLayouts>(() => ({
        profile: normalizeMenuLayout(layouts.profile),
        message: normalizeMenuLayout(layouts.message)
    }));
    const layout = localLayouts[context];

    const save = (next: MenuLayout) => {
        setLocalLayouts(current => ({ ...current, [context]: next }));
        onChange(context, next);
    };

    const move = (destination: keyof MenuLayout, index: number) => {
        if (!draggedId) return;
        const next = {
            order: layout.order.filter(id => id !== draggedId),
            hidden: layout.hidden.filter(id => id !== draggedId)
        };
        next[destination].splice(index, 0, draggedId);
        setDraggedId(null);
        save(next);
    };

    const reset = () => save({
        order: [...DEFAULT_MENU_LAYOUT.order],
        hidden: []
    });

    const tabStyle = (selected: boolean) => ({
        flex: 1,
        border: 0,
        borderRadius: 4,
        padding: "8px 12px",
        background: selected ? "var(--brand-500)" : "var(--background-modifier-accent)",
        color: selected ? "#fff" : "var(--text-normal)",
        cursor: "pointer",
        fontWeight: 600
    } as const);

    const renderZone = (key: keyof MenuLayout, title: string, hint: string) => (
        <div
            onDragOver={event => event.preventDefault()}
            onDrop={() => move(key, layout[key].length)}
            style={{
                flex: 1,
                minWidth: 220,
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                padding: 10,
                background: "var(--background-secondary)"
            }}
        >
            <div style={{ fontWeight: 700 }}>{title}</div>
            <div style={{ margin: "2px 0 8px", color: "var(--text-muted)", fontSize: 12 }}>{hint}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 44 }}>
                {layout[key].map((id, index) => (
                    <div
                        key={id}
                        draggable
                        onDragStart={() => setDraggedId(id)}
                        onDragEnd={() => setDraggedId(null)}
                        onDragOver={event => event.preventDefault()}
                        onDrop={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            move(key, index);
                        }}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 9,
                            minHeight: 36,
                            borderRadius: 5,
                            padding: "0 10px",
                            background: "var(--background-primary)",
                            color: id === "ban" ? "var(--status-danger)" : "var(--text-normal)",
                            cursor: "grab",
                            opacity: draggedId === id ? 0.45 : 1,
                            userSelect: "none"
                        }}
                    >
                        <span aria-hidden style={{ color: "var(--text-muted)", fontSize: 18 }}>⠿</span>
                        <span style={{ fontWeight: 600 }}>{actionLabel(id)}</span>
                    </div>
                ))}
                {layout[key].length === 0 && (
                    <div style={{ padding: 10, color: "var(--text-muted)", fontSize: 12 }}>Drop actions here</div>
                )}
            </div>
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Right-click menu layout</div>
                <div style={{ marginTop: 3, color: "var(--text-muted)", fontSize: 13 }}>
                    Drag actions to reorder them or move them into Hidden. Server Settings remains pinned to the profile menu.
                </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={tabStyle(context === "profile")} onClick={() => setContext("profile")}>Profile menu</button>
                <button type="button" style={tabStyle(context === "message")} onClick={() => setContext("message")}>Message menu</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {renderZone("order", "Visible actions", "Top to bottom in Discord")}
                {renderZone("hidden", "Hidden", "Not shown in this menu")}
            </div>
            <button
                type="button"
                onClick={reset}
                style={{
                    alignSelf: "flex-start",
                    border: 0,
                    borderRadius: 4,
                    padding: "7px 11px",
                    background: "var(--background-modifier-accent)",
                    color: "var(--text-normal)",
                    cursor: "pointer",
                    fontWeight: 600
                }}
            >
                Reset {context} menu
            </button>
        </div>
    );
}
