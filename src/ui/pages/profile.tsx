import { Header, Layout, Section, SkillCard, SkillList } from "../layout.js";

interface Skill {
	name: string;
	version?: string;
}

interface ProfilePageProps {
	namespace: string;
	displayName?: string;
	bio?: string;
	skills: Skill[];
	isAuthenticated?: boolean;
}

export function ProfilePage({
	namespace,
	displayName,
	bio,
	skills,
	isAuthenticated,
}: ProfilePageProps) {
	return (
		<Layout title={`@${namespace}`}>
			<Header isAuthenticated={isAuthenticated} />

			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">@{namespace}</h1>
				{displayName && <p class="mt-1 text-lg text-gray-700">{displayName}</p>}
				{bio && <p class="mt-2 text-sm text-gray-500">{bio}</p>}
			</div>

			<Section title="skills">
				<SkillList>
					{skills.length > 0 ? (
						skills.map((skill) => (
							<SkillCard
								namespace={namespace}
								name={skill.name}
								version={skill.version}
							/>
						))
					) : (
						<p class="text-gray-500 text-sm">No skills published yet.</p>
					)}
				</SkillList>
			</Section>
		</Layout>
	);
}
