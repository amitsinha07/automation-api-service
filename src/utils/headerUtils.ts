import logger from "@ondc/automation-logger";
import { createAuthorizationHeader } from "ondc-crypto-sdk-nodejs";
import axios from "axios";
import { config } from "../config/registryGatewayConfig";
import { EnvType } from "../types/cache-types";

const createAuthHeader = async (
	payload: any,
	env: EnvType,
	loggerMeta: any
) => {
	try {
		logger.info("Creating Authorization Header", loggerMeta);
		const subId =
			env === "LOGGED-IN"
				? process.env.WORKBENCH_SUBSCRIBER_ID
				: process.env.SUBSCRIBER_ID;
		const header = await createAuthorizationHeader({
			body: JSON.stringify(payload),
			privateKey: process.env.SIGN_PRIVATE_KEY || "",
			subscriberId: subId || "", // Subscriber ID that you get after registering to ONDC Network
			subscriberUniqueKeyId: process.env.UKID || "", // Unique Key Id or uKid that you get after registering to ONDC Network
		});
		logger.info("Authorization Header created successfully", {
			header,
		});
		return header;
	} catch (error: any) {
		logger.error(
			"Error while creating Authorization Header",
			loggerMeta,
			error
		);
		throw new Error("Error while creating Authorization Header");
	}
};

const fetchSubscriberDetails = (header: string, loggingMeta: any) => {
	logger.info("Fetching subscriber details", loggingMeta);
	const keyId: string[] = extractSignatureKeyId(header, loggingMeta);

	if (keyId.length === 0) {
		logger.error("Key ID not found in header", loggingMeta);
		return null;
	}

	// Split the matched keyId value by '|' and destructure the parts if they exist
	const [subscriberId, ukId, _] = keyId[0].split("|");

	// Ensure both subscriberID and ukId are present
	return subscriberId && ukId ? { subscriberId, ukId } : null;
};

function extractSignatureKeyId(input: string, loggingMeta: any): string[] {
	const keyIdRegex = /keyId=\\"([^\\"]+)\\"/g;
	const matches: string[] = [];
	let match;

	while ((match = keyIdRegex.exec(input)) !== null) {
		matches.push(match[1]);
	}
	logger.info("Extracted keyId from header", {
		matches,
		...loggingMeta,
	});
	return matches;
}

async function getPublicKeys(
	header: string,
	payload: any,
	env: EnvType,
	loggerMeta: any
): Promise<string> {
	console.log("env in the getPublicKeys",env)
	logger.info("Getting public keys", loggerMeta);
	try {
		const { subscriberId } =
			fetchSubscriberDetails(header, loggerMeta) || {};
		const domain = payload?.context?.domain;
		if (!subscriberId || !domain) {
			logger.error("Subscriber ID or Domain not found", {
				subscriberId,
				domain,
				...loggerMeta,
			});
			throw new Error("Subscriber ID or Domain not found in request payload");
		}
		const response = await performLookup(subscriberId, domain, env, loggerMeta);
		return response.signing_public_key;
	} catch (error: any) {
		logger.error("Error while getting public keys", loggerMeta, error);
		throw new Error("Error while getting public keys");
	}
}

async function performLookup(
	subId: string,
	domain: string,
	env: EnvType,
	loggingMeta: any
) {
	logger.info("Performing lookup for subscriber details", {
		subscriberId: subId,
		domain,
		env,
		...loggingMeta,
	});
	let baseUrl =
		env === "PRE-PRODUCTION"
			? config.registry.PREPROD
			: config.registry.STAGING;
	if (env === "LOGGED-IN") {
		baseUrl = config.registry.IN_HOUSE_REGISTRY;
	}
	const url = `${baseUrl}lookup`;
	console.log("full url",url)
	const data = {
		subscriber_id: subId,
		domain: domain,
	};
	const header = await createAuthHeader(data, env, loggingMeta);
	try {
		logger.info("Lookup request URL is: " + url, loggingMeta);
		logger.info("Lookup request data", {
			data,
			domain,
			...loggingMeta,
			header: header,
		});
		const response = await axios.post(url, data, {
			headers: {
				"Content-Type": "application/json",
				Authorization: header,
			},
		});
		logger.info("Lookup response received", {
			data: response.data,
			...loggingMeta,
		});
		return response.data[0];
	} catch (error: any) {
		logger.error(
			"Error while performing lookup",
			{
				subscriberId: subId,
				domain,
				env,
				...loggingMeta,
			},
			error
		);
		throw new Error("Error while performing lookup");
	}
}

export { getPublicKeys, createAuthHeader };
