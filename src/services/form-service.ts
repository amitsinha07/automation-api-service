import { TransactionCacheService } from "./session-service-rewrite";
import logger from "@ondc/automation-logger";
import { RedisService } from "ondc-automation-cache-lib";
export async function htmlFormService(
	transactionId: string,
	subscriberUrl: string,
	formId: string,
	loggerMeta: any,
	formType: "HTML_FORM" | "DYNAMIC_FORM",
	submissionId?: string,
	error?: any

) {
	logger.info("Processing form submission", loggerMeta, {
		transactionId,
		subscriberUrl,
		submissionId,
		formId,
		formType

	});
	const transactService = new TransactionCacheService();
	const transactionData = await transactService.tryLoadTransaction(
		transactionId,
		subscriberUrl
	);
	if (!transactionData) {
		throw new Error("Transaction data not found");
	}
	transactionData.apiList.push({
		entryType: "FORM",
		formId: formId,
		submissionId: submissionId,
		error: error,
		timestamp: new Date().toISOString(),
		formType
	});
	await transactService.overrideTransaction(
		subscriberUrl,
		transactionId,
		transactionData
	);
	logger.info("transactionData=>>>>>>>>>>>", transactionData);
	logger.info("HTML form submission processed successfully", loggerMeta, {
		transactionId,
		subscriberUrl,
		submissionId,
		formId,
	});
}

// Key prefixes and TTL form a cross-service contract with the
// automation-frontend backend — keep in sync.
//   form_completed:{session_id}      -> completion payload (written here)
//   redirection_url:{subscriberUrl}  -> full workbench URL (written by the frontend backend)
const FORM_COMPLETED_PREFIX = "form_completed";
const REDIRECTION_URL_PREFIX = "redirection_url";
const FORM_COMPLETION_TTL_SECONDS = 3600;

// Writes form_completed:{session_id}. Session-scoped — no transaction_id/form_id.
export async function callbackFormService(
	session_id: string,
	success: boolean | string,
	message: string,
	loggerMeta: any
): Promise<void> {
	const completionKey = `${FORM_COMPLETED_PREFIX}:${session_id}`;
	await RedisService.setKey(
		completionKey,
		JSON.stringify({
			completed: true,
			success: success ?? false,
			message: message ?? "",
			timestamp: new Date().toISOString(),
		}),
		FORM_COMPLETION_TTL_SECONDS
	);
	logger.info("Completion flag set in Redis", loggerMeta, {
		session_id,
		completionKey,
	});
}

// Reads the workbench redirect URL saved by the frontend backend, keyed by the
// subscriberUrl the callback derives from its own path.
export async function getRedirectionUrl(
	subscriberUrl: string
): Promise<string | null> {
	return RedisService.getKey(`${REDIRECTION_URL_PREFIX}:${subscriberUrl}`);
}
