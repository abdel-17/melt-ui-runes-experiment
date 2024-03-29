import { useFloating, usePortal, type FloatingConfig } from "$lib/internal/actions";
import {
	addEventListener,
	autodisposable,
	builder,
	generateId,
	getPortalDestination,
	identity,
	isBrowser,
	isTouch,
	kbd,
	makeHullFromElements,
	noop,
	pointInPolygon,
	styleToString,
	type IdObj,
} from "$lib/internal/helpers";
import type { ChangeFn } from "$lib/internal/types.js";
import type { TooltipIdParts, TooltipProps } from "./types.js";

// Store a global map to get the currently open tooltip in a given group.
const openTooltips = new Map<string | true, Tooltip>();

type OpenReason = "pointer" | "focus";

export class Tooltip {
	positioning: FloatingConfig = $state(null);
	arrowSize: number = $state(0);
	#open: boolean = $state(false);
	readonly #onOpenChange: ChangeFn<boolean>;
	closeOnPointerDown: boolean = $state(false);
	openDelay: number = $state(0);
	closeDelay: number = $state(0);
	forceVisible: boolean = $state(false);
	closeOnEscape: boolean = $state(false);
	disableHoverableContent: boolean = $state(false);
	group: string | boolean | undefined = $state();
	portal: HTMLElement | string | null = $state(null);
	ids: IdObj<TooltipIdParts> = $state({ content: "", trigger: "" });

	constructor(props: TooltipProps = {}) {
		const {
			positioning = { placement: "bottom" },
			arrowSize = 8,
			open = false,
			onOpenChange = identity,
			closeOnPointerDown = true,
			openDelay = 1000,
			closeDelay = 0,
			forceVisible = false,
			portal = "body",
			closeOnEscape = true,
			disableHoverableContent = false,
			group,
			ids,
		} = props;

		this.positioning = positioning;
		this.arrowSize = arrowSize;
		this.#open = open;
		this.#onOpenChange = onOpenChange;
		this.closeOnPointerDown = closeOnPointerDown;
		this.openDelay = openDelay;
		this.closeDelay = closeDelay;
		this.forceVisible = forceVisible;
		this.portal = portal;
		this.closeOnEscape = closeOnEscape;
		this.disableHoverableContent = disableHoverableContent;
		this.group = group;
		this.ids.content = ids?.content ?? generateId();
		this.ids.trigger = ids?.trigger ?? generateId();
	}

	#openReason: OpenReason | null = $state(null);
	#isMouseInTooltipArea = false;
	#clickedTrigger = false;
	#openTimeout: number | null = null;
	#closeTimeout: number | null = null;

	get open() {
		return this.#open;
	}

	set open(value) {
		this.#open = this.#onOpenChange(value);
		this.#clearOpenTimeout();
		this.#clearCloseTimeout();
	}

	#clearOpenTimeout() {
		if (this.#openTimeout) {
			window.clearTimeout(this.#openTimeout);
			this.#openTimeout = null;
		}
	}

	#clearCloseTimeout() {
		if (this.#closeTimeout) {
			window.clearTimeout(this.#closeTimeout);
			this.#closeTimeout = null;
		}
	}

	get #hidden() {
		return !this.open && !this.forceVisible;
	}

	#getEl(part: TooltipIdParts) {
		if (!isBrowser) return null;
		return document.getElementById(this.ids[part]);
	}

	#openTooltip(reason: OpenReason) {
		this.#clearCloseTimeout();

		if (!this.#openTimeout) {
			this.#openTimeout = window.setTimeout(() => {
				this.open = true;
				// Don't override the reason if it's already set.
				this.#openReason ??= reason;
			}, this.openDelay);
		}
	}

	#closeTooltip(isBlur?: boolean) {
		this.#clearOpenTimeout();

		if (isBlur && this.#isMouseInTooltipArea) {
			// Normally when blurring the trigger, we want to close the tooltip.
			// The exception is when the mouse is still in the tooltip area.
			// In that case, we have to set the openReason to pointer, so that
			// it can close when the mouse leaves the tooltip area.
			this.#openReason = "pointer";
			return;
		}

		if (!this.#closeTimeout) {
			this.#closeTimeout = window.setTimeout(() => {
				this.open = false;
				this.#openReason = null;
				if (isBlur) this.#clickedTrigger = false;
			}, this.closeDelay);
		}
	}

	readonly trigger = this.#createTrigger();

	#createTrigger() {
		const self = this;
		return builder("tooltip-trigger", {
			props: {
				get "aria-describedby"() {
					return self.ids.content;
				},
				get id() {
					return self.ids.trigger;
				},
				onpointerdown() {
					if (!self.closeOnPointerDown) return;
					self.open = false;
					self.#clickedTrigger = true;
				},
				onpointerenter(e: PointerEvent) {
					if (isTouch(e)) return;
					self.#openTooltip("pointer");
				},
				onpointerleave(e: PointerEvent) {
					if (isTouch(e)) return;
					self.#clearOpenTimeout();
				},
				onfocus() {
					if (self.#clickedTrigger) return;
					self.#openTooltip("focus");
				},
				onblur() {
					self.#closeTooltip(true);
				},
				onkeydown: this.#handleKeyDown.bind(this),
			},
		});
	}

	#handleKeyDown(e: KeyboardEvent) {
		if (this.closeOnEscape && e.key === kbd.ESCAPE) {
			this.open = false;
		}
	}

	readonly content = this.#createContent();

	#createContent() {
		const self = this;
		return builder("tooltip-content", {
			props: {
				role: "tooltip",
				tabindex: -1,
				get hidden() {
					return self.#hidden ? true : undefined;
				},
				get style() {
					return self.#hidden ? "display: none;" : undefined;
				},
				get id() {
					return self.ids.content;
				},
				get "data-portal"() {
					return self.portal ? "" : undefined;
				},
				onpointerenter() {
					self.#openTooltip("pointer");
				},
				onpointerdown() {
					self.#openTooltip("pointer");
				},
			},
		});
	}

	readonly arrow = this.#createArrow();

	#createArrow() {
		const self = this;
		return builder("tooltip-arrow", {
			props: {
				"data-arrow": true,
				get style() {
					const size = `var(--arrow-size, ${self.arrowSize}px)`;
					return styleToString({
						position: "absolute",
						width: size,
						height: size,
					});
				},
			},
		});
	}

	readonly dispose = autodisposable(() => {
		$effect(() => {
			const group = this.group;
			if (group === undefined || group === false) return;

			const cleanup = () => {
				if (openTooltips.get(group) === this) {
					openTooltips.delete(group);
				}
			};

			if (!this.open) {
				cleanup();
				return;
			}

			// Close the currently open tooltip in the same group
			// and set this tooltip as the open one.
			const openTooltip = openTooltips.get(group);
			if (openTooltip && openTooltip !== this) {
				openTooltip.open = false;
			}
			openTooltips.set(group, this);
			return cleanup;
		});

		$effect(() => {
			if (!this.open) return;
			return addEventListener(document, "mousemove", (e) => {
				const contentEl = this.#getEl("content");
				const triggerEl = this.#getEl("trigger");
				if (!contentEl || !triggerEl) return;

				const polygonElements = this.disableHoverableContent ? [triggerEl] : [triggerEl, contentEl];
				const polygon = makeHullFromElements(polygonElements);

				this.#isMouseInTooltipArea = pointInPolygon(
					{
						x: e.clientX,
						y: e.clientY,
					},
					polygon,
				);

				if (this.#openReason !== "pointer") return;

				if (!this.#isMouseInTooltipArea) {
					this.#closeTooltip();
				}
			});
		});

		$effect(() => {
			return addEventListener(document, "keydown", this.#handleKeyDown.bind(this));
		});

		let unsubFloating = noop;
		let unsubPortal = noop;

		$effect(() => {
			if (this.#hidden) return;

			const triggerEl = this.#getEl("trigger");
			const contentEl = this.#getEl("content");
			if (!triggerEl || !contentEl) {
				unsubFloating();
				unsubPortal();
				return;
			}

			const floatingReturn = useFloating(triggerEl, contentEl, this.positioning);
			unsubFloating = floatingReturn.destroy;
			if (!this.portal) {
				unsubFloating();
				return;
			}

			const portalDest = getPortalDestination(contentEl, this.portal);
			if (portalDest) {
				const portalReturn = usePortal(contentEl, portalDest);
				if (portalReturn && portalReturn.destroy) {
					unsubPortal = portalReturn.destroy;
				}
			}
		});

		return () => {
			unsubFloating();
			unsubPortal();
		};
	});
}
