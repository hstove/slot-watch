export function getVersionFromString(version: string) {
	// Handle `stacks-signer VERSION (...);`
	const match = version.match(/^stacks-signer ([^\s]*)/);
	if (match) {
		return match[1];
	}
	return "";
}
