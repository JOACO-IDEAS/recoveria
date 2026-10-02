export type FounderShellView = "LOADING" | "LOGIN" | "WORKSPACE";
export function founderShellView(session: undefined | null | object): FounderShellView { return session === undefined ? "LOADING" : session === null ? "LOGIN" : "WORKSPACE"; }
