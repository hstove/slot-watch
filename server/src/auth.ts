import type { HonoRequest } from "hono";

export type BasicAuth = { username: string; password: string };
export function getBasicAuth(request: Request): BasicAuth | null {
	const authHeader = request.headers.get("Authorization");

	if (!authHeader || !authHeader.startsWith("Basic ")) {
		return null;
	}

	const base64Credentials = authHeader.split(" ")[1];
	if (!base64Credentials) {
		return null;
	}
	const credentials = atob(base64Credentials);
	const [username, password] = credentials.split(":");
	if (!username || !password) {
		return null;
	}

	return { username, password };
}

export function getNetworkKey(request: Request): string | null {
	const auth = getBasicAuth(request);
	if (!auth) {
		return null;
	}

	if (auth.password !== process.env.OBSERVER_TOKEN) {
		return null;
	}

	return auth.username;
}

export function getBasicAuthHono(request: HonoRequest): BasicAuth | null {
	const authHeader = request.header("Authorization");

	if (!authHeader || !authHeader.startsWith("Basic ")) {
		return null;
	}

	const base64Credentials = authHeader.split(" ")[1];
	if (!base64Credentials) {
		return null;
	}
	const credentials = atob(base64Credentials);
	const [username, password] = credentials.split(":");
	if (!username || !password) {
		return null;
	}

	return { username, password };
}

export function getNetworkKeyHono(request: HonoRequest): string | null {
	const auth = getBasicAuthHono(request);
	if (!auth) {
		return null;
	}

	if (auth.password !== process.env.OBSERVER_TOKEN) {
		console.log("Invalid password", auth.password, process.env.OBSERVER_TOKEN);
		return null;
	}

	return auth.username;
}
