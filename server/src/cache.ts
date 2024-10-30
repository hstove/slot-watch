import NodeCache from "node-cache";
import type { F, A } from "ts-toolbelt";

const cache = new NodeCache({ stdTTL: 60 * 10 });

export function memoizeCache<Fn extends F.Function>(
	key: F.Function<F.Parameters<Fn>, string>,
	fn: Fn,
): {
	get: F.Function<F.Parameters<Fn>, A.Promise<F.Return<Fn>>>;
	warm: F.Function<F.Parameters<Fn>, A.Promise<F.Return<Fn>>>;
	clear: F.Function<F.Parameters<Fn>, void>;
} {
	return {
		async get(...args: F.Parameters<Fn>) {
			const cached = cache.get<F.Return<Fn>>(key(...args));
			if (cached) {
				return cached;
			}
			const result = await fn(...args);
			cache.set<F.Return<Fn>>(key(...args), result);
			return result;
		},
		async warm(...args: F.Parameters<Fn>) {
			const result = await fn(...args);
			cache.set<F.Return<Fn>>(key(...args), result);
			return result;
		},
		clear(...args: F.Parameters<Fn>) {
			cache.del(key(...args));
		},
	};
}
