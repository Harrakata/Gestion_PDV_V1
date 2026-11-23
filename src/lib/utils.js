import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Arrondis propres au thème (tailwind.config.js), pour que `cn` les remplace.
const twMerge = extendTailwindMerge({ theme: { borderRadius: ['surface', 'pill'] } });

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}
