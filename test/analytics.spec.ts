import { describe, expect, it, vi } from "vitest";
import {
	type AnalyticsDataset,
	AnalyticsQueries,
	makeAnalytics,
	makeNoOpAnalytics,
} from "../src/analytics/index.js";

describe("Analytics", () => {
	describe("makeAnalytics", () => {
		it("writes data point with correct shape", () => {
			// Arrange
			const mockDataset: AnalyticsDataset = {
				writeDataPoint: vi.fn(),
			};
			const analytics = makeAnalytics(mockDataset);

			// Act
			analytics.trackDownload({
				namespaceId: "ns123456789012345678",
				skillId: "sk123456789012345678",
				namespace: "acme",
				skillName: "docker-compose",
				version: "1.0.0",
				route: "versions",
				bytes: 1234,
				requestId: "abc123",
			});

			// Assert
			expect(mockDataset.writeDataPoint).toHaveBeenCalledWith({
				indexes: ["ns123456789012345678/sk123456789012345678@1.0.0"],
				blobs: [
					"ns123456789012345678",
					"sk123456789012345678",
					"1.0.0",
					"versions",
					"abc123",
					"acme",
					"docker-compose",
				],
				doubles: [1234],
			});
		});

		it("handles missing requestId", () => {
			// Arrange
			const mockDataset: AnalyticsDataset = {
				writeDataPoint: vi.fn(),
			};
			const analytics = makeAnalytics(mockDataset);

			// Act
			analytics.trackDownload({
				namespaceId: "ns123456789012345678",
				skillId: "sk123456789012345678",
				namespace: "user",
				skillName: "skill",
				version: "2.0.0",
				route: "latest",
				bytes: 500,
			});

			// Assert
			expect(mockDataset.writeDataPoint).toHaveBeenCalledWith({
				indexes: ["ns123456789012345678/sk123456789012345678@2.0.0"],
				blobs: [
					"ns123456789012345678",
					"sk123456789012345678",
					"2.0.0",
					"latest",
					"",
					"user",
					"skill",
				],
				doubles: [500],
			});
		});

		it("silently drops events when dataset is null", () => {
			// Arrange
			const analytics = makeAnalytics(null);

			// Act & Assert - should not throw
			expect(() =>
				analytics.trackDownload({
					namespaceId: "ns123456789012345678",
					skillId: "sk123456789012345678",
					namespace: "ns",
					skillName: "skill",
					version: "1.0.0",
					route: "versions",
					bytes: 100,
				}),
			).not.toThrow();
		});
	});

	describe("makeNoOpAnalytics", () => {
		it("does not throw on trackDownload", () => {
			// Arrange
			const analytics = makeNoOpAnalytics();

			// Act & Assert
			expect(() =>
				analytics.trackDownload({
					namespaceId: "ns123456789012345678",
					skillId: "sk123456789012345678",
					namespace: "ns",
					skillName: "skill",
					version: "1.0.0",
					route: "versions",
					bytes: 100,
				}),
			).not.toThrow();
		});
	});

	describe("AnalyticsQueries", () => {
		it("generates topSkills query", () => {
			const query = AnalyticsQueries.topSkills(7);
			expect(query).toContain("SELECT");
			expect(query).toContain("blob6 AS namespace");
			expect(query).toContain("blob7 AS skill_name");
			expect(query).toContain("blob2 AS skill_id");
			expect(query).toContain("INTERVAL '7' DAY");
			expect(query).toContain("ORDER BY downloads DESC");
		});

		it("generates skillDownloads query by skillId", () => {
			const query = AnalyticsQueries.skillDownloads("sk123456789012345678", 30);
			expect(query).toContain("blob3 AS version");
			expect(query).toContain("blob2 = 'sk123456789012345678'");
			expect(query).toContain("INTERVAL '30' DAY");
		});

		it("generates namespaceDownloads query by namespaceId", () => {
			const query = AnalyticsQueries.namespaceDownloads(
				"ns123456789012345678",
				14,
			);
			expect(query).toContain("blob7 AS skill_name");
			expect(query).toContain("blob1 = 'ns123456789012345678'");
			expect(query).toContain("INTERVAL '14' DAY");
		});

		it("generates totalDownloads query", () => {
			const query = AnalyticsQueries.totalDownloads(7);
			expect(query).toContain("SUM(_sample_interval) AS total_downloads");
			expect(query).toContain("INTERVAL '7' DAY");
		});
	});
});
