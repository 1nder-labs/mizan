import type { KeyboardEvent } from "react";

/**
 * Props that make a non-interactive container (e.g. a table `<tr>`) activatable
 * by keyboard without overriding its implicit ARIA role. Enter and Space fire
 * `onActivate`, matching native button semantics, while the element keeps its
 * native role so a clickable table row stays part of the grid for screen
 * readers.
 *
 * `label` names the action for assistive tech, since a focusable row otherwise
 * gives no signal that it is interactive. Pair with a `focus-visible` ring on
 * the element so sighted keyboard users can see focus.
 */
export interface InteractiveRowProps {
  readonly tabIndex: 0;
  readonly "aria-label": string;
  readonly onClick: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

export function interactiveRowProps(onActivate: () => void, label: string): InteractiveRowProps {
  return {
    tabIndex: 0,
    "aria-label": label,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
