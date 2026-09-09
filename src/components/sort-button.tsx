"use client";
import type { Direction } from "@/lib/demo/list-controls";
export function SortButton({label,active,direction,onClick}:{label:string;active:boolean;direction:Direction;onClick:()=>void}){const state=direction==="asc"?"ascendente":"descendente";return <button className="sort-button" onClick={onClick} aria-pressed={active} aria-label={active?`Ordenar por ${label}, orden ${state}`:`Ordenar por ${label}`}>{label}<span aria-hidden>{active?(direction==="asc"?"↑":"↓"):"↕"}</span></button>}
