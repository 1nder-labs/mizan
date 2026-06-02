import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

const STORAGE_KEY = "mizan:chat:width";
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 360;
const MAX_WIDTH = 760;
const STEP = 16;
const STEP_LARGE = 48;

function clampWidth(value: number): number {
  if (value < MIN_WIDTH) return MIN_WIDTH;
  if (value > MAX_WIDTH) return MAX_WIDTH;
  return Math.round(value);
}

function loadWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
}

function attachDrag(
  startX: number,
  startWidth: number,
  setWidth: (next: number) => void,
  dragCleanupRef: RefObject<(() => void) | null>,
): void {
  let next = startWidth;
  function onMouseMove(event: MouseEvent): void {
    next = clampWidth(startWidth + (startX - event.clientX));
    setWidth(next);
  }
  function detach(): void {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    dragCleanupRef.current = null;
  }
  function onMouseUp(): void {
    detach();
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }
  dragCleanupRef.current = detach;
  document.addEventListener("mousemove", onMouseMove, { passive: true });
  document.addEventListener("mouseup", onMouseUp);
}

export interface ChatPanelResize {
  readonly width: number;
  readonly handleProps: {
    readonly onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
    readonly onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  };
}

/**
 * Drag-to-resize for the right-anchored copilot panel. The handle sits on the
 * panel's left edge, so dragging left widens it. Width persists to localStorage
 * and is keyboard-adjustable (←/→, with shift for a larger step).
 */
export function useChatPanelResize(): ChatPanelResize {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const widthRef = useRef(width);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    setWidth(loadWidth());
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void =>
    attachDrag(event.clientX, widthRef.current, setWidth, dragCleanupRef);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? STEP_LARGE : STEP;
    const next = clampWidth(widthRef.current + (event.key === "ArrowLeft" ? step : -step));
    setWidth(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  };

  return { width, handleProps: { onMouseDown, onKeyDown } };
}
