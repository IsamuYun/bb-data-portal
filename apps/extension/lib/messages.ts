import type { ExecContext, RecipeStep, SegmentResult } from "@bb/shared";

/** background → content script */
export type RunSegmentMessage = { type: "bb:run"; steps: RecipeStep[]; ctx: ExecContext; fetchMedia: boolean };
/** popup/options → background */
export type ControlMessage = { type: "bb:tick" } | { type: "bb:pause"; paused: boolean } | { type: "bb:state" };
export type SegmentReply = SegmentResult;
