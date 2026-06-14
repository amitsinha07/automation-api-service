import { Request, Response } from "express";
import logger from "@ondc/automation-logger";
import { getLoggerMetaData } from "../utils/loggingUtils";
import {
	htmlFormService,
	callbackFormService,
	getRedirectionUrl,
} from "../services/form-service";

export async function htmlFormController(req: Request, res: Response) {
	try {
		logger.info("Received form submission", getLoggerMetaData(req));
		const formData = req.body;
		if (!formData || typeof formData !== "object") {
			res.status(400).send("Invalid form data");
			return;
		}
		if (
			typeof formData.transaction_id !== "string" ||
			typeof formData.subscriber_url !== "string" ||
			typeof formData.form_action_id !== "string"
		) {
			logger.error("Invalid form submission", getLoggerMetaData(req), {
				formData,
			});
			res.status(400).send(
				`Missing required form fields: transaction_id, subscriber_url, or form_action_id
                should be strings`
			);
			return;
		}
		logger.info("formDataaa", formData);
		await htmlFormService(
			formData.transaction_id,
			formData.subscriber_url,
			formData.form_action_id,
			getLoggerMetaData(req),
			formData.form_type,
			formData.submissionId,
			formData.error
		);
		res.status(200).send("Form submitted successfully");
	} catch (error) {
		logger.error(
			"Error processing form submission",
			getLoggerMetaData(req),
			error
		);
		res.status(500).send("Internal Server Error");
	}
}

export async function callbackController(req: Request, res: Response) {
	try {
		// The callback carries no session_id; derive our own subscriberUrl from
		// the callback's own URL ({subscriberUrl}/callback) and look up the
		// workbench URL the frontend stored for it.
		const host = req.get("x-forwarded-host") ?? req.get("host");
		const proto = req.get("x-forwarded-proto") ?? req.protocol;
		const subscriberUrl = `${proto}://${host}${req.baseUrl}${req.path}`.replace(
			/\/callback\/?$/,
			""
		);

		logger.info("Callback received (GET)", getLoggerMetaData(req), {
			subscriberUrl,
		});

		const redirectUrl = await getRedirectionUrl(subscriberUrl);
		if (!redirectUrl) {
			res
				.status(404)
				.type("html")
				.send(
					renderCallbackPage("No redirection URL found for this subscriber.")
				);
			return;
		}

		// sessionId lives inside the stored workbench URL.
		const sessionId = new URL(redirectUrl).searchParams.get("sessionId");
		if (!sessionId) {
			res
				.status(400)
				.type("html")
				.send(
					renderCallbackPage("Stored redirection URL is missing sessionId.")
				);
			return;
		}

		// Reaching the callback means the form finished; only an explicit
		// success=false is treated as a failure.
		const normalizedSuccess = (req.query.success as string) !== "false";
		await callbackFormService(
			sessionId,
			normalizedSuccess,
			"",
			getLoggerMetaData(req)
		);

		res.redirect(302, redirectUrl);
	} catch (error: any) {
		logger.error("Error in callback", getLoggerMetaData(req), error);
		res
			.status(500)
			.type("html")
			.send(renderCallbackPage("Error processing callback."));
	}
}

function renderCallbackPage(message: string): string {
	return (
		`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Callback</title></head>` +
		`<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
		`<p style="font-size:1.1rem;color:#334155">${message}</p></body></html>`
	);
}
