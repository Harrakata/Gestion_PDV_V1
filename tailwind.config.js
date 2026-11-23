/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{js,jsx}',
		'./components/**/*.{js,jsx}',
		'./app/**/*.{js,jsx}',
		'./src/**/*.{js,jsx}',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		extend: {
			fontFamily: {
				sans: [
					'Inter',
					'ui-sans-serif',
					'system-ui',
					'-apple-system',
					'BlinkMacSystemFont',
					'"Segoe UI"',
					'sans-serif',
				],
			},
			screens: {
				xs: '420px',
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
				surface: {
					DEFAULT: 'hsl(var(--surface))',
					foreground: 'hsl(var(--surface-foreground))',
					subtle: 'hsl(var(--surface-subtle))',
					elevated: 'hsl(var(--surface-elevated))',
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))',
					muted: 'hsl(var(--success-muted))',
					'muted-foreground': 'hsl(var(--success-muted-foreground))',
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))',
					muted: 'hsl(var(--warning-muted))',
					'muted-foreground': 'hsl(var(--warning-muted-foreground))',
				},
				highlight: {
					DEFAULT: 'hsl(var(--highlight))',
					foreground: 'hsl(var(--highlight-foreground))',
					muted: 'hsl(var(--highlight-muted))',
					'muted-foreground': 'hsl(var(--highlight-muted-foreground))',
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))',
					muted: 'hsl(var(--info-muted))',
					'muted-foreground': 'hsl(var(--info-muted-foreground))',
				},
			},
			// Plancher de lisibilité : text-xs ne descend jamais sous 12 px.
			fontSize: {
				xs: ['var(--text-min)', { lineHeight: 'max(16px, 1rem)' }],
			},
			boxShadow: {
				soft: 'var(--shadow-soft)',
				elevated: 'var(--shadow-elevated)',
				floating: 'var(--shadow-floating)',
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				// Suivent « Arrondi des coins » ; au réglage par défaut (14 px) : 12 et 16 px.
				DEFAULT: 'calc(var(--radius) * 0.286)',
				xl: 'var(--radius-control)',
				'2xl': 'calc(var(--radius) * 1.143)',
				surface: 'var(--radius-surface)',
				// Badges, puces, boutons ronds. `rounded-full` : seulement ce qui est rond par
				// nature (photo, point, jauge, interrupteur).
				pill: 'var(--radius-pill)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: 0 },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: 0 },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
};
