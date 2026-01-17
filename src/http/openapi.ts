import type { Hono } from "hono";
import { generateSpecs } from "hono-openapi";

/**
 * OpenAPI document configuration
 */
const openAPIConfig = {
	documentation: {
		info: {
			title: "OpenSkills API",
			version: "1.0.0",
			description:
				"API for publishing and retrieving skills (markdown documents with semantic versioning)",
		},
		servers: [
			{
				url: "/api/v1",
				description: "API v1",
			},
		],
		tags: [
			{
				name: "skills",
				description: "Skill operations",
			},
			{
				name: "users",
				description: "User profile operations",
			},
		],
	},
};

/**
 * Add OpenAPI endpoint to the app
 */
export function addOpenAPIEndpoint<E extends object>(app: Hono<E>): void {
	app.get("/openapi", async (c) => {
		const spec = await generateSpecs(app, openAPIConfig);
		return c.json(spec);
	});
}
