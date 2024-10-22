import { getVersionFromString } from "../src/utils";
import { test, expect } from "vitest";

test("getVersionFromString", () => {
	expect(getVersionFromString("stacks-signer 1.0.0 (...")).toBe("1.0.0");
	expect(getVersionFromString("stacks-signer 1.0.0")).toBe("1.0.0");
	expect(
		getVersionFromString(
			"stacks-signer 1528a57 (develop:1528a57, release build, linux [x86_64])",
		),
	).toBe("1528a57");
	expect(
		getVersionFromString(
			"stacks-signer 0.0.1 (:release build, linux [x86_64])",
		),
	).toBe("0.0.1");
	expect(getVersionFromString("")).toEqual("");
});
