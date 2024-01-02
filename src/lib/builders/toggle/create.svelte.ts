import {
	addEventListener,
	defineProperties,
	disabledAttr,
	executeCallbacks,
	kbd,
} from "$lib/internal/helpers";
import type { Action } from "svelte/action";
import { ToggleStates } from "./states.svelte";
import type { CreateToggleProps } from "./types";

export function createToggle(props?: CreateToggleProps) {
	const states = new ToggleStates(props);

	function handleClick() {
		if (states.disabled) return;
		states.pressed = !states.pressed;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key !== kbd.ENTER && e.key !== kbd.SPACE) return;
		e.preventDefault();
		handleClick();
	}

	const root: Action<HTMLElement> = (node) => {
		const destroy = executeCallbacks(
			addEventListener(node, "click", handleClick),
			addEventListener(node, "keydown", handleKeyDown),
		);
		return {
			destroy,
		};
	};

	const disabled = $derived(disabledAttr(states.disabled));
	const dataState = $derived(states.pressed ? "on" : "off");
	defineProperties(root, {
		"data-melt-toggle": "",
		type: "button",
		disabled: () => disabled,
		"data-disabled": () => disabled,
		"data-state": () => dataState,
		"aria-pressed": () => states.pressed,
	} as const);

	return {
		root,
		states,
	};
}
