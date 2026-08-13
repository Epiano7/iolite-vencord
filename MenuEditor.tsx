/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useRef, useState } from "@webpack/common";
import type { DragEvent as ReactDragEvent } from "react";

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
    const draggedIdRef = useRef<MenuActionId | null>(null);
    const dropHandledRef = useRef(false);
    const dropTargetRef = useRef<{ destination: keyof MenuLayout; index: number; } | null>(null);
    const [localLayouts, setLocalLayouts] = useState<MenuLayouts>(() => ({
        profile: normalizeMenuLayout(layouts.profile),
        message: normalizeMenuLayout(layouts.message)
    }));
    const layout = localLayouts[context];

    const save = (next: MenuLayout) => {
        setLocalLayouts(current => ({ ...current, [context]: next }));
        onChange(context, next);
    };

    const move = (id: MenuActionId, destination: keyof MenuLayout, index: number) => {
        const next = {
            order: layout.order.filter(actionId => actionId !== id),
            hidden: layout.hidden.filter(actionId => actionId !== id)
        };
        next[destination].splice(Math.min(index, next[destination].length), 0, id);
        setDraggedId(null);
        save(next);
    };

    const moveBy = (id: MenuActionId, destination: keyof MenuLayout, offset: number) => {
        const currentIndex = layout[destination].indexOf(id);
        move(id, destination, Math.max(0, Math.min(layout[destination].length - 1, currentIndex + offset)));
    };

    const rememberDropTarget = (event: ReactDragEvent, destination: keyof MenuLayout, index: number) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        dropTargetRef.current = { destination, index };
    };

    const finishDrop = (event: ReactDragEvent, destination: keyof MenuLayout, index: number) => {
        event.preventDefault();
        event.stopPropagation();
        const transferredId = event.dataTransfer.getData("application/x-iolite-action") as MenuActionId;
        const id = ALL_ACTION_IDS.includes(transferredId) ? transferredId : draggedIdRef.current;
        if (!id) return;
        dropHandledRef.current = true;
        move(id, destination, index);
    };

    const finishDrag = () => {
        if (!dropHandledRef.current && draggedIdRef.current && dropTargetRef.current) {
            const { destination, index } = dropTargetRef.current;
            move(draggedIdRef.current, destination, index);
        }
        draggedIdRef.current = null;
        dropTargetRef.current = null;
        dropHandledRef.current = false;
        setDraggedId(null);
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
            data-iolite-menu-zone={key}
            onDragOver={event => rememberDropTarget(event, key, layout[key].length)}
            onDrop={event => finishDrop(event, key, layout[key].length)}
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
                        data-iolite-menu-zone={key}
                        data-iolite-menu-index={index}
                        onDragStart={event => {
                            draggedIdRef.current = id;
                            dropTargetRef.current = null;
                            dropHandledRef.current = false;
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("application/x-iolite-action", id);
                            event.dataTransfer.setData("text/plain", id);
                            setDraggedId(id);
                        }}
                        onDragEnd={finishDrag}
                        onDragOver={event => rememberDropTarget(event, key, index)}
                        onDrop={event => finishDrop(event, key, index)}
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
                        <span style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
                            <button
                                aria-label={`Move ${actionLabel(id)} up`}
                                disabled={index === 0}
                                onClick={() => moveBy(id, key, -1)}
                                style={{ border: 0, background: "transparent", color: "inherit", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.3 : 0.8 }}
                                type="button"
                            >↑</button>
                            <button
                                aria-label={`Move ${actionLabel(id)} down`}
                                disabled={index === layout[key].length - 1}
                                onClick={() => moveBy(id, key, 1)}
                                style={{ border: 0, background: "transparent", color: "inherit", cursor: index === layout[key].length - 1 ? "default" : "pointer", opacity: index === layout[key].length - 1 ? 0.3 : 0.8 }}
                                type="button"
                            >↓</button>
                            <button
                                aria-label={`${key === "order" ? "Hide" : "Show"} ${actionLabel(id)}`}
                                onClick={() => move(id, key === "order" ? "hidden" : "order", key === "order" ? layout.hidden.length : layout.order.length)}
                                style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", opacity: 0.8 }}
                                type="button"
                            >{key === "order" ? "×" : "+"}</button>
                        </span>
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
