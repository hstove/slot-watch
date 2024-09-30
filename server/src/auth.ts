export type BasicAuth = { username: string; password: string };
export function getBasicAuth(request: Request): BasicAuth | null {
	const authHeader = request.headers.get("Authorization");

	if (!authHeader || !authHeader.startsWith("Basic ")) {
		return null;
	}

	const base64Credentials = authHeader.split(" ")[1];
	const credentials = atob(base64Credentials);
	const [username, password] = credentials.split(":");

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
