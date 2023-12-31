import plugin from "tailwindcss/plugin";

/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/**/*.{html,js,svelte,ts}"],
	theme: {
		extend: {},
	},
	plugins: [
		plugin(({ addComponents }) => {
			addComponents({
				".btn": {
					...tw("relative inline-flex h-10 items-center justify-center rounded-md border px-6"),
					...tw(
						"before:absolute before:inset-0 before:rounded-[inherit] before:opacity-0 before:transition-[opacity] before:duration-75",
					),
					...tw("hover:before:bg-current hover:before:opacity-[0.08]"),
					...tw("active:before:bg-current active:before:opacity-[0.12]"),
					...tw(
						"disabled:pointer-events-none disabled:border-neutral-300/[0.12] disabled:text-neutral-300/[0.38]",
					),
				},
			});
		}),
	],
};

/**
 * @param {string} className
 */
function tw(className) {
	return { [`@apply ${className}`]: "" };
}
